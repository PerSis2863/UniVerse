// An API address as a route for the Health numbers (owner console), so requests for different
// records group together: "/api/core/courses/cmulde0g9…/students" → "/api/core/courses/:id/students".
// Ids, numbers, emails, tokens and anything %-encoded become ":id". No imports: the Worker uses it.
export const routeOf = (path: string) =>
  path
    .split('/')
    .slice(0, 8)
    .map((seg) => (/^\d+$|^[A-Za-z0-9_-]{16,}$|[%@.:]|^g_|^c_|^l_|^r_|^pm_/.test(seg) ? ':id' : seg.slice(0, 40)))
    .join('/');
