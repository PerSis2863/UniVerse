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
#   python3 scripts/ai/ghidra2.py export --dir DIR --to public/ai                   ghidra2.bin + ghidra2.json
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
        d, h, kv = c['dim'], c['heads'], c['kv']; hd = d // h
        s.h, s.kv, s.hd = h, kv, hd
        s.attn_norm, s.mlp_norm = RMSNorm(d), RMSNorm(d)
        s.wq, s.wk, s.wv, s.wo = nn.Linear(d, h * hd, bias=False), nn.Linear(d, kv * hd, bias=False), nn.Linear(d, kv * hd, bias=False), nn.Linear(h * hd, d, bias=False)
        f = ffn_size(d)
        s.w1, s.w3, s.w2 = nn.Linear(d, f, bias=False), nn.Linear(d, f, bias=False), nn.Linear(f, d, bias=False)
    def forward(s, x, cos, sin):
        B, T, _ = x.shape
        y = s.attn_norm(x)
        q = s.wq(y).view(B, T, s.h, s.hd).transpose(1, 2)
        k = s.wk(y).view(B, T, s.kv, s.hd).transpose(1, 2)
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
        cos, sin = rope(T, s.c['dim'] // s.c['heads'], device=idx.device)
        x = s.tok(idx)
        for b in s.blocks: x = b(x, cos, sin)
        logits = s.norm(x) @ s.tok.weight.T  # the output shares the input's table
        if targets is None: return logits, None
        return logits, F.cross_entropy(logits.float().view(-1, logits.shape[-1]), targets.view(-1), ignore_index=-100)
    def tables(s):
        """Every weight in the order the browser reads them (src/lib/ghidra2.ts)."""
        out = [('tok', s.tok.weight)]
        for i, b in enumerate(s.blocks):
            out += [(f'b{i}.attn_norm', b.attn_norm.weight), (f'b{i}.wq', b.wq.weight), (f'b{i}.wk', b.wk.weight), (f'b{i}.wv', b.wv.weight), (f'b{i}.wo', b.wo.weight),
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


# ─── Training ──────────────────────────────────────────────────────────────────────────────────────
def device():
    return 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'

def pretrain_data(a, tok, d):
    """The texts as word-piece numbers (two bytes each), made once and kept in DIR/pretrain.bin."""
    cache = d / 'pretrain.bin'
    if not cache.exists():
        eot = tok.token_to_id('<|endoftext|>')
        with open(cache, 'wb') as out:
            for spec in a.texts:
                path, _, times = spec.partition(':')
                text = Path(path).read_text(encoding='utf-8', errors='ignore')
                docs = [x.strip() for x in text.split('<|endoftext|>')] if '<|endoftext|>' in text else [text]
                ids = []
                for i in range(0, len(docs), 2000):
                    for e in tok.encode_batch([x for x in docs[i:i + 2000] if x]): ids += e.ids + [eot]
                arr = np.array(ids, dtype=np.uint16)
                for _ in range(int(times or 1)): out.write(arr.tobytes())
                print(f'  {path}: {len(arr):,} word-pieces ×{times or 1}', flush=True)
    data = np.memmap(cache, dtype=np.uint16, mode='r')
    split = int(len(data) * 0.99)
    return data[:split], data[split:]

def chat_data(tok, d, block):
    """Each pair as <|user|>question<|end|><|ghidra|>answer<|end|>; the model learns only the answer part."""
    u, g, e = (tok.token_to_id(x) for x in ('<|user|>', '<|ghidra|>', '<|end|>'))
    rows = []
    for line in open(d / 'chat.jsonl', encoding='utf-8'):
        p = json.loads(line)
        q, ans = tok.encode(p['q']).ids, tok.encode(' ' + p['a']).ids
        x = [u] + q + [e, g] + ans + [e]
        if len(x) > block + 1: continue
        mask = [0] * (len(q) + 3) + [1] * (len(ans) + 1)
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
    state_file = d / f'state-{stage}.pt'
    if stage == 'pretrain':
        c = dict(PRESETS[a.preset], vocab=tok.get_vocab_size())
        start = None
    else:  # the chat stage carries on from the pretrained model
        start = torch.load(d / 'state-pretrain.pt', map_location='cpu', weights_only=False)
        c = start['config']
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
        model.load_state_dict(s['model']); opt.load_state_dict(s['opt']); first = s['step'] + 1
        print(f'resumed {stage} at step {s["step"]}', flush=True)
    if stage == 'pretrain': train_d, val_d = pretrain_data(a, tok, d)
    else: train_d, val_d = chat_data(tok, d, c['block'])
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
        torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'step': step, 'config': c}, tmp); tmp.replace(state_file)

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


