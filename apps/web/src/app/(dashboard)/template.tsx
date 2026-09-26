// Re-mounts on every navigation, so the CSS page-enter animation plays on each page.
// CSS (transform/opacity only, no fill-mode) is lighter than JS springs and leaves no
// transform behind that would break position:fixed modals inside the page.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-col flex-1 min-w-0">{children}</div>;
}
