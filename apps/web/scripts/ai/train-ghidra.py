# Ghidra (M421): UniVerse's own GPT, trained from nothing, in the design of Andrej Karpathy's nanoGPT
# (github.com/karpathy/nanoGPT, MIT): a character-level transformer, small enough to train on an ordinary computer's
# processor and to run in a browser. The code is written for UniVerse; the design is nanoGPT's.
#
# What it learns from (the owner, 21 Nov: "train it like crazy level"):
#   - UniVerse's own sentences (scripts/ai/ghidra-corpus.mjs), repeated so they count more;
#   - TinyStories (huggingface.co/datasets/roneneldan/TinyStories, CDLA-Sharing-1.0): ~22,000 short simple stories
#     made for teaching small models fluent English (its TinyStories-valid.txt file).
#
# From apps/web, with PyTorch installed (pip install torch --index-url https://download.pytorch.org/whl/cpu):
#   node scripts/ai/ghidra-corpus.mjs /tmp/universe.txt
#   python3 scripts/ai/train-ghidra.py --steps 12000 /tmp/universe.txt:4 /tmp/TinyStories-valid.txt
# (file:N repeats a file N times). A long run goes in chunks with --ckpt state.pt --until N, then --resume state.pt. It saves public/ai/ghidra.bin and ghidra.json every 1,000 steps and at the end, so a
# long run is never lost. ~1.5 hours on 4 cores for 12,000 steps.
#
# Then teach it to answer (fine-tuning: a short second round from the saved model, on questions and answers about
# UniVerse, scripts/ai/ghidra-qa.txt, with some of the first text so it keeps its English):
#   python3 scripts/ai/train-ghidra.py --from public/ai/ghidra.json --qa scripts/ai/ghidra-qa.txt:150 --steps 2000 --lr 3e-4 \
#     /tmp/universe.txt /tmp/TinyStories-valid.txt
import argparse, json, math, time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ap = argparse.ArgumentParser()
ap.add_argument('texts', nargs='+')
ap.add_argument('--steps', type=int, default=9000)
ap.add_argument('--layers', type=int, default=6)
ap.add_argument('--heads', type=int, default=6)
ap.add_argument('--embd', type=int, default=192)
ap.add_argument('--block', type=int, default=256)
ap.add_argument('--batch', type=int, default=32)
ap.add_argument('--lr', type=float, default=1.5e-3)
ap.add_argument('--from', dest='start', help='go on from a saved model (its ghidra.json; ghidra.bin beside it)')
ap.add_argument('--qa', help='questions and answers to learn, file:N (N times)')
ap.add_argument('--out', help='where to save (default public/ai)')
ap.add_argument('--ckpt', help='also keep the full training state here every 1,000 steps (to resume exactly; not for the repo)')
ap.add_argument('--resume', help='carry on exactly from a --ckpt file (same texts, same --steps)')
ap.add_argument('--until', type=int, help='stop after this step (long runs go in chunks: --resume the next one)')
args = ap.parse_args()
state = torch.load(args.resume, weights_only=False) if args.resume else None
if state: args.start = state['start']
saved = json.loads(Path(args.start).read_text(encoding='utf-8')) if args.start else None
if saved: args.layers, args.heads, args.embd, args.block = saved['layers'], saved['heads'], saved['embd'], saved['block']
torch.manual_seed(1337)
OUT = Path(args.out) if args.out else Path(__file__).resolve().parents[2] / 'public' / 'ai'
L, H, C, T = args.layers, args.heads, args.embd, args.block

parts = []
for spec in args.texts:
    path, _, times = spec.partition(':')
    t = Path(path).read_text(encoding='utf-8').replace('<|endoftext|>', '\n')
    t = '\n'.join(line.strip() for line in t.split('\n'))
    parts += [t] * int(times or 1)
if args.qa:
    # Each block: "Q: one way|another way|…" then "A: the answer". Every way of asking becomes its own example.
    path, _, times = args.qa.partition(':')
    pairs, known = [], []
    for blk in Path(path).read_text(encoding='utf-8').strip().split('\n\n'):
        q, a = blk.strip().split('\n', 1)
        known += [v.strip() for v in q[3:].split('|')]
        pairs += [f'Q: {v.strip()}\nA: {a.strip()[3:].strip()}\n' for v in q[3:].split('|')]
    print(f'{len(pairs)} questions to learn', flush=True)
    for _ in range(int(times or 1)):
        order = torch.randperm(len(pairs)).tolist()
        parts.append('\n'.join(pairs[i] for i in order))
