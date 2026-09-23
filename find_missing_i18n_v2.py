import os
import re

def get_i18n_keys(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    match = re.search(r'en:\s*{([^}]+)}', content, re.DOTALL)
    if not match: return set()
    return set(re.findall(r'[\'"]([a-zA-Z0-9_\.]+)[\'"]\s*:', match.group(1)))

def find_used_keys(directory):
    used_keys = set()
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                with open(os.path.join(root, file), 'r') as f:
                    content = f.read()
                    
                    # Look for t('key') or t("key") or label: 'key' where key has a dot
                    matches = re.findall(r'(?:t\(|label:\s*)[\'"]([a-zA-Z0-9_\.]+)[\'"]', content)
                    for m in matches:
                        if '.' in m or '_' in m:  # i18n keys generally have a dot or underscore
                            if m not in ['a', 'T', 'filename', 'success', 'canceled']:
                                used_keys.add(m)
    return used_keys

defined = get_i18n_keys('./apps/web/src/lib/i18n.ts')
used = find_used_keys('./apps/web/src')

missing = used - defined
print("Missing keys:")
for k in sorted(missing):
    print(f"  {k}")
