import os
import glob
import re

base_dir = "apps/web/src/app/(dashboard)"
pages = glob.glob(f"{base_dir}/**/*.tsx", recursive=True)

for page in pages:
    if "layout.tsx" in page or "template.tsx" in page:
        continue

    with open(page, 'r') as f:
        content = f.read()

    # Only process if DashboardShell is in the file
    if "DashboardShell" in content:
        # Remove import
        content = re.sub(r"import\s*\{\s*DashboardShell\s*\}\s*from\s*['\"]@/components/layout/DashboardShell['\"];?\n?", "", content)
        
        # Replace opening tag
        content = re.sub(r"<DashboardShell>", "<>", content)
        
        # Replace closing tag
        content = re.sub(r"</DashboardShell>", "</>", content)

        with open(page, 'w') as f:
            f.write(content)
        print(f"Updated {page}")

