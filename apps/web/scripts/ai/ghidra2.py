# Ghidra 2 (M368): UniVerse's own chat model, trained from nothing, after MiniMind's design
# (github.com/jingyaogong/minimind, Apache-2.0; the code is written for UniVerse, not copied): it reads word-pieces
# (byte-level BPE, so any language and any character works) instead of single letters; RMSNorm, rotary positions (RoPE),
# grouped-query attention and a SwiGLU feed-forward, as Llama, Qwen and MiniMind use; two stages: pretraining on plain
# text, then learning to chat (questions and answers, the loss only on the answers).
#
# Runs on a graphics card (CUDA, much faster: see scripts/ai/ghidra2-gpu.md) or the processor (small sizes only).
# From apps/web, with PyTorch, tokenizers and pyarrow installed:
#   python3 scripts/ai/ghidra2.py tokenizer --out DIR text1.txt text2.txt          learn the word-pieces (8,192)
#   python3 scripts/ai/ghidra2.py chat --out DIR/chat.jsonl --oasst oasst1.parquet  questions and answers to learn
#   python3 scripts/ai/ghidra2.py pretrain --dir DIR --preset small --steps N text1.txt text2.txt
#   python3 scripts/ai/ghidra2.py sft --dir DIR --steps N                           learn to chat (needs pretrain)
#   python3 scripts/ai/ghidra2.py export --dir DIR --to public/ai                   ghidra2-*.bin + ghidra2.json
# Or start from MiniMind-3's own trained model (64 M, Apache-2.0, Qwen3's design; the owner, 22 Nov: "integrate the 64m of
# minimind and after that start from there") instead of pretraining, then teach it to chat as Ghidra:
#   python3 scripts/ai/ghidra2.py adopt --hf MINIMIND3_FOLDER --dir DIR           (its config, weights, word-pieces)
#   python3 scripts/ai/ghidra2.py chat --out DIR/chat.jsonl --oasst oasst1.parquet && python3 scripts/ai/ghidra2.py sft --dir DIR --steps N
# Teach it to think first, the way DeepSeek-R1's answers do (M372; the owner, 22 Nov: "i want to build my own deepseek ai"):
#   python3 scripts/ai/ghidra2.py reason --out DIR/reason.jsonl --gsm8k train.parquet   (GSM8K, MIT: worked maths steps)
#   python3 scripts/ai/ghidra2.py write --out DIR/write.jsonl --smoltalk smol-smoltalk.parquet --tok DIR/tokenizer.json
#       (M369: everyday writing, emails, rewrites, summaries, code; HuggingFaceTB/smol-smoltalk, Apache-2.0)
#   python3 scripts/ai/ghidra2.py sft --dir DIR --stage think --from sft --data chat.jsonl,reason.jsonl,write.jsonl --steps N
#   python3 scripts/ai/ghidra2.py score --dir DIR --gsm8k test.parquet --n 100           (how many it gets right)
# Long runs: --until N stops after step N, the next run with the same command carries on (DIR/state-*.pt).
import argparse, json, math, os, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

SPECIAL = ['<|endoftext|>', '<|user|>', '<|ghidra|>', '<|end|>']
PRESETS = {
    # This computer's processor: ~8 M numbers.
    'small': dict(layers=6, dim=288, heads=6, kv=2, block=512, batch=16, lr=1e-3),
    # A rented graphics card (MiniMind-3's size): ~64 M numbers.
    'base': dict(layers=8, dim=768, heads=8, kv=4, block=1024, batch=32, lr=6e-4),
}
IDENTITY = 'Ghidra, UniVerse’s own AI'
HERE = Path(__file__).resolve()


# ─── The model ─────────────────────────────────────────────────────────────────────────────────────
class RMSNorm(nn.Module):
    def __init__(s, d):
        super().__init__(); s.weight = nn.Parameter(torch.ones(d))
    def forward(s, x):
        return x * torch.rsqrt(x.float().pow(2).mean(-1, keepdim=True) + 1e-6).type_as(x) * s.weight

def rope(T, hd, theta=1e6, device='cpu'):
    f = 1.0 / theta ** (torch.arange(0, hd, 2, device=device).float() / hd)
    a = torch.outer(torch.arange(T, device=device).float(), f)  # [T, hd/2]
    return a.cos(), a.sin()

