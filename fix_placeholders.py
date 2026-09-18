import os
import glob

base_dir = "apps/web/src/app/(dashboard)"
pages = glob.glob(f"{base_dir}/**/*.tsx", recursive=True)

template = """'use client';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { Topbar } from '@/components/layout/Topbar';
import { Hammer } from 'lucide-react';

export default function {ComponentName}() {
  return (
    <DashboardShell>
      <Topbar title="{Title}" subtitle="This page is under construction" />
      <div className="flex-1 p-8 overflow-y-auto flex items-center justify-center">
        <div className="card text-center py-12 max-w-md w-full">
          <Hammer className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">{Title} (Coming Soon)</h2>
          <p className="text-zinc-400">We're working hard to bring you this feature for the {Role} role.</p>
        </div>
      </div>
    </DashboardShell>
  );
}
"""

for page in pages:
    with open(page, 'r') as f:
        content = f.read()
    
    if "export default function Page()" in content and "under construction" in content:
        # It's an unstyled placeholder.
        # Determine role and title from path
        parts = page.split('/')
        role = parts[-3].capitalize()
        title = parts[-2].capitalize().replace('-', ' ')
        
        component_name = f"{role}{parts[-2].capitalize().replace('-', '')}"
        
        new_content = template.replace("{ComponentName}", component_name)
        new_content = new_content.replace("{Title}", title)
        new_content = new_content.replace("{Role}", role.lower())
        
        with open(page, 'w') as f:
            f.write(new_content)
        print(f"Updated {page}")

