# Hyperion's AI (M435): teaches Qwen2.5-Coder 32B (Apache-2.0, the model Cloudflare runs as
# @cf/qwen/qwen2.5-coder-32b-instruct) to write MATLAB / Octave code that runs in Hyperion, as a LoRA add-on that
# Cloudflare serves on top of it. On a rented graphics card (scripts/ai/hyperion-gpu.sh runs it all; the owner's steps
# in scripts/ai/hyperion-gpu.md). The idea: the teacher (the same model, 4-bit) writes requests and answers for every
# function Hyperion has; Hyperion's own engine runs each answer (scripts/ai/hyperion-lab.mjs); only answers that really
# run are kept, and a failed one gets one chance to be fixed from its error (a lesson in fixing too). The add-on learns
# from those, with Hyperion's short instructions (src/lib/hyperion-ai.ts), so it no longer needs the list of functions.
#
#   python3 scripts/ai/hyperion-ai.py data  --dir DIR [--per 6]        requests, answers, runs, fixes → DIR/lessons.jsonl
#   python3 scripts/ai/hyperion-ai.py train --dir DIR [--epochs 2]     the LoRA add-on → DIR/lora
#   python3 scripts/ai/hyperion-ai.py score --dir DIR                  held-out requests: how many run, before and after
#   python3 scripts/ai/hyperion-ai.py export --dir DIR --to OUT        the two files Cloudflare takes
#   python3 scripts/ai/hyperion-ai.py upload --from OUT                 straight to the owner's Cloudflare (Workers AI), tried once
#       (needs CLOUDFLARE_API_TOKEN with "Workers AI: Edit", given to the machine as a RunPod secret; never printed)
import argparse, json, random, re, subprocess
from pathlib import Path

TEACHER = 'Qwen/Qwen2.5-Coder-32B-Instruct-AWQ'          # Apache-2.0; vLLM, about 19 GB
STUDENT = 'unsloth/Qwen2.5-Coder-32B-Instruct-bnb-4bit'   # the same model in 4 bits, for training the add-on
WEB = Path(__file__).resolve().parents[2]                 # apps/web

def lab(cmd, lines=None):
    p = subprocess.run(['node', 'scripts/ai/hyperion-lab.mjs', cmd], cwd=WEB, input=lines, capture_output=True, text=True, check=True)
    return p.stdout

def run_all(codes):
    """Each script through Hyperion's engine: {ok, out, error, figures} in the same order."""
    if not codes: return []
    out = lab('run', ''.join(json.dumps({'id': str(i), 'code': c}) + '\n' for i, c in enumerate(codes)))
    got = {r['id']: r for r in map(json.loads, out.splitlines())}
    return [got[str(i)] for i in range(len(codes))]

def code_of(answer):  # as codeOf in src/lib/hyperion-ai.ts
    blocks = re.findall(r'```(?:matlab|octave|m)?[^\S\n]*\n([\s\S]*?)```', answer, re.I)
    return blocks[-1].strip() if blocks else None

def teacher(max_len=4096):
    from vllm import LLM
    import torch
    mem = torch.cuda.get_device_properties(0).total_memory / 2**30
    return LLM(TEACHER, max_model_len=max_len, gpu_memory_utilization=0.92 if mem < 40 else 0.85, enforce_eager=mem < 40)

def chat(llm, prompts, temp=0.7, max_tokens=900, n=1):
    from vllm import SamplingParams
    outs = llm.chat(prompts, SamplingParams(temperature=temp, top_p=0.95, max_tokens=max_tokens, n=n), use_tqdm=True)
    return [[c.text for c in o.outputs] for o in outs]