def rotate(x, cos, sin):  # x [B, H, T, hd]: the first and second halves of each head turn as pairs
    h = x.shape[-1] // 2
    x1, x2 = x[..., :h], x[..., h:]
    return torch.cat([x1 * cos - x2 * sin, x2 * cos + x1 * sin], dim=-1)

def ffn_size(d): return 64 * math.ceil(int(8 * d / 3) / 64)

class Block(nn.Module):
    def __init__(s, c):
        super().__init__()
        d, h, kv = c['dim'], c['heads'], c['kv']; hd = c.get('head_dim') or d // h
        s.h, s.kv, s.hd = h, kv, hd
        s.attn_norm, s.mlp_norm = RMSNorm(d), RMSNorm(d)
        s.wq, s.wk, s.wv, s.wo = nn.Linear(d, h * hd, bias=False), nn.Linear(d, kv * hd, bias=False), nn.Linear(d, kv * hd, bias=False), nn.Linear(h * hd, d, bias=False)
        s.qk = bool(c.get('qk_norm'))  # Qwen3 (MiniMind-3): each head's query and key normalised before turning
        if s.qk: s.q_norm, s.k_norm = RMSNorm(hd), RMSNorm(hd)
        f = c.get('ffn') or ffn_size(d)
        s.w1, s.w3, s.w2 = nn.Linear(d, f, bias=False), nn.Linear(d, f, bias=False), nn.Linear(f, d, bias=False)
    def forward(s, x, cos, sin):
        B, T, _ = x.shape
        y = s.attn_norm(x)
        q = s.wq(y).view(B, T, s.h, s.hd)
        k = s.wk(y).view(B, T, s.kv, s.hd)
        if s.qk: q, k = s.q_norm(q), s.k_norm(k)
        q, k = q.transpose(1, 2), k.transpose(1, 2)
        v = s.wv(y).view(B, T, s.kv, s.hd).transpose(1, 2)
        q, k = rotate(q, cos, sin), rotate(k, cos, sin)
        k, v = k.repeat_interleave(s.h // s.kv, dim=1), v.repeat_interleave(s.h // s.kv, dim=1)
        y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        x = x + s.wo(y.transpose(1, 2).reshape(B, T, -1))
        y = s.mlp_norm(x)
        return x + s.w2(F.silu(s.w1(y)) * s.w3(y))

class GPT(nn.Module):
    def __init__(s, c):
        super().__init__()
        s.c = c
        s.tok = nn.Embedding(c['vocab'], c['dim'])
        s.blocks = nn.ModuleList(Block(c) for _ in range(c['layers']))
        s.norm = RMSNorm(c['dim'])
        for n, p in s.named_parameters():
            if p.dim() == 2: nn.init.normal_(p, 0, 0.02 / (math.sqrt(2 * c['layers']) if n.endswith(('wo.weight', 'w2.weight')) else 1))
    def forward(s, idx, targets=None):
        T = idx.shape[1]
        cos, sin = rope(T, s.c.get('head_dim') or s.c['dim'] // s.c['heads'], theta=s.c.get('theta', 1e6), device=idx.device)
        x = s.tok(idx)
        for b in s.blocks: x = b(x, cos, sin)
        logits = s.norm(x) @ s.tok.weight.T  # the output shares the input's table
        if targets is None: return logits, None
        return logits, F.cross_entropy(logits.float().view(-1, logits.shape[-1]), targets.view(-1), ignore_index=-100)
    def tables(s):
        """Every weight in the order the browser reads them (src/lib/ghidra2.ts)."""
        out = [('tok', s.tok.weight)]
        for i, b in enumerate(s.blocks):
            out += [(f'b{i}.attn_norm', b.attn_norm.weight), (f'b{i}.wq', b.wq.weight), (f'b{i}.wk', b.wk.weight), (f'b{i}.wv', b.wv.weight)]
            if b.qk: out += [(f'b{i}.q_norm', b.q_norm.weight), (f'b{i}.k_norm', b.k_norm.weight)]
            out += [(f'b{i}.wo', b.wo.weight),
                    (f'b{i}.mlp_norm', b.mlp_norm.weight), (f'b{i}.w1', b.w1.weight), (f'b{i}.w3', b.w3.weight), (f'b{i}.w2', b.w2.weight)]
        return out + [('norm', s.norm.weight)]


# ─── Words ↔ word-pieces ───────────────────────────────────────────────────────────────────────────
def load_tok(d):
    from tokenizers import Tokenizer
    return Tokenizer.from_file(str(Path(d) / 'tokenizer.json'))

def cmd_tokenizer(a):
    from tokenizers import ByteLevelBPETokenizer
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    def sample():  # the first ~60 MB of each text is plenty to learn the pieces
        for f in a.texts:
            with open(f.partition(':')[0], encoding='utf-8', errors='ignore') as fh:
                left = 60_000_000
                for line in fh:
                    left -= len(line)
                    if left < 0: break
                    yield line.replace('<|endoftext|>', '')
    t = ByteLevelBPETokenizer(add_prefix_space=False)
    t.train_from_iterator(sample(), vocab_size=a.vocab, min_frequency=2, special_tokens=SPECIAL)
    t.save(str(out / 'tokenizer.json'))
    print(f'{t.get_vocab_size()} word-pieces → {out / "tokenizer.json"}')


# ─── Starting from MiniMind-3 ──────────────────────────────────────────────────────────────────────
HF_NAMES = {'attn_norm': 'input_layernorm', 'wq': 'self_attn.q_proj', 'wk': 'self_attn.k_proj', 'wv': 'self_attn.v_proj', 'q_norm': 'self_attn.q_norm',
            'k_norm': 'self_attn.k_norm', 'wo': 'self_attn.o_proj', 'mlp_norm': 'post_attention_layernorm', 'w1': 'mlp.gate_proj', 'w3': 'mlp.up_proj', 'w2': 'mlp.down_proj'}

@torch.no_grad()
def cmd_adopt(a):
    import shutil
    from safetensors.torch import load_file
    src, d = Path(a.hf), Path(a.dir); d.mkdir(parents=True, exist_ok=True)
    hf = json.loads((src / 'config.json').read_text())
    assert hf.get('model_type') == 'qwen3' and hf.get('tie_word_embeddings'), 'expected a Qwen3-style model with tied tables'
    c = dict(layers=hf['num_hidden_layers'], dim=hf['hidden_size'], heads=hf['num_attention_heads'], kv=hf['num_key_value_heads'], head_dim=hf['head_dim'],
             ffn=hf['intermediate_size'], vocab=hf['vocab_size'], qk_norm=True, theta=hf['rope_theta'], chat='qwen', block=768, batch=8, lr=1e-4)
    model = GPT(c)
    w = {k: v.float() for k, v in load_file(src / 'model.safetensors').items()}
    model.tok.weight.copy_(w['model.embed_tokens.weight']); model.norm.weight.copy_(w['model.norm.weight'])
    for i, b in enumerate(model.blocks):
        for ours, theirs in HF_NAMES.items(): getattr(b, ours).weight.copy_(w[f'model.layers.{i}.{theirs}.weight'])
    shutil.copy(src / 'tokenizer.json', d / 'tokenizer.json')
    torch.save({'model': model.state_dict(), 'opt': None, 'step': 0, 'config': c, 'from': 'jingyaogong/minimind-3 (Apache-2.0)'}, d / 'state-pretrain.pt')
    try:  # the same numbers as the original, when its library is here
        from transformers import AutoModelForCausalLM
        ref = AutoModelForCausalLM.from_pretrained(src, dtype=torch.float32).eval()
        ids = torch.tensor([load_tok(d).encode('<|im_start|>user\nHello!<|im_end|>\n').ids])
        diff = (ref(ids).logits - model(ids)[0]).abs().max().item()
        print(f'matches MiniMind-3 to within {diff:.5f}')
        assert diff < 1e-3, 'the copy does not match the original'
    except ImportError: print('(transformers not installed: comparison skipped)')
    print(f'adopted {sum(p.numel() for p in model.parameters()):,} numbers from {src} → {d}')


# ─── Questions and answers to learn (the chat stage) ───────────────────────────────────────────────
def cmd_chat(a):
    pairs = []
    qa = HERE.parent / 'ghidra-qa.txt'  # Ghidra's own answers about UniVerse (M362), each way of asking
    for blk in qa.read_text(encoding='utf-8').strip().split('\n\n'):
        q, ans = blk.strip().split('\n', 1)
        pairs += [{'q': v.strip(), 'a': ans.strip()[3:].strip(), 'w': 6} for v in q[3:].split('|')]
    if a.oasst:  # OpenAssistant oasst1 (Apache-2.0): people's questions and the best-ranked answer, in the chosen languages
        import pyarrow.parquet as pq
        t = pq.read_table(a.oasst).to_pylist()
        by = {m['message_id']: m for m in t}
        langs = set(a.langs.split(','))
        for m in t:
            p = by.get(m['parent_id'])
            if m['role'] != 'assistant' or m['rank'] != 0 or not p or p['role'] != 'prompter' or p['parent_id'] is not None: continue
            if m['lang'] not in langs or m['deleted'] or p['deleted']: continue
            if any(w in m['text'] for w in ('Open Assistant', 'OpenAssistant', 'LAION', 'as an AI language model')): continue
            if len(p['text']) > 1200 or len(m['text']) > 2400: continue
            pairs.append({'q': p['text'].strip(), 'a': m['text'].strip(), 'w': 1})
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as fh:
        for p in pairs: fh.write(json.dumps(p, ensure_ascii=False) + '\n')
    print(f'{len(pairs)} questions and answers → {a.out}')


# ─── Thinking lessons (M372) ───────────────────────────────────────────────────────────────────────
def gsm8k(path):
    """GSM8K's problems as (question, steps, final number); its calculator notes <<…>> taken out."""
    import re
    import pyarrow.parquet as pq
    out = []
    for r in pq.read_table(path).to_pylist():
        steps, _, final = r['answer'].partition('####')
        steps = re.sub(r'<<[^>]*>>', '', steps).strip()
        out.append((r['question'].strip(), steps, final.strip().replace(',', '')))
    return out

def cmd_reason(a):
    rows = [{'q': q, 'think': steps, 'a': f'The answer is {final}.', 'w': 1} for q, steps, final in gsm8k(a.gsm8k)]
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as fh:
        for r in rows: fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{len(rows)} thinking lessons → {a.out}')


OTHER_AI = r'\b(ChatGPT|OpenAI|GPT-?\d|Qwen|Alibaba|Claude|Anthropic|Gemini|Bard|LLaMA|Llama|Meta AI|Hugging ?Face|SmolLM|language model|an AI (assistant|model) (developed|created|trained) by)\b'

def cmd_write(a, per_kind=1600):
    """Everyday writing lessons (M369: a small model's weak spot) from smol-smoltalk's first question and answer, short
    enough for the window, answers naming another assistant dropped, at most `per_kind` of each kind so code and rewrites
    don't crowd out the rest."""
    import collections, re
    import pyarrow.parquet as pq
    from tokenizers import Tokenizer
    tok, other, rows, kinds = Tokenizer.from_file(a.tok), re.compile(OTHER_AI, re.I), [], collections.Counter()
    for r in pq.read_table(a.smoltalk).to_pylist():
        system = [x['content'] for x in r['messages'] if x['role'] == 'system']
        turns = [x for x in r['messages'] if x['role'] != 'system']
        if len(turns) < 2 or turns[0]['role'] != 'user' or turns[1]['role'] != 'assistant': continue
        q, ans = ((system[0] + '\n\n') if system else '') + turns[0]['content'].strip(), turns[1]['content'].strip()
        if other.search(q + ans) or len(tok.encode(q).ids) > 220 or not 8 <= len(tok.encode(ans).ids) <= 260: continue
        if kinds[r['source']] >= per_kind: continue
        kinds[r['source']] += 1; rows.append({'q': q, 'a': ans, 'w': 1})
    with open(a.out, 'w', encoding='utf-8') as fh:
        for r in rows: fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{len(rows)} writing lessons → {a.out}', dict(kinds))


# ─── Training ──────────────────────────────────────────────────────────────────────────────────────
def device():
    return 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'

def pretrain_data(a, tok, d):
    """The texts as word-piece numbers (two bytes each), made once and kept in DIR/pretrain.bin."""
    cache = d / 'pretrain.bin'
    if not cache.exists():
        eot = tok.token_to_id('<|endoftext|>')
        tmp = cache.with_suffix('.tmp')
        with open(tmp, 'wb') as out:
            for spec in a.texts:
                path, _, times = spec.partition(':')
                text = Path(path).read_text(encoding='utf-8', errors='ignore')
                docs = [x.strip() for x in text.split('<|endoftext|>')] if '<|endoftext|>' in text else [text]
                del text
                keep, n = [], 0  # a text counted more than once is small: kept to write again; a big one streams to disk
                for i in range(0, len(docs), 2000):
                    ids = [t for e in tok.encode_batch([x for x in docs[i:i + 2000] if x]) for t in e.ids + [eot]]
                    arr = np.array(ids, dtype=np.uint16); n += len(arr)
                    out.write(arr.tobytes())
                    if int(times or 1) > 1: keep.append(arr)
                for _ in range(int(times or 1) - 1):
                    for arr in keep: out.write(arr.tobytes())
                print(f'  {path}: {n:,} word-pieces ×{times or 1}', flush=True)
        tmp.replace(cache)
    data = np.memmap(cache, dtype=np.uint16, mode='r')
    split = int(len(data) * 0.99)
    return data[:split], data[split:]

def chat_data(tok, d, block, chat='ghidra', files=('chat.jsonl',)):
    """Each pair in the model's chat shape (ours: <|user|>question<|end|><|ghidra|>answer<|end|>; MiniMind-3's: Qwen's
    <|im_start|>user … <|im_end|> <|im_start|>assistant, a thinking block, the answer, <|im_end|>); the model learns only
    the answer part. A lesson with `think` (M372) learns its thinking too: <think>steps</think> then the answer; the rest
    keep an empty thinking block in the part it doesn't learn."""
    rows = []
    for name in files:
        for line in open(d / name, encoding='utf-8'):
            p = json.loads(line)
            if chat == 'qwen':
                head = f"<|im_start|>user\n{p['q']}<|im_end|>\n<|im_start|>assistant\n"
                if p.get('think'): ans_text = f"<think>\n{p['think']}\n</think>\n\n{p['a']}"
                else: head, ans_text = head + "<think>\n\n</think>\n\n", p['a']
                head = tok.encode(head).ids
                ans = tok.encode(ans_text).ids + [tok.token_to_id('<|im_end|>')]
            else:
                u, g, e = (tok.token_to_id(x) for x in ('<|user|>', '<|ghidra|>', '<|end|>'))
                head, ans = [u] + tok.encode(p['q']).ids + [e, g], tok.encode(' ' + p['a']).ids + [e]
            x = head + ans
            if len(x) > block + 1: continue
            mask = [0] * len(head) + [1] * len(ans)
            rows += [(x, mask)] * p.get('w', 1)
    order = np.random.default_rng(7).permutation(len(rows))
    rows = [rows[i] for i in order]
    n = max(1, len(rows) // 50)
    return rows[n:], rows[:n]

def batch_lm(data, c, dev):
    ix = np.random.randint(0, len(data) - c['block'] - 1, c['batch'])
    x = torch.from_numpy(np.stack([data[i:i + c['block']] for i in ix]).astype(np.int64))
    y = torch.from_numpy(np.stack([data[i + 1:i + 1 + c['block']] for i in ix]).astype(np.int64))
    return x.to(dev), y.to(dev)

def batch_chat(rows, c, dev, pad):
    pick = [rows[i] for i in np.random.randint(0, len(rows), c['batch'])]
    T = max(len(x) for x, _ in pick) - 1
    X = torch.full((len(pick), T), pad, dtype=torch.long); Y = torch.full((len(pick), T), -100, dtype=torch.long)
    for i, (x, m) in enumerate(pick):
        X[i, :len(x) - 1] = torch.tensor(x[:-1])
        Y[i, :len(x) - 1] = torch.tensor([t if k else -100 for t, k in zip(x[1:], m[1:])])
    return X.to(dev), Y.to(dev)

def train(a, stage):
    d = Path(a.dir); tok = load_tok(d)
    name = getattr(a, 'stage', None) or stage  # the chat stages can be named (sft, think…), each with its own state file
    state_file = d / f'state-{name}.pt'
    if stage == 'pretrain':
        c = dict(PRESETS[a.preset], vocab=tok.get_vocab_size())
        start = None
    else:  # a chat stage carries on from --from's state (default: the pretrained or adopted model)
        start = torch.load(d / f"state-{getattr(a, 'start_from', None) or 'pretrain'}.pt", map_location='cpu', weights_only=False)
        c = dict(start['config'])
    if stage == 'sft': c['lr'] = c['lr'] / 3  # the chat stage nudges what pretraining learned, gently
    for k in ('batch', 'lr', 'block'):
        if getattr(a, k, None): c[k] = getattr(a, k)
    dev = device()
    torch.manual_seed(1337)
    model = GPT(c).to(dev)
    if start: model.load_state_dict(start['model'])
    params = sum(p.numel() for p in model.parameters())
    groups = [{'params': [p for p in model.parameters() if p.dim() >= 2], 'weight_decay': 0.1}, {'params': [p for p in model.parameters() if p.dim() < 2], 'weight_decay': 0.0}]
    opt = torch.optim.AdamW(groups, lr=c['lr'], betas=(0.9, 0.95), fused=dev == 'cuda')
    first = 1
    if state_file.exists():  # carry on exactly where the last run stopped
        s = torch.load(state_file, map_location='cpu', weights_only=False)
        model.load_state_dict(s['model']); first = s['step'] + 1
        if s['opt']: opt.load_state_dict(s['opt'])
        print(f'resumed {stage} at step {s["step"]}', flush=True)
    if stage == 'pretrain': train_d, val_d = pretrain_data(a, tok, d)
    else: train_d, val_d = chat_data(tok, d, c['block'], c.get('chat', 'ghidra'), tuple((getattr(a, 'data', None) or 'chat.jsonl').split(',')))
    pad = tok.token_to_id('<|endoftext|>')
    get = (lambda dd: batch_lm(dd, c, dev)) if stage == 'pretrain' else (lambda dd: batch_chat(dd, c, dev, pad))
    amp = torch.autocast('cuda', dtype=torch.bfloat16) if dev == 'cuda' else torch.autocast('cpu', enabled=False)
    run = torch.compile(model) if dev == 'cuda' and not a.no_compile else model

    @torch.no_grad()
    def val_loss(n=20):
        model.eval(); tot = 0.0
        for _ in range(n):
            with amp: tot += run(*get(val_d))[1].item()
        model.train(); return tot / n

    def save(step):
        tmp = state_file.with_suffix('.tmp')
        torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'step': step, 'config': c, 'from': (start or {}).get('from')}, tmp); tmp.replace(state_file)

    warm = 100 if stage == 'sft' else 500
    print(f'{stage} on {dev}: {params:,} numbers, {c["layers"]} layers × {c["dim"]}, {c["vocab"]} word-pieces', flush=True)
    t0 = time.time()
    last = min(a.steps, a.until or a.steps)
    for step in range(first, last + 1):
        lr = c['lr'] * min(1, step / warm) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * min(step, a.steps) / a.steps)))
        for g_ in opt.param_groups: g_['lr'] = lr
        with amp: _, loss = run(*get(train_d))
        opt.zero_grad(set_to_none=True); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
        if step % 100 == 0 or step == 10: print(f'step {step} loss {loss.item():.3f} ({time.time() - t0:.0f}s)', flush=True)
        if step % a.every == 0 or step == last:
            print(f'step {step} val {val_loss():.3f}', flush=True); save(step)


