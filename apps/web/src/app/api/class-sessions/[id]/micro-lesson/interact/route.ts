import { route } from '@/server/assignments';
import { trackMicroLessonInteraction } from '@/server/lecture-micro-lessons';

type Ctx = { params: Promise<{ id: string }> };

// Stage 5 · D3: Record view/interaction telemetry for a revision reel
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => {
    let reelId: string | null = null;
    try {
      const body = (await req.json()) as { reelId?: string };
      reelId = body.reelId || null;
    } catch {
      // body empty or non-json
    }
    return trackMicroLessonInteraction((await params).id, reelId, user);
  });