def cmd_data(a):
    d = Path(a.dir); d.mkdir(parents=True, exist_ok=True)
    funcs = json.loads(lab('help'))
    system = lab('prompt').strip()
    names = ', '.join(f['name'] for f in funcs)
    rich = f'{system}\nThe functions Hyperion has (use no others): {names}.'
    llm = teacher()
    # 1. requests people would make, for every function, from beginners to engineers
    ask = [[{'role': 'user', 'content': f'Hyperion has the function {f["name"]}: {f["syntax"]}. {f["text"]} (section: {f["section"]}).\n'
             f'Write {a.per} different, realistic requests a student, scientist or engineer might type to Hyperion’s assistant where this '
             'function is useful: some short and simple, some a small real task (data, physics, signals, finance, plots), some asking to '
             'explain or fix code. Each request must be doable with only Hyperion’s functions. Reply with a JSON list of strings only.'}] for f in funcs]
    reqs = []
    for f, outs in zip(funcs, chat(llm, ask, temp=0.9, max_tokens=700)):
        m = re.search(r'\[[\s\S]*\]', outs[0])
        try: got = [x for x in json.loads(m.group(0)) if isinstance(x, str) and 8 < len(x) < 600] if m else []
        except json.JSONDecodeError: got = []
        reqs += [{'fn': f['name'], 'q': q} for q in got[: a.per]]
    random.Random(7).shuffle(reqs)
    held = set(random.Random(7).sample(sorted({r['fn'] for r in reqs}), 25))  # 25 whole functions held out: the score is on requests it never saw
    print(f'{len(reqs)} requests for {len(funcs)} functions', flush=True)
    # 2. answers (two tries each), run in Hyperion
    answers = chat(llm, [[{'role': 'system', 'content': rich}, {'role': 'user', 'content': r['q']}] for r in reqs], temp=0.6, n=2)
    lessons, failed = [], []
    tries = [(i, t) for i, outs in enumerate(answers) for t in outs]
    results = run_all([code_of(t) or '' for _, t in tries])
    done, first = set(), {}
    for (i, t), res in zip(tries, results):
        first.setdefault(i, (t, res))
        if i in done: continue
        if code_of(t) and res['ok']:
            done.add(i); lessons.append({**reqs[i], 'a': t.strip(), 'kind': 'answer'})
    for i, (t, res) in first.items():
        if i not in done and code_of(t): failed.append((i, t, res['error']))
    print(f'answers that ran: {len(done)} of {len(reqs)}; fixing {len(failed)}', flush=True)
    # 3. one chance to fix each failed answer from Hyperion's own error (kept as a fixing lesson too)
    fix_q = [f'This script gives an error in Hyperion:\n```matlab\n{code_of(t)}\n```\nThe error: {err}\nFix it.' for _, t, err in failed]
    fixes = chat(llm, [[{'role': 'system', 'content': rich}, {'role': 'user', 'content': q}] for q in fix_q], temp=0.3)
    fixed = run_all([code_of(o[0]) or '' for o in fixes])
    for (i, _, _), q, o, res in zip(failed, fix_q, fixes, fixed):
        if code_of(o[0]) and res['ok']:
            lessons.append({'fn': reqs[i]['fn'], 'q': q, 'a': o[0].strip(), 'kind': 'fix'})
    with open(d / 'lessons.jsonl', 'w', encoding='utf-8') as fh:
        for x in lessons: fh.write(json.dumps({**x, 'held': x['fn'] in held}, ensure_ascii=False) + '\n')
    with open(d / 'held.jsonl', 'w', encoding='utf-8') as fh:
        for r in reqs:
            if r['fn'] in held: fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    (d / 'system.txt').write_text(system, encoding='utf-8')
    print(f'{len(lessons)} lessons ({sum(x["kind"] == "fix" for x in lessons)} of them fixes) → {d / "lessons.jsonl"}', flush=True)

