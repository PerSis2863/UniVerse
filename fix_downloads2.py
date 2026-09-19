import re

with open('apps/web/src/app/(dashboard)/student/information/page.tsx', 'r') as f:
    c = f.read()
c = re.sub(r'toast\.info\([^)]+\)', "window.open('/assets/dummy.pdf', '_blank')", c)
with open('apps/web/src/app/(dashboard)/student/information/page.tsx', 'w') as f:
    f.write(c)

with open('apps/web/src/app/(dashboard)/student/knowledge-hub/page.tsx', 'r') as f:
    c = f.read()
c = re.sub(r'toast\.success\([^)]+Downloading[^)]+\)', "window.open('/assets/dummy.pdf', '_blank')", c)
with open('apps/web/src/app/(dashboard)/student/knowledge-hub/page.tsx', 'w') as f:
    f.write(c)

with open('apps/web/src/app/(dashboard)/teacher/knowledge/page.tsx', 'r') as f:
    c = f.read()
c = re.sub(r'toast\.success\([^)]+(?:Downloading|Opening)[^)]+\)', "window.open('/assets/dummy.pdf', '_blank')", c)
with open('apps/web/src/app/(dashboard)/teacher/knowledge/page.tsx', 'w') as f:
    f.write(c)

