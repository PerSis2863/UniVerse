import { dictionaryResponse } from '@/server/ui-translations';

// GET: the app's screens in this language (Stage 5 · Q21, src/server/ui-translations.ts). Public:
// it's the same for everyone, and the sign-in pages need it too.
export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  return dictionaryResponse((await params).lang, req.headers.get('if-none-match'));
}
