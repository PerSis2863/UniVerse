import { NextRequest, NextResponse } from 'next/server';

// Simple invite code lookup - maps codes to roles
const INVITE_ROLES: Record<string, string> = {
  STU: 'STUDENT',
  UNI: 'TEACHER',
  NGO: 'ADMIN',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No invite code provided' }, { status: 400 });
  }

  // Extract prefix (e.g., STU_XYZ -> STU)
  const prefix = code.split('_')[0]?.toUpperCase();
  const role = INVITE_ROLES[prefix];

  if (!role) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 });
  }

  return NextResponse.json({ role, code });
}
