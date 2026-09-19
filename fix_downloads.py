import os
import re

directory = 'apps/web/src'
dummy_pdf_link = "window.open('/assets/dummy.pdf', '_blank')"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content
    
    # Replace onClick={() => toast.success('Downloading...')} with window.open
    content = re.sub(
        r"onClick=\{.*?\btoast\.(?:success|info)\(\s*[`'\"](?:Downloading|Opening|Download).*?[`'\"]\s*\).*?\}",
        f"onClick={{() => {dummy_pdf_link}}}",
        content
    )
    
    # In student/information/page.tsx:
    # const handleViewDoc = (docName: string) => { toast.info(`Opening ${docName}...`); }
    content = re.sub(
        r"const handleViewDoc = \(docName: string\) => \{\s*toast\.info\([^)]+\);\s*\}",
        f"const handleViewDoc = (docName: string) => {{ {dummy_pdf_link}; }}",
        content
    )
    
    # In student/administrative/documents/page.tsx:
    # <button onClick={() => toast.success('Viewing document...')} ...>
    content = re.sub(
        r"onClick=\{.*?\btoast\.success\('Viewing document\.\.\.'\).*?\}",
        f"onClick={{() => {dummy_pdf_link}}}",
        content
    )
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