# ─── For the browser ───────────────────────────────────────────────────────────────────────────────
@torch.no_grad()
def cmd_export(a):
    d = Path(a.dir); tok = load_tok(d)
    stage = 'sft' if (d / 'state-sft.pt').exists() and not a.pretrained else 'pretrain'
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
    prompt = '<|user|>What is UniVerse?<|end|><|ghidra|>'
    ids = tok.encode(prompt).ids
    logits, _ = model(torch.tensor([ids]))
    to = Path(a.to); to.mkdir(parents=True, exist_ok=True)
    (to / 'ghidra2.bin').write_bytes(b''.join(blobs))
    tj = json.loads((d / 'tokenizer.json').read_text(encoding='utf-8'))
    meta = {'name': 'Ghidra 2', 'stage': stage, 'steps': s['step'], 'params': sum(p.numel() for p in model.parameters()),
            **{k: s['config'][k] for k in ('layers', 'dim', 'heads', 'kv', 'vocab', 'block')}, 'ffn': ffn_size(s['config']['dim']), 'theta': 1e6,
            'vocabMap': tj['model']['vocab'], 'merges': [m if isinstance(m, str) else ' '.join(m) for m in tj['model']['merges']],
            'special': {t: tok.token_to_id(t) for t in SPECIAL}, 'shapes': shapes,
            'check': {'prompt': prompt, 'ids': ids, 'logits': [round(x, 3) for x in logits[0, -1, :8].tolist()], 'text': 'Hello, world! Héllo 123', 'textIds': tok.encode('Hello, world! Héllo 123').ids}}
    (to / 'ghidra2.json').write_text(json.dumps(meta, ensure_ascii=False))
    print(f'exported the {stage} model (step {s["step"]}): {at / 1e6:.1f} MB → {to}')


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest='cmd', required=True)
p = sub.add_parser('tokenizer'); p.add_argument('--out', required=True); p.add_argument('--vocab', type=int, default=8192); p.add_argument('texts', nargs='+')
p = sub.add_parser('chat'); p.add_argument('--out', required=True); p.add_argument('--oasst'); p.add_argument('--langs', default='en')
for name in ('pretrain', 'sft'):
    p = sub.add_parser(name); p.add_argument('--dir', required=True); p.add_argument('--steps', type=int, required=True); p.add_argument('--until', type=int)
    p.add_argument('--every', type=int, default=500); p.add_argument('--batch', type=int); p.add_argument('--lr', type=float); p.add_argument('--block', type=int)
    p.add_argument('--no-compile', action='store_true')
    if name == 'pretrain': p.add_argument('--preset', choices=PRESETS, default='small'); p.add_argument('texts', nargs='+')
p = sub.add_parser('export'); p.add_argument('--dir', required=True); p.add_argument('--to', required=True); p.add_argument('--pretrained', action='store_true')
a = ap.parse_args()
if a.cmd == 'tokenizer': cmd_tokenizer(a)
elif a.cmd == 'chat': cmd_chat(a)
elif a.cmd in ('pretrain', 'sft'): train(a, a.cmd)
else: cmd_export(a)