def cmd_train(a):
    from unsloth import FastLanguageModel  # first: it patches the libraries below
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer
    d = Path(a.dir); system = (d / 'system.txt').read_text(encoding='utf-8')
    rows = [json.loads(l) for l in open(d / 'lessons.jsonl', encoding='utf-8')]
    rows = [r for r in rows if not r['held']]
    model, tok = FastLanguageModel.from_pretrained(STUDENT, max_seq_length=a.seq, load_in_4bit=True)
    # rank 8 on every layer: about 135 MB, inside Cloudflare's limits (rank 32 or less, under 300 MB)
    model = FastLanguageModel.get_peft_model(model, r=a.rank, lora_alpha=2 * a.rank, lora_dropout=0,
                                             target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
                                             use_gradient_checkpointing='unsloth', random_state=7)
    text = [tok.apply_chat_template([{'role': 'system', 'content': system}, {'role': 'user', 'content': r['q']}, {'role': 'assistant', 'content': r['a']}], tokenize=False) for r in rows]
    trainer = SFTTrainer(model=model, tokenizer=tok, train_dataset=Dataset.from_dict({'text': text}),
                         args=SFTConfig(dataset_text_field='text', max_seq_length=a.seq, per_device_train_batch_size=1, gradient_accumulation_steps=8,
                                        num_train_epochs=a.epochs, learning_rate=1e-4, warmup_ratio=0.03, lr_scheduler_type='cosine', logging_steps=10,
                                        save_steps=200, save_total_limit=2, output_dir=str(d / 'checkpoints'), bf16=True, optim='adamw_8bit', report_to='none'))
    last = sorted((d / 'checkpoints').glob('checkpoint-*'), key=lambda p: int(p.name.split('-')[1]))
    trainer.train(resume_from_checkpoint=str(last[-1]) if last else None)
    model.save_pretrained(d / 'lora'); tok.save_pretrained(d / 'lora')
    print(f'trained on {len(rows)} lessons → {d / "lora"}', flush=True)

def cmd_score(a):
    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest
    d = Path(a.dir); system = (d / 'system.txt').read_text(encoding='utf-8')
    held = [json.loads(l) for l in open(d / 'held.jsonl', encoding='utf-8')][: a.n]
    llm = LLM(TEACHER, max_model_len=4096, gpu_memory_utilization=0.9, enable_lora=True, max_lora_rank=32, enforce_eager=True)
    msgs = [[{'role': 'system', 'content': system}, {'role': 'user', 'content': r['q']}] for r in held]
    sp = SamplingParams(temperature=0, max_tokens=900)
    for name, lora in (('before (no add-on)', None), ('after (with the add-on)', LoRARequest('hyperion', 1, str(d / 'lora')))):
        outs = [o.outputs[0].text for o in llm.chat(msgs, sp, lora_request=lora, use_tqdm=True)]
        res = run_all([code_of(t) or '' for t in outs])
        ran = sum(bool(code_of(t)) and r['ok'] for t, r in zip(outs, res))
        print(f'{name}: {ran} of {len(held)} answers ran in Hyperion ({100 * ran / max(1, len(held)):.0f}%)', flush=True)

def cmd_export(a):
    import shutil
    src, to = Path(a.dir) / 'lora', Path(a.to); to.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((src / 'adapter_config.json').read_text())
    assert cfg['r'] <= 32, 'Cloudflare takes rank 32 or less'
    cfg['model_type'] = a.model_type  # Cloudflare asks for this field (see scripts/ai/hyperion-gpu.md, step 6)
    cfg['base_model_name_or_path'] = 'Qwen/Qwen2.5-Coder-32B-Instruct'
    (to / 'adapter_config.json').write_text(json.dumps(cfg, indent=2))
    shutil.copy(src / 'adapter_model.safetensors', to / 'adapter_model.safetensors')
    mb = (to / 'adapter_model.safetensors').stat().st_size / 1e6
    assert mb < 300, f'{mb:.0f} MB: Cloudflare takes under 300 MB (train with a smaller --rank)'
    print(f'→ {to}: adapter_model.safetensors ({mb:.0f} MB) and adapter_config.json')

CF = 'https://api.cloudflare.com/client/v4'
MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct'

