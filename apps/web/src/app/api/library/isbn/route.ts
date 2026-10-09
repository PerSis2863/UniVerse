import { route } from '@/server/assignments';
import { isbnInfo } from '@/server/library';

// An ISBN looked up on Open Library (Stage 5 · B15.4). GET ?isbn=. Needs library.manage.
export const GET = (req: Request) => route(req, (user) => isbnInfo(user, new URL(req.url).searchParams.get('isbn')));