# ─── How many school maths problems it gets right (M372) ──────────────────────────────────────────
def to_hf(model):
    """Our model as the standard library's Qwen3 (the same design), for fast writing with a key/value memory."""
    from transformers import Qwen3Config, Qwen3ForCausalLM
    c = model.c
    hf = Qwen3ForCausalLM(Qwen3Config(vocab_size=c['vocab'], hidden_size=c['dim'], intermediate_size=c['ffn'], num_hidden_layers=c['layers'], num_attention_heads=c['heads'],
                                      num_key_value_heads=c['kv'], head_dim=c['head_dim'], rope_theta=c.get('theta', 1e6), rms_norm_eps=1e-6, tie_word_embeddings=True, max_position_embeddings=4096))
    w = {'model.embed_tokens.weight': model.tok.weight, 'model.norm.weight': model.norm.weight, 'lm_head.weight': model.tok.weight}
    for i, b in enumerate(model.blocks):
        for ours, theirs in HF_NAMES.items(): w[f'model.layers.{i}.{theirs}.weight'] = getattr(b, ours).weight
    hf.load_state_dict({k: v.detach().clone() for k, v in w.items()}, strict=True)
    return hf.eval()

def final_number(text):
    import re
    after = text.split('</think>')[-1]
    m = re.findall(r'-?\d[\d,]*\.?\d*', after) or re.findall(r'-?\d[\d,]*\.?\d*', text)
    return m[-1].replace(',', '').rstrip('.') if m else None

