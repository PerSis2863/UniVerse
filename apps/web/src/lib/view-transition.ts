type Router = { push: (href: string) => void };
type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };

/**
 * Navigate with a View Transition so elements sharing a `view-transition-name`
 * (e.g. a course card and the Blackboard header) morph from one page to the next.
 * Falls back to a normal navigation where unsupported or with "Reduce motion".
 */
export function navigateWithTransition(router: Router, href: string) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    router.push(href);
    return;
  }
  doc.startViewTransition(() => new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('universe:route-rendered', finish);
      resolve();
    };
    window.addEventListener('universe:route-rendered', finish);
    setTimeout(finish, 900); // never hold the screen longer than this
    router.push(href);
  }));
}

/** CSS-safe view-transition-name for a record id. */
export const vtName = (kind: string, id: string) => `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
