const fs = require('fs');
const path = require('path');

const sidebarContent = fs.readFileSync('apps/web/src/components/layout/Sidebar.tsx', 'utf8');
const routes = [...sidebarContent.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1]);

const uniqueRoutes = [...new Set(routes)].filter(r => r.startsWith('/'));
const missingRoutes = [];

uniqueRoutes.forEach(route => {
  // e.g. /admin/impact-metrics -> apps/web/src/app/(dashboard)/admin/impact-metrics/page.tsx
  // /student -> apps/web/src/app/(dashboard)/student/page.tsx
  
  let pagePath = `apps/web/src/app/(dashboard)${route}/page.tsx`;
  if (!fs.existsSync(pagePath)) {
    missingRoutes.push(route);
  }
});

console.log("Missing Routes:", missingRoutes);
