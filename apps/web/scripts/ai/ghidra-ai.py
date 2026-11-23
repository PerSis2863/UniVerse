# Ghidra's add-on (STAGE-5-PLAN.md, "Ghidra, the one AI", step 4; M446): one LoRA add-on for Qwen2.5-Coder 32B (the
# model Cloudflare runs as @cf/qwen/qwen2.5-coder-32b-instruct) that does every skill of Ghidra's exam better.
#
# How it learns: a stronger open teacher (Qwen2.5-72B-Instruct) first writes new material the exam never shows (course
# passages with questions, products, names, towns); the exam's own papers then make other questions from it
# (scripts/ai/ghidra-exam.mjs --lessons requests); the teacher answers each twice, and only an answer that passes that
# skill's rules (--lessons mark) becomes a lesson. No Gemini answers are lessons (Google's terms). The add-on is trained
# on the lessons (hyperion-ai.py train), then the exam is asked of the model with and without it: wins.json lists the
# skills where it scores higher, the only ones the website sends to it.
#
#   python3 scripts/ai/ghidra-ai.py material --dir DIR            the teacher's new material → DIR/material.json
#   python3 scripts/ai/ghidra-ai.py data     --dir DIR [--per 80] questions, answers, rules → DIR/lessons.jsonl
#   python3 scripts/ai/ghidra-ai.py score    --dir DIR            the exam before and after → DIR/exam-*, DIR/wins.json
#   (training, export and upload are hyperion-ai.py's; scripts/ai/ghidra-gpu.sh runs it all)
import argparse, importlib.util, json, os, random, re, subprocess, sys, time, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1]
_spec = importlib.util.spec_from_file_location('hyperion_ai', HERE / 'hyperion-ai.py')
h = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(h)

TEACHER = os.environ.get('TEACHER', 'Qwen/Qwen2.5-72B-Instruct-AWQ')
STUDENT = h.TEACHER  # Qwen2.5-Coder-32B-Instruct-AWQ: what the add-on is scored on (Cloudflare runs the same model)
EXAM = 'scripts/ai/ghidra-exam.mjs'

def node(args, stdin=None):
    p = subprocess.run(['node', EXAM, *args], cwd=WEB, input=stdin, capture_output=True, text=True)
    if p.returncode: raise SystemExit(f'{EXAM} {" ".join(args)} failed:\n{p.stderr[-2000:]}')
    return [json.loads(l) for l in p.stdout.splitlines() if l.strip()]

def json_list(text):
    m = re.search(r'\[[\s\S]*\]', text or '')
    try: v = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError: return []
    return v if isinstance(v, list) else []

# ——— New material ———

SUBJECTS = ['biology', 'chemistry', 'physics', 'world history', 'geography', 'economics', 'computer science', 'mathematics', 'climate and energy',
            'literature', 'psychology', 'sociology', 'medicine and health', 'engineering', 'art history', 'philosophy', 'politics and law',
            'business and marketing', 'astronomy', 'environmental science', 'music', 'linguistics', 'agriculture and food', 'statistics']
NAMES = ['Aiko', 'Bilal', 'Carmen', 'Dmitri', 'Esther', 'Farid', 'Grace', 'Hamza', 'Isla', 'Jamal', 'Keiko', 'Luca', 'Maya', 'Nikhil', 'Olga', 'Pablo',
         'Rania', 'Samuel', 'Talia', 'Umar', 'Vera', 'Wen', 'Xavier', 'Yara', 'Zane', 'Amara', 'Diego', 'Freya', 'Ishaan', 'Leila']

def cmd_material(a):
    d = Path(a.dir); d.mkdir(parents=True, exist_ok=True)
    if (d / 'material.json').exists(): print('material.json is there already'); return
    llm = h.teacher(max_len=8192, model=TEACHER)
    ask = lambda s: [{'role': 'user', 'content': s}]
    outs = h.chat(llm, [ask(f'Write 4 short passages from a university course in {s}, each on a different topic. Each passage: 3 plain, '
                             'correct textbook sentences (no dates or numbers you are unsure of). For each, 2 questions the passage answers, '
                             'each with 1–3 short words or phrases a right answer must contain. Reply with a JSON list of objects: '
                             '{"course": course name, "code": a code like "BIO210", "title": the topic, "text": the passage, '
                             '"asks": [[question, [words]], [question, [words]]]}.') for s in SUBJECTS], temp=0.8, max_tokens=2500)
    passages = [p for o in outs for p in json_list(o[0]) if isinstance(p, dict) and isinstance(p.get('text'), str) and isinstance(p.get('asks'), list)
                and all(isinstance(q, list) and len(q) == 2 and isinstance(q[0], str) and isinstance(q[1], list) and q[1] for q in p['asks']) and p['asks']]
    outs = h.chat(llm, [ask('Invent 5 realistic consumer products sold with a digital product passport, each a different kind. Reply with a JSON list of objects: '
                            '{"product": name, "kind": what it is, "brand": an invented brand, "warranty": 0, 6, 12, 24 or 36 (months), "origin": a country, '
                            '"made": a date like 2026-03-14, "materials": a short phrase or null, "recall": null for most; for about one in four '
                            '{"severity": "HIGH" or "MEDIUM", "reason": "...", "advice": "..."}}.') for _ in range(8)], temp=1.0, max_tokens=2000)
    products = [p for o in outs for p in json_list(o[0]) if isinstance(p, dict) and p.get('product') and isinstance(p.get('warranty'), int)]
    for p in products:
        if not p.get('recall'): p.pop('recall', None)
        if not p.get('materials'): p.pop('materials', None)
    geo = json.loads((WEB / 'public/geo/destinations.json').read_text(encoding='utf-8'))
    exam_cities = set(re.findall(r"'([^']+)'", re.search(r'CITIES = \[(.*?)\];', (WEB / 'src/server/ghidra/exam/material.ts').read_text(encoding='utf-8'), re.S).group(1)))
    cities = sorted({p[0] for p in geo['places'] if p[4] >= 300 and p[0] not in exam_cities})
    random.Random(5).shuffle(cities)
    m = {'passages': passages, 'products': products, 'cities': cities[:80], 'first': NAMES}
    (d / 'material.json').write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'material: {len(passages)} passages, {len(products)} products, {len(m["cities"])} towns, {len(NAMES)} names', flush=True)