@torch.no_grad()
def cmd_score(a):
    d = Path(a.dir); tok = load_tok(d)
    s = torch.load(d / f'state-{a.stage}.pt', map_location='cpu', weights_only=False)
    model = GPT(s['config']); model.load_state_dict({k.replace('_orig_mod.', ''): v for k, v in s['model'].items()})
    hf = to_hf(model)
    probs = gsm8k(a.gsm8k)[: a.n]
    right, shown = 0, 0
    for q, _, final in probs:
        prompt = f"<|im_start|>user\n{q}<|im_end|>\n<|im_start|>assistant\n<think>\n"
        ids = torch.tensor([tok.encode(prompt).ids])
        out = hf.generate(ids, max_new_tokens=a.tokens, do_sample=False, eos_token_id=tok.token_to_id('<|im_end|>'), pad_token_id=tok.token_to_id('<|endoftext|>'))
        text = tok.decode(out[0, ids.shape[1]:].tolist(), skip_special_tokens=False)
        ok = final_number(text) == final
        right += ok
        if shown < 2: print(f'Q: {q[:120]}\nA: {text[:400]!r}\n→ {"right" if ok else "wrong"} (wanted {final})\n', flush=True); shown += 1
    print(f'{a.stage} (step {s["step"]}): {right} of {len(probs)} right ({100 * right / len(probs):.1f}%)', flush=True)


