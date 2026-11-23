# The app agents' own AI (M437; the owner, 23 Nov: "train the ai so that it can work in different sectors… customer
# support, travel planner or itinerary planner"): one LoRA add-on for Qwen2.5-Coder 32B (the model Cloudflare runs as
# @cf/qwen/qwen2.5-coder-32b-instruct, which takes add-ons; Hyperion's AI uses it too) that answers as Ghidra's
# Customer Support, Travel Planner, Research Assistant and Social Media Manager, with the website's own instructions
# (scripts/ai/agents-lab.mjs prints them from src/server/agents/playbooks.ts).
#
# How it learns: requests are made from real data (the map's towns of 150,000+ people, Wikipedia's sources, invented products with and
# without recalls, invented brands, charities and schools); a general teacher (Qwen2.5 32B Instruct, Apache-2.0) answers
# each twice; only an answer that passes that agent's rules becomes a lesson (support: only the product's facts, a
# recall first, no promises, never asks for a password, under 130 words; travel: no prices or clock times; research:
# every claim cited from the sources given; posts: the platforms asked, X within 280 characters, no invented numbers or
# green claims). 40 requests per agent are held back for the score, before and after the add-on.
#
#   python3 scripts/ai/agents-ai.py data  --dir DIR [--scale 1]   requests, answers, checks → DIR/lessons.jsonl
#   python3 scripts/ai/agents-ai.py score --dir DIR               held-back requests: how many pass the rules, before and after
#   (training, export and upload are hyperion-ai.py's: train --dir DIR; export --dir DIR --to OUT; upload --prefix agents)
import argparse, concurrent.futures, importlib.util, json, random, re, subprocess, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1]
_spec = importlib.util.spec_from_file_location('hyperion_ai', HERE / 'hyperion-ai.py')
h = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(h)

GENERAL = 'Qwen/Qwen2.5-32B-Instruct-AWQ'  # the teacher (Apache-2.0): a general model writes better advice than the coder
HELD = 40
UA = 'UniVerse-Ghidra/1.0 (education platform research assistant)'  # as src/server/agents/research.ts

def agents():
    p = subprocess.run(['node', 'scripts/ai/agents-lab.mjs'], cwd=WEB, capture_output=True, text=True, check=True)
    return json.loads(p.stdout)

def system_of(A, kind):  # exactly what src/server/agents/own-model.ts sends
    return f"{A[kind]['system']}\n{A[kind]['rule']}"

def json_list(text):
    m = re.search(r'\[[\s\S]*\]', text or '')
    try: v = json.loads(m.group(0)) if m else []
    except json.JSONDecodeError: return []
    return v if isinstance(v, list) else []

def json_obj(text):
    m = re.search(r'\{[\s\S]*\}', text or '')
    try: v = json.loads(m.group(0)) if m else None
    except json.JSONDecodeError: return None
    return v if isinstance(v, dict) else None

def nums(text):  # the numbers in a text ("24", "3.5"): an answer may only use numbers it was given
    return set(re.findall(r'\d+(?:[.,]\d+)?', re.sub(r'\[[^\]]*\]', '', text or '')))

# ——— Requests ———

CATEGORIES = ['running shoes', 'a winter jacket', 'a kettle', 'a phone charger', 'baby formula', 'a bicycle helmet', 'olive oil',
              'a laptop backpack', 'face cream', 'a cotton T-shirt', 'a coffee machine', 'children’s toy blocks', 'a power drill',
              'honey', 'a wool sweater', 'sunscreen', 'headphones', 'a frying pan', 'dog food', 'a smartwatch', 'jeans', 'a desk lamp',
              'chocolate', 'a car seat for children', 'vitamin tablets', 'a yoga mat', 'a sofa', 'paint', 'a solar lantern', 'tea']
ASKS = ('how long the warranty is and how to use it; whether it is safe for a use the facts don’t mention; a demand for a refund or '
        'a replacement; where and when it was made; what it is made of or how to recycle it; an angry message because it broke; '
        'whether there is a recall; a question the facts can’t answer (price, stock, delivery); a buyer offering their password '
        'or card number to "verify" them; a question in simple, imperfect English')