# ——— Lessons ———

def cmd_data(a):
    d = Path(a.dir)
    if (d / 'lessons.jsonl').exists(): print('lessons.jsonl is there already'); return
    args = ['--lessons', 'requests', '--per', str(a.per), '--salt', '1', '--material', str(d / 'material.json')]
    reqs = node(args)
    print(f'{len(reqs)} questions for the teacher', flush=True)
    llm = h.teacher(max_len=12288, model=TEACHER)
    outs = h.chat(llm, [[{'role': 'system', 'content': r['system']}, {'role': 'user', 'content': r['prompt']}] for r in reqs], temp=0.6, max_tokens=6000, n=2)
    del llm
    lines = '\n'.join(json.dumps({'id': r['id'], 'answer': t}) for r, ts in zip(reqs, outs) for t in ts)
    marks = node(['--lessons', 'mark', *args[2:]], stdin=lines)
    by = {r['id']: r for r in reqs}
    kept, why = {}, {}
    for m in marks:
        if not m['failed']:
            kept.setdefault(m['id'], m['clean'])
        for f in m['failed']: why[f"{by[m['id']]['skill']}: {f}"] = why.get(f"{by[m['id']]['skill']}: {f}", 0) + 1
    with open(d / 'lessons.jsonl', 'w', encoding='utf-8') as fh:
        for i, a_ in kept.items():
            r = by[i]
            if len(r['system']) + len(r['prompt']) + len(a_) > 14000: continue  # longer than training's 4,096 tokens: cut, it would teach a broken answer
            fh.write(json.dumps({'skill': r['skill'], 'system': r['system'], 'q': r['prompt'], 'a': a_, 'held': False}, ensure_ascii=False) + '\n')
    per = {}
    for i in kept: per[by[i]['skill']] = per.get(by[i]['skill'], 0) + 1
    print(f'{len(kept)} lessons from {len(reqs)} questions: ' + ', '.join(f'{k} {v}' for k, v in sorted(per.items())), flush=True)
    print('answers refused, by rule: ' + ', '.join(f'{k} {v}' for k, v in sorted(why.items(), key=lambda kv: -kv[1])[:15]), flush=True)

# ——— Score ———

def serve(lora):
    """vLLM's OpenAI-style server on this machine with the student model, and the add-on as "ghidra"."""
    cmd = [sys.executable, '-m', 'vllm.entrypoints.openai.api_server', '--model', STUDENT, '--served-model-name', 'base', '--max-model-len', '12288',
           '--gpu-memory-utilization', '0.9', '--enable-lora', '--max-lora-rank', '32', '--lora-modules', f'ghidra={lora}', '--port', '8011']
    p = subprocess.Popen(cmd, stdout=open('/tmp/vllm-score.log', 'w'), stderr=subprocess.STDOUT)
    for _ in range(180):
        try:
            urllib.request.urlopen('http://127.0.0.1:8011/v1/models', timeout=5); return p
        except Exception:
            if p.poll() is not None: raise SystemExit('The model server stopped: see /tmp/vllm-score.log')
            time.sleep(10)
    raise SystemExit('The model server did not start in 30 minutes')

def cmd_score(a):
    d = Path(a.dir); p = serve(d / 'lora')
    try:
        for model in ('base', 'ghidra'):
            if not (d / f'exam-{model}' / 'card.json').exists():
                subprocess.run(['node', EXAM, '--via', 'openai', '--url', 'http://127.0.0.1:8011/v1', '--model', model, '--jobs', '24', '--out', str(d / f'exam-{model}')], cwd=WEB, check=True)
    finally:
        p.terminate()
    before, after = (json.loads((d / f'exam-{m}' / 'card.json').read_text()) for m in ('base', 'ghidra'))
    wins = sorted(s for s in after if after[s]['score'] is not None and before.get(s, {}).get('score') is not None and after[s]['score'] > before[s]['score'])
    (d / 'wins.json').write_text(json.dumps(wins))
    total = lambda c: (sum(v['passed'] for v in c.values()), sum(v['asked'] for v in c.values()))
    (bp, ba), (ap, aa) = total(before), total(after)
    print(f'before: {bp} of {ba} ({100 * bp / max(1, ba):.0f}%); with the add-on: {ap} of {aa} ({100 * ap / max(1, aa):.0f}%)', flush=True)
    print('higher with the add-on (wins.json): ' + ', '.join(f"{s} {before[s]['score']}→{after[s]['score']}" for s in wins), flush=True)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('material'); p.add_argument('--dir', required=True)
    p = sub.add_parser('data'); p.add_argument('--dir', required=True); p.add_argument('--per', type=int, default=80)
    p = sub.add_parser('score'); p.add_argument('--dir', required=True)
    a = ap.parse_args()
    {'material': cmd_material, 'data': cmd_data, 'score': cmd_score}[a.cmd](a)