# ─── For the browser ───────────────────────────────────────────────────────────────────────────────
@torch.no_grad()
def cmd_export(a):
    d = Path(a.dir); tok = load_tok(d)
    stage = a.stage or ('sft' if (d / 'state-sft.pt').exists() and not a.pretrained else 'pretrain')
    s = torch.load(d / f'state-{stage}.pt', map_location='cpu', weights_only=False)
    model = GPT(s['config']); model.load_state_dict({k.replace('_orig_mod.', ''): v for k, v in s['model'].items()}); model.eval()
    blobs, shapes, at = [], [], 0
    for n, p in model.tables():  # a 2-D table: a 32-bit scale per row, then a byte per number; a 1-D one: 32-bit floats
        w = p.detach().float()
        if w.dim() == 2:
            scale = (w.abs().amax(dim=1) / 127).clamp(min=1e-8)
            q = torch.round(w / scale[:, None]).clamp(-127, 127).to(torch.int8)
            p.copy_(q.float() * scale[:, None])  # the check below uses the rounded numbers, as the browser will
            blob = scale.numpy().astype('<f4').tobytes() + q.numpy().tobytes()
        else: blob = w.numpy().astype('<f4').tobytes()
        blob += b'\0' * (-len(blob) % 4)
        shapes.append([n, list(w.shape), at]); blobs.append(blob); at += len(blob)
    chat = s['config'].get('chat', 'ghidra')
    prompt = '<|im_start|>user\nWhat is UniVerse?<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n' if chat == 'qwen' else '<|user|>What is UniVerse?<|end|><|ghidra|>'
    ids = tok.encode(prompt).ids
    logits, _ = model(torch.tensor([ids]))
    to = Path(a.to); to.mkdir(parents=True, exist_ok=True)
    # In parts of at most 20 MB (the website's host serves files of up to 25 MB): ghidra2-0.bin, ghidra2-1.bin…
    whole = b''.join(blobs); PART = 20 * 1024 * 1024
    for old in to.glob('ghidra2*.bin'): old.unlink()
    parts = [whole[i:i + PART] for i in range(0, len(whole), PART)]
    for i, part in enumerate(parts): (to / f'ghidra2-{i}.bin').write_bytes(part)
    tj = json.loads((d / 'tokenizer.json').read_text(encoding='utf-8'))
    c = s['config']
    meta = {'name': 'Ghidra 2', 'stage': stage, 'steps': s['step'], 'params': sum(p.numel() for p in model.parameters()), 'from': s.get('from'),
            **{k: c[k] for k in ('layers', 'dim', 'heads', 'kv', 'vocab', 'block')}, 'ffn': c.get('ffn') or ffn_size(c['dim']), 'theta': c.get('theta', 1e6),
            'headDim': c.get('head_dim') or c['dim'] // c['heads'], 'qkNorm': bool(c.get('qk_norm')), 'chat': chat, 'parts': [len(p) for p in parts],
            'vocabMap': tj['model']['vocab'], 'merges': [m if isinstance(m, str) else ' '.join(m) for m in tj['model']['merges']],
            'special': {x['content']: x['id'] for x in tj['added_tokens']}, 'shapes': shapes,
            'check': {'prompt': prompt, 'ids': ids, 'logits': [round(x, 3) for x in logits[0, -1, :8].tolist()], 'text': 'Hello, world! Héllo 123', 'textIds': tok.encode('Hello, world! Héllo 123').ids}}
    (to / 'ghidra2.json').write_text(json.dumps(meta, ensure_ascii=False))
    print(f'exported the {stage} model (step {s["step"]}): {at / 1e6:.1f} MB in {len(parts)} parts → {to}')


