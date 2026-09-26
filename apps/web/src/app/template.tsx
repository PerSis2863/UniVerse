// Root template intentionally renders children without a transform wrapper.
// A transformed/filtered ancestor turns every position:fixed element (mobile header,
// tab bar, modals) into a scrolling element, which broke the mobile layout.
// Dashboard pages animate in via app/(dashboard)/template.tsx instead.
export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
