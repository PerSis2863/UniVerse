import { api } from '@/server/app';

// Serves the platform API (formerly the NestJS app on Render) at /api/core/*.
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path } = await params;
  return api.handle(req, path.map(encodeURIComponent).join('/'));
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