def cmd_upload(a):
    """Creates the finetune on the owner's Cloudflare account, uploads the two files, and asks it one question with the
    add-on. Cloudflare's page lists model_type mistral, gemma and llama only: if the first try's answer fails, the add-on
    is uploaded again as "llama" under a second name. Prints the name to set as HYPERION_LORA. The token is never printed."""
    import os, time
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
    if not token: raise SystemExit('No CLOUDFLARE_API_TOKEN: skipped (download the files and upload them by hand, scripts/ai/hyperion-gpu.md step 6)')
    import requests  # in the vLLM tools' folder
    h = {'Authorization': f'Bearer {token}'}
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
    if not account:
        got = requests.get(f'{CF}/accounts', headers=h, timeout=60).json().get('result') or []
        if len(got) != 1: raise SystemExit(f'The token reaches {len(got)} Cloudflare accounts: set CLOUDFLARE_ACCOUNT_ID too')
        account = got[0]['id']
    src = Path(a.src)
    def one(name, model_type):
        cfg = json.loads((src / 'adapter_config.json').read_text()); cfg['model_type'] = model_type
        tmp = src / f'adapter_config.{model_type}.json'; tmp.write_text(json.dumps(cfg, indent=2))
        r = requests.post(f'{CF}/accounts/{account}/ai/finetunes', headers=h, json={'model': MODEL, 'name': name, 'description': "UniVerse's Hyperion add-on"}, timeout=60).json()
        if not r.get('success'): return f'could not create {name}: {r.get("errors")}'
        fid = r['result']['id']
        for remote, local in (('adapter_model.safetensors', src / 'adapter_model.safetensors'), ('adapter_config.json', tmp)):
            with open(local, 'rb') as fh:
                u = requests.post(f'{CF}/accounts/{account}/ai/finetunes/{fid}/finetune-assets', headers=h, data={'file_name': remote}, files={'file': (remote, fh)}, timeout=600).json()
            if not u.get('success'): return f'could not upload {remote} to {name}: {u.get("errors")}'
        time.sleep(20)
        t = requests.post(f'{CF}/accounts/{account}/ai/run/{MODEL}', headers=h, timeout=120,
                          json={'messages': [{'role': 'user', 'content': 'Write Hyperion code that prints the sum of 1 to 10.'}], 'lora': name, 'max_tokens': 200}).json()
        if not t.get('success'): return f'{name} was uploaded, but a test question failed: {t.get("errors")}'
        answer = t['result'].get('response') if isinstance(t['result'], dict) else t['result']
        print(f'Test question answered by "{name}":\n{str(answer)[:400]}', flush=True)
        return None
    stamp = time.strftime('%Y%m%d-%H%M')
    for name, model_type in ((f'hyperion-{stamp}', a.model_type), (f'hyperion-{stamp}-llama', 'llama')):
        err = one(name, model_type)
        if not err:
            (src / 'cloudflare.txt').write_text(f'HYPERION_LORA={name}\n')
            print(f'UPLOADED. In Cloudflare, set the variable HYPERION_LORA to: {name}', flush=True); return
        print(f'Try with model_type "{model_type}": {err}', flush=True)
    raise SystemExit('The upload to Cloudflare did not work: the files are still on this machine (scripts/ai/hyperion-gpu.md step 6)')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('data'); p.add_argument('--dir', required=True); p.add_argument('--per', type=int, default=6)
    p = sub.add_parser('train'); p.add_argument('--dir', required=True); p.add_argument('--epochs', type=float, default=2); p.add_argument('--rank', type=int, default=8); p.add_argument('--seq', type=int, default=1536)
    p = sub.add_parser('score'); p.add_argument('--dir', required=True); p.add_argument('--n', type=int, default=150)
    p = sub.add_parser('upload'); p.add_argument('--from', dest='src', required=True); p.add_argument('--model-type', default='qwen2')
    p = sub.add_parser('export'); p.add_argument('--dir', required=True); p.add_argument('--to', required=True); p.add_argument('--model-type', default='qwen2')
    a = ap.parse_args()
    {'data': cmd_data, 'train': cmd_train, 'score': cmd_score, 'export': cmd_export, 'upload': cmd_upload}[a.cmd](a)