def facts_text(p):  # as productFacts in src/server/agents/support.ts
    r = p.get('recall')
    lines = [f"Product: {p.get('product')}", p.get('kind') and f"Kind: {p['kind']}", f"Brand: {p.get('brand') or 'unknown'}",
             p.get('description') and f"Description: {p['description']}", p.get('story') and f"The brand's story: {p['story']}",
             f"Warranty: {p['warranty_months']} months (registered on the passport)" if (p.get('warranty_months') or 0) > 0 else 'Warranty: none stated',
             f"Batch: {p.get('batch') or 'B1'}" + (f", made in {p['origin']}" if p.get('origin') else '') + (f", on {p['made']}" if p.get('made') else ''),
             f"ACTIVE RECALL ({r.get('severity', 'HIGH')}): {r.get('reason')}" + (f". What to do: {r['advice']}" if r.get('advice') else '') if isinstance(r, dict) and r.get('reason') else 'Recall: none active',
             p.get('passport') and f"EU product passport details: {json.dumps(p['passport'], ensure_ascii=False)[:1200]}"]
    return '\n'.join(x for x in lines if x)

def support_requests(llm, n):
    rnd = random.Random(1)
    ask = [[{'role': 'user', 'content': f'Invent 3 different, realistic products of this kind: {rnd.choice(CATEGORIES)}, each sold with a digital product passport. '
             'Reply with a JSON list of objects with: product, kind, brand (an invented name), description (1–2 sentences), story (1 sentence, or null), '
             'warranty_months (0, 6, 12, 24 or 36), batch, origin (a country), made (a date like 2026-03-14), recall (null for most; for about one in four, '
             '{"severity": "HIGH" or "MEDIUM", "reason": "…", "advice": "…"}), passport (null, or a small object with materials, repair and recycling).'}]
           for _ in range(max(1, n // 15))]
    sheets = [p for outs in h.chat(llm, ask, temp=1.0, max_tokens=1600) for p in json_list(outs[0]) if isinstance(p, dict) and p.get('product')]
    qs = h.chat(llm, [[{'role': 'user', 'content': f'Product facts:\n{facts_text(p)}\n\nWrite 5 different messages a buyer holding this product might send its support, '
                        f'mixing: {ASKS}. Reply with a JSON list of strings only.'}] for p in sheets], temp=0.9, max_tokens=700)
    return [{'kind': 'support', 'q': f'Product facts:\n{facts_text(p)}\n\nThe buyer asks: {q}', 'facts': facts_text(p)}
            for p, outs in zip(sheets, qs) for q in json_list(outs[0])[:5] if isinstance(q, str) and 5 < len(q) < 500]

def travel_requests(n):
    rnd = random.Random(2)
    geo = json.loads((WEB / 'public/geo/destinations.json').read_text(encoding='utf-8'))  # the map's towns: [name, country, lat, lon, thousands]
    places = [p[0] for p in geo['places'] if p[4] >= 150]
    out = []
    for _ in range(n):
        days, people = rnd.choice([1, 2, 2, 3, 3, 3, 4, 5, 7, 10]), rnd.choice([1, 1, 2, 2, 2, 3, 4, 5, 6])
        date = f' from 2027-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}' if rnd.random() < 0.4 else ''
        out.append({'kind': 'travel', 'q': f"Tips for {days} days in {rnd.choice(places)} for {people} {'person' if people == 1 else 'people'}{date}."})
    return out  # exactly src/server/agents/travel.ts's request

def wiki_sources(topic):  # as findSources in src/server/agents/research.ts: up to 4 articles' opening summaries
    get = lambda url: json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=20).read())
    try:
        keys = [p['key'] for p in get(f'https://en.wikipedia.org/w/rest.php/v1/search/page?q={urllib.parse.quote(topic)}&limit=4').get('pages', []) if p.get('key')][:4]
        out = []
        for k in keys:
            s = get(f'https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(k, safe="")}')
            if s.get('type') == 'standard' and s.get('extract') and s.get('title'): out.append(f"[{len(out) + 1}] {s['title']}: {s['extract'][:1500]}")
        return out
    except Exception:
        return []

def research_requests(llm, n):
    subjects = ['biology', 'chemistry', 'physics', 'world history', 'geography', 'economics', 'computer science', 'mathematics', 'climate and energy',
                'literature', 'psychology', 'sociology', 'medicine and health', 'engineering', 'art history', 'philosophy', 'politics and law',
                'business and marketing', 'astronomy', 'environmental science', 'music', 'languages and linguistics', 'agriculture and food', 'sport science']
    outs = h.chat(llm, [[{'role': 'user', 'content': f'List {max(4, n // len(subjects) + 2)} different topics a student or a company might research in {s} '
                          '(a few words each, like "photosynthesis" or "carbon pricing"). Reply with a JSON list of strings only.'}] for s in subjects], temp=0.9, max_tokens=500)
    topics = list(dict.fromkeys(t for o in outs for t in json_list(o[0]) if isinstance(t, str) and 2 < len(t) < 80))
    random.Random(3).shuffle(topics)
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        found = list(ex.map(wiki_sources, topics[: n + 40]))
    return [{'kind': 'research', 'q': f'Topic: {t}\n\nSources:\n' + '\n\n'.join(src), 'n': len(src)} for t, src in zip(topics, found) if len(src) >= 2][:n]

def social_requests(llm, n):
    rnd = random.Random(4)
    kinds = ['a small brand selling a product with a Trace passport', 'a disaster-relief charity or community organisation', 'a school or university', 'a person posting for themselves']
    outs = h.chat(llm, [[{'role': 'user', 'content': f'Invent 4 different realistic examples of {k} and, for each, something they want to post about. '
                          'Reply with a JSON list of objects with: name (an invented name, or null for a person), topic (one sentence, no numbers unless needed).'}]
                        for k in kinds for _ in range(max(1, n // 16))], temp=1.0, max_tokens=700)
    out = []
    for i, o in enumerate(outs):
        kind = kinds[i // max(1, n // 16)]
        for x in json_list(o[0]):
            if not isinstance(x, dict) or not isinstance(x.get('topic'), str): continue
            want = rnd.sample(['Instagram', 'LinkedIn', 'X', 'Facebook', 'WhatsApp'], rnd.choice([1, 2, 3]))
            count = max(len(want), rnd.choice([1, 2, 3]))
            name = x.get('name') if isinstance(x.get('name'), str) else None
            who = ('the brand ' if 'brand' in kind else 'the organisation ' if 'charity' in kind else 'the school ') + name if name and 'person' not in kind else None
            out.append({'kind': 'social', 'want': want, 'count': count, 'q': f"Topic: {x['topic']}\nPlatforms: {', '.join(want)}\nHow many posts in all: {count}\n"
                        + (f'They post for: {who}.' if who else 'They post for themselves.')})  # as src/server/agents/social.ts
    return out[:n]

# ——— Each agent's rules ———

PROMISE = re.compile(r"\b(we|i)(['’]ll| will| can)\s+(refund|replace|repair|send you|give you a (refund|replacement))|\bguarantee", re.I)
ASK_SECRET = re.compile(r"\b(send|share|give|provide|enter|tell|confirm)\b[^.?!]{0,40}\b(password|card number|card details|cvv|pin)\b", re.I)
PRICE = re.compile(r"[$€£₹¥]\s?\d|\d\s?(usd|eur|inr|gbp|rupees?|dollars?|euros?|pounds)\b", re.I)
CLOCK = re.compile(r"\b\d{1,2}[:.]\d{2}\s?(am|pm)?\b|\b\d{1,2}\s?(am|pm)\b", re.I)
GREEN = re.compile(r"carbon[- ]neutral|eco[- ]friendly|\bcures?\b|guaranteed|100 ?% (natural|green|safe)", re.I)

def check(r, out):
    """Whether an answer (the model's text) passes its agent's rules: (ok, reason)."""
    v = json_obj(out)
    if v is None: return False, 'not JSON'
    k, q = r['kind'], r['q']
    if k == 'support':
        a = v.get('answer')
        if not isinstance(a, str) or not isinstance(v.get('answered'), bool) or len(a) < 20: return False, 'shape'
        if len(a.split()) > 130: return False, 'too long'
        if 'ACTIVE RECALL' in r['facts'] and 'recall' not in a.lower()[:300]: return False, 'recall not first'
        if PROMISE.search(a): return False, 'a promise'
        if ASK_SECRET.search(a) and not re.search(r'\b(never|don[’\']t|do not|no need)\b', a, re.I): return False, 'asks for a secret'
        if nums(a) - nums(q): return False, 'a number not in the facts'
    elif k == 'travel':
        t = v.get('tips')
        if not isinstance(t, list) or not 3 <= len(t) <= 5 or not all(isinstance(x, str) and 10 <= len(x) <= 240 for x in t): return False, 'shape'
        if any(PRICE.search(x) for x in t): return False, 'a price'
        if any(CLOCK.search(x) for x in t): return False, 'a clock time'
    elif k == 'research':
        s, pts = v.get('summary'), v.get('points', [])
        if not isinstance(s, str) or not 80 <= len(s) <= 1400 or not isinstance(pts, list) or len(pts) > 5: return False, 'shape'
        cites = [int(c) for c in re.findall(r'\[(\d+)\]', s + ' '.join(map(str, pts)))]
        if len(re.findall(r'\[\d+\]', s)) < 2: return False, 'too few citations'
        if any(c < 1 or c > r['n'] for c in cites): return False, 'cites a source that isn’t there'
        if '**' in s or s.lstrip().startswith('#'): return False, 'markdown'
        if any(isinstance(p, str) and not re.search(r'\[\d+\]', p) for p in pts): return False, 'a point without a source'
    elif k == 'social':
        posts = v.get('posts')
        if not isinstance(posts, list) or not len(r['want']) <= len(posts) <= 6: return False, 'shape'
        want = {w.lower() for w in r['want']}
        for p in posts:
            if not isinstance(p, dict) or not isinstance(p.get('text'), str) or len(p['text']) < 10: return False, 'shape'
            plat = str(p.get('platform', '')).lower().replace('twitter', 'x')
            if plat not in want: return False, 'a platform not asked'
            if plat == 'x' and len(p['text']) > 280: return False, 'X over 280'
            if GREEN.search(p['text']) and not GREEN.search(q): return False, 'a green or health claim'
            if nums(re.sub(r'#\w+', '', p['text'])) - nums(q): return False, 'an invented number'
    return True, ''

# ——— Commands ———

def cmd_data(a):
    d = Path(a.dir); d.mkdir(parents=True, exist_ok=True)
    A = agents()
    llm = h.teacher(model=GENERAL)
    n = lambda base: int(base * a.scale)
    reqs = support_requests(llm, n(2000)) + travel_requests(n(900)) + research_requests(llm, n(500)) + social_requests(llm, n(500))
    random.Random(7).shuffle(reqs)
    by = {}
    for r in reqs: by.setdefault(r['kind'], []).append(r)
    held = {id(r) for rs in by.values() for r in rs[:HELD]}
    print('requests: ' + ', '.join(f'{k} {len(v)}' for k, v in by.items()), flush=True)
    train = [r for r in reqs if id(r) not in held]
    answers = h.chat(llm, [[{'role': 'system', 'content': system_of(A, r['kind'])}, {'role': 'user', 'content': r['q']}] for r in train], temp=0.6, max_tokens=1200, n=2)
    lessons, why = [], {}
    for r, outs in zip(train, answers):
        for t in outs:
            ok, reason = check(r, t)
            if ok:
                lessons.append({'kind': r['kind'], 'system': system_of(A, r['kind']), 'q': r['q'], 'a': json.dumps(json_obj(t), ensure_ascii=False), 'held': False}); break
            why[f"{r['kind']}: {reason}"] = why.get(f"{r['kind']}: {reason}", 0) + 1
    with open(d / 'lessons.jsonl', 'w', encoding='utf-8') as fh:
        for x in lessons: fh.write(json.dumps(x, ensure_ascii=False) + '\n')
    with open(d / 'held.jsonl', 'w', encoding='utf-8') as fh:
        for r in reqs:
            if id(r) in held: fh.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'{len(lessons)} lessons from {len(train)} requests: ' + ', '.join(f'{k} {sum(x["kind"] == k for x in lessons)}' for k in by), flush=True)
    print('answers refused, by rule: ' + ', '.join(f'{k} {v}' for k, v in sorted(why.items(), key=lambda kv: -kv[1])[:12]), flush=True)

def cmd_score(a):
    from vllm import LLM, SamplingParams
    from vllm.lora.request import LoRARequest
    d = Path(a.dir); A = agents()
    held = [json.loads(l) for l in open(d / 'held.jsonl', encoding='utf-8')]
    llm = LLM(h.TEACHER, max_model_len=4096, gpu_memory_utilization=0.9, enable_lora=True, max_lora_rank=32, enforce_eager=True)
    msgs = [[{'role': 'system', 'content': system_of(A, r['kind'])}, {'role': 'user', 'content': r['q']}] for r in held]
    saved = {}
    for name, lora in (('before (no add-on)', None), ('after (with the add-on)', LoRARequest('agents', 1, str(d / 'lora')))):
        outs = [o.outputs[0].text for o in llm.chat(msgs, SamplingParams(temperature=0, max_tokens=1200), lora_request=lora, use_tqdm=True)]
        res = [check(r, t) for r, t in zip(held, outs)]
        saved[name] = [{'kind': r['kind'], 'q': r['q'][:600], 'a': t, 'ok': ok, 'why': why} for r, t, (ok, why) in zip(held, outs, res)]
        per = {k: (sum(ok for r, (ok, _) in zip(held, res) if r['kind'] == k), sum(r['kind'] == k for r in held)) for k in dict.fromkeys(r['kind'] for r in held)}
        print(f"{name}: {sum(ok for ok, _ in res)} of {len(held)} answers passed their agent's rules (" + ', '.join(f'{k} {p} of {t}' for k, (p, t) in per.items()) + ')', flush=True)
    (d / 'score-answers.json').write_text(json.dumps(saved, ensure_ascii=False), encoding='utf-8')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('data'); p.add_argument('--dir', required=True); p.add_argument('--scale', type=float, default=1)
    p = sub.add_parser('score'); p.add_argument('--dir', required=True)
    a = ap.parse_args()
    {'data': cmd_data, 'score': cmd_score}[a.cmd](a)