if __name__ == '__main__':  # run as a command (the functions above can also be imported)
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('tokenizer'); p.add_argument('--out', required=True); p.add_argument('--vocab', type=int, default=8192); p.add_argument('texts', nargs='+')
    p = sub.add_parser('chat'); p.add_argument('--out', required=True); p.add_argument('--oasst'); p.add_argument('--langs', default='en')
    for name in ('pretrain', 'sft'):
        p = sub.add_parser(name); p.add_argument('--dir', required=True); p.add_argument('--steps', type=int, required=True); p.add_argument('--until', type=int)
        p.add_argument('--every', type=int, default=500); p.add_argument('--batch', type=int); p.add_argument('--lr', type=float); p.add_argument('--block', type=int)
        p.add_argument('--no-compile', action='store_true')
        if name == 'pretrain': p.add_argument('--preset', choices=PRESETS, default='small'); p.add_argument('texts', nargs='+')
        else: p.add_argument('--stage', help='name of this chat stage (default sft)'); p.add_argument('--from', dest='start_from', help='the stage to start from (default pretrain)'); p.add_argument('--data', help='lesson files in DIR, comma-separated (default chat.jsonl)')
    p = sub.add_parser('write'); p.add_argument('--out', required=True); p.add_argument('--smoltalk', required=True); p.add_argument('--tok', required=True)
    p = sub.add_parser('reason'); p.add_argument('--out', required=True); p.add_argument('--gsm8k', required=True)
    p = sub.add_parser('score'); p.add_argument('--dir', required=True); p.add_argument('--gsm8k', required=True); p.add_argument('--stage', default='sft'); p.add_argument('--n', type=int, default=100); p.add_argument('--tokens', type=int, default=320)
    p = sub.add_parser('adopt'); p.add_argument('--hf', required=True); p.add_argument('--dir', required=True)
    p = sub.add_parser('export'); p.add_argument('--dir', required=True); p.add_argument('--to', required=True); p.add_argument('--pretrained', action='store_true'); p.add_argument('--stage')
    a = ap.parse_args()
    if a.cmd == 'tokenizer': cmd_tokenizer(a)
    elif a.cmd == 'chat': cmd_chat(a)
    elif a.cmd == 'adopt': cmd_adopt(a)
    elif a.cmd == 'reason': cmd_reason(a)
    elif a.cmd == 'write': cmd_write(a)
    elif a.cmd == 'score': cmd_score(a)
    elif a.cmd in ('pretrain', 'sft'): train(a, a.cmd)
    else: cmd_export(a)
