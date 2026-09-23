import os
import re
import ast

def get_i18n_keys(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Very crude regex to extract keys from the English dictionary in i18n.ts
    # Look for 'key': 'value' or "key": "value" inside the en block
    match = re.search(r'en:\s*{([^}]+)}', content, re.DOTALL)
    if not match:
        return set()
    
    en_block = match.group(1)
    keys = set(re.findall(r'[\'"]([a-zA-Z0-9_\.]+)[\'"]\s*:', en_block))
    return keys

def find_used_keys(directory):
    used_keys = set()
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                with open(os.path.join(root, file), 'r') as f:
                    content = f.read()
                    
                    # Find t('key') or t("key")
                    matches = re.findall(r't\([\'"]([a-zA-Z0-9_\.]+)[\'"]\)', content)
                    used_keys.update(matches)
                    
                    # Find label: 'nav.xxx' in Sidebar.tsx
                    matches2 = re.findall(r'label:\s*[\'"]([a-zA-Z0-9_\.]+)[\'"]', content)
                    # Filter only ones that look like i18n keys (e.g. have a dot)
                    for m in matches2:
                        if '.' in m:
                            used_keys.add(m)
                            
    return used_keys

if __name__ == '__main__':
    defined_keys = get_i18n_keys('./apps/web/src/lib/i18n.ts')
    used_keys = find_used_keys('./apps/web/src')
    
    missing_keys = used_keys - defined_keys
    
    if missing_keys:
        print("Missing keys:")
        for key in sorted(missing_keys):
            print(f"  {key}")
    else:
        print("No missing keys found!")
