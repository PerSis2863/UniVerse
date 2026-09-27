import { redirect } from 'next/navigation';

// Short invite links (/join/ABC123) resolve through the real invite flow at /join?code=ABC123.
export default async function JoinWithCodePage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  redirect(`/join?code=${encodeURIComponent(inviteCode)}`);
}
