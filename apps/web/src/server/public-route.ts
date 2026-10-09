import { NextResponse } from 'next/server';
import { HttpException } from './http';

/** Runs a handler for a page anyone may use (no sign-in): JSON out, HttpExceptions as { error, …details }. */
export async function publicRoute(run: () => Promise<unknown>) {
  try {
    return NextResponse.json(await run(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (!(e instanceof HttpException)) throw e;
    const body = typeof e.response === 'object' ? { ...e.response, error: e.message } : { error: e.message };
    return NextResponse.json(body, { status: e.getStatus() });
  }
}
