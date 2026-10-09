import { route } from '@/server/assignments';
import { scanCopy } from '@/server/library';

// A scanned copy at the desk (Stage 5 · B15.4). GET ?barcode=. Needs library.manage.
export const GET = (req: Request) => route(req, (user) => scanCopy(user, new URL(req.url).searchParams.get('barcode')));
