import os
import re

def replace_classes(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    replacements = {
        r'\btext-white\b': 'text-zinc-900 dark:text-white',
        r'\btext-zinc-400\b': 'text-zinc-600 dark:text-zinc-400',
        r'\btext-zinc-500\b': 'text-zinc-500 dark:text-zinc-500',
        r'\bbg-zinc-900\b': 'bg-white dark:bg-zinc-900',
        r'\bbg-zinc-950\b': 'bg-zinc-50 dark:bg-zinc-950',
        r'\bbg-zinc-800\b': 'bg-zinc-100 dark:bg-zinc-800',
        r'\bbg-zinc-900/50\b': 'bg-white/50 dark:bg-zinc-900/50',
        r'\bborder-zinc-800\b': 'border-zinc-200 dark:border-zinc-800',
        r'\bborder-white/\[0\.06\]\b': 'border-zinc-200 dark:border-white/[0.06]',
        r'\bborder-white/\[0\.08\]\b': 'border-zinc-200 dark:border-white/[0.08]',
        r'\bborder-white/10\b': 'border-zinc-200 dark:border-white/10',
        r'\bborder-white/20\b': 'border-zinc-300 dark:border-white/20',
        r'\bbg-white/\[0\.03\]\b': 'bg-zinc-100 dark:bg-white/[0.03]',
        r'\bbg-white/\[0\.06\]\b': 'bg-zinc-200 dark:bg-white/[0.06]',
        r'\bbg-white/10\b': 'bg-zinc-200 dark:bg-white/10',
        r'\bbg-white/5\b': 'bg-zinc-100 dark:bg-white/5',
        r'\bbg-\[\#09090b\]\b': 'bg-white dark:bg-[#09090b]',
        r'\bhover:bg-zinc-800/50\b': 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50',
        r'\bhover:bg-white/5\b': 'hover:bg-zinc-100 dark:hover:bg-white/5',
        r'\bhover:text-white\b': 'hover:text-zinc-900 dark:hover:text-white',
    }

    # Negative lookbehind to not match if already prefixed with dark:
    for pattern, replacement in replacements.items():
        content = re.sub(r'(?<!dark:)' + pattern, replacement, content)

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")

def walk_dir(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                replace_classes(os.path.join(root, file))

if __name__ == '__main__':
    target_dir = os.path.join(os.path.dirname(__file__), 'apps', 'web', 'src')
    print(f"Scanning {target_dir}")
    walk_dir(target_dir)
