import { AuthFrame } from '@/components/auth/AuthFrame';

// Sign in and sign up (src/components/auth/AuthFrame.tsx has the frame: the river, the picture, the form card).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