text = '\n'.join(parts)
del parts
if saved: chars = list(saved['chars'])
else:
    from collections import Counter
    chars = sorted(c for c, n in Counter(text).items() if n >= 50)  # rare characters are dropped
stoi = {c: i for i, c in enumerate(chars)}
# Each character becomes its number in one byte (characters outside the alphabet are dropped), quickly, in C.
table = {ord(c): (chr(stoi[c]) if c in stoi else None) for c in set(text)}
coded = text.translate(table).encode('latin-1')
size = len(coded)
del text
data = torch.from_numpy(np.frombuffer(coded, dtype=np.uint8).copy())
split = int(len(data) * 0.98)
train, val = data[:split], data[split:]
V = len(chars)

def batch(d):
    ix = torch.randint(len(d) - T - 1, (args.batch,))
    return torch.stack([d[i:i + T] for i in ix]).long(), torch.stack([d[i + 1:i + T + 1] for i in ix]).long()

class Block(nn.Module):
    def __init__(s):
        super().__init__()
        s.ln_1, s.ln_2 = nn.LayerNorm(C, bias=False), nn.LayerNorm(C, bias=False)
        s.c_attn, s.attn_proj = nn.Linear(C, 3 * C, bias=False), nn.Linear(C, C, bias=False)
        s.c_fc, s.c_proj = nn.Linear(C, 4 * C, bias=False), nn.Linear(4 * C, C, bias=False)
    def forward(s, x):
        B, N, _ = x.shape
        q, k, v = s.c_attn(s.ln_1(x)).split(C, dim=2)
        q, k, v = (t.view(B, N, H, C // H).transpose(1, 2) for t in (q, k, v))
        y = F.scaled_dot_product_attention(q, k, v, is_causal=True)
        x = x + s.attn_proj(y.transpose(1, 2).contiguous().view(B, N, C))
        return x + s.c_proj(F.gelu(s.c_fc(s.ln_2(x))))

class GPT(nn.Module):
    def __init__(s):
        super().__init__()
        s.wte, s.wpe = nn.Embedding(V, C), nn.Embedding(T, C)
        s.h = nn.ModuleList(Block() for _ in range(L))
        s.ln_f = nn.LayerNorm(C, bias=False)
        s.apply(lambda m: nn.init.normal_(m.weight, 0, 0.02) if isinstance(m, (nn.Linear, nn.Embedding)) else None)
        for n, p in s.named_parameters():
            if n.endswith('proj.weight'): nn.init.normal_(p, 0, 0.02 / math.sqrt(2 * L))
    def forward(s, idx, targets=None):
        x = s.wte(idx) + s.wpe(torch.arange(idx.shape[1]))
        for b in s.h: x = b(x)
        logits = s.ln_f(x) @ s.wte.weight.T  # the output layer shares the input's table (weight tying)
        return logits, None if targets is None else F.cross_entropy(logits.view(-1, V), targets.view(-1))

model = GPT()
if saved:  # the saved tables, unpacked from one byte per number
    blob = (Path(args.start).parent / 'ghidra.bin').read_bytes()
params = sum(p.numel() for p in model.parameters())
decay = [p for p in model.parameters() if p.dim() >= 2]
opt = torch.optim.AdamW([{'params': decay, 'weight_decay': 0.1}, {'params': [p for p in model.parameters() if p.dim() < 2], 'weight_decay': 0}], lr=args.lr, betas=(0.9, 0.95))

@torch.no_grad()
def val_loss(n=20):
    model.eval()
    l = sum(model(*batch(val))[1].item() for _ in range(n)) / n
    model.train()
    return l

def tensors():
    out = [('wte', model.wte.weight), ('wpe', model.wpe.weight)]
    for i, b in enumerate(model.h):
        out += [(f'h{i}.ln_1', b.ln_1.weight), (f'h{i}.c_attn', b.c_attn.weight), (f'h{i}.attn_proj', b.attn_proj.weight),
                (f'h{i}.ln_2', b.ln_2.weight), (f'h{i}.c_fc', b.c_fc.weight), (f'h{i}.c_proj', b.c_proj.weight)]
    return out + [('ln_f', model.ln_f.weight)]

if saved:
    with torch.no_grad():
        for (n, p), (sn, shape, at) in zip(tensors(), saved['shapes']):
            assert n == sn and list(p.shape) == shape, f'{n} does not match the saved model'
            if len(shape) == 1:
                p.copy_(torch.from_numpy(np.frombuffer(blob, dtype='<f4', count=shape[0], offset=at).copy()))
            else:
                r, c = shape
                scale = torch.from_numpy(np.frombuffer(blob, dtype='<f4', count=r, offset=at).copy())
                q = torch.from_numpy(np.frombuffer(blob, dtype=np.int8, count=r * c, offset=at + r * 4).copy()).float().view(r, c)
                p.copy_(q * scale[:, None])
    print(f'went on from {args.start} (step {saved["steps"]}, val {saved["valLoss"]})', flush=True)

@torch.no_grad()
def save(step, vl):
    """Each table as one byte per number with a scale per row (int8); layer norms as 32-bit floats. The check runs the
    model with exactly those rounded numbers, as the browser will."""
    model.eval()
    blobs, shapes, at = [], [], 0
    keepw = {n: p.detach().clone() for n, p in tensors()}
    for n, p in tensors():
        w = p.detach().float()
        if w.dim() == 2:
            scale = (w.abs().amax(dim=1) / 127).clamp(min=1e-8)
            q = torch.round(w / scale[:, None]).clamp(-127, 127).to(torch.int8)
            p.data.copy_(q.float() * scale[:, None])
            blob = scale.numpy().astype('<f4').tobytes() + q.numpy().tobytes()
        else:
            blob = w.numpy().astype('<f4').tobytes()
        blob += b'\0' * (-len(blob) % 4)  # keep every table on a 4-byte boundary
        shapes.append([n, list(w.shape), at])
        blobs.append(blob); at += len(blob)
    prompt = 'Once upon a time'
    logits, _ = model(torch.tensor([[stoi[c] for c in prompt]]))
    for n, p in tensors(): p.data.copy_(keepw[n])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'ghidra.bin').write_bytes(b''.join(blobs))
    (OUT / 'ghidra.json').write_text(json.dumps({
        'name': 'Ghidra', 'chars': ''.join(chars), 'layers': L, 'heads': H, 'embd': C, 'block': T,
        'params': params, 'trainedOn': max(size, saved['trainedOn'] if saved else 0), 'steps': (saved['steps'] if saved else 0) + step,
        'valLoss': round(vl, 3), 'known': known if args.qa else (saved or {}).get('known', []), 'shapes': shapes,
        'check': {'prompt': prompt, 'logits': [round(x, 3) for x in logits[0, -1, :8].tolist()]},
    }, ensure_ascii=False))
    model.train()
    print(f'saved at step {step}: {at / 1e6:.1f} MB', flush=True)

first = 1
if state:
    model.load_state_dict(state['model']); opt.load_state_dict(state['opt'])
    torch.set_rng_state(state['rng']); first = state['step'] + 1
    print(f'resumed at step {state["step"]}', flush=True)
print(f'{params:,} parameters, {V} characters, {size:,} characters of text', flush=True)
t0 = time.time()
for step in range(first, min(args.steps, args.until or args.steps) + 1):
    lr = args.lr * min(1, step / (50 if saved else 200)) * (0.1 + 0.9 * 0.5 * (1 + math.cos(math.pi * step / args.steps)))
    for g in opt.param_groups: g['lr'] = lr
    _, loss = model(*batch(train))
    opt.zero_grad(set_to_none=True)
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    opt.step()
    if step % 250 == 0 or step == 20: print(f'step {step} train {loss.item():.3f} ({time.time() - t0:.0f}s)', flush=True)
    if step % 1000 == 0 or step == args.steps:
        vl = val_loss()
        print(f'step {step} val {vl:.3f}', flush=True)
        save(step, vl)
        if args.ckpt:
            torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'step': step, 'start': args.start, 'rng': torch.get_rng_state()}, args.ckpt + '.tmp')
            Path(args.ckpt + '.tmp').replace(args.ckpt)
