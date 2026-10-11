import { route } from '@/server/assignments';
import { linkCard } from '@/server/link-cards';

// A live card for a link to the app's own doc, whiteboard or task board (Stage 5 · B7.10). GET ?kind=&id=
export const GET = (req: Request) => route(req, (user) => { const sp = new URL(req.url).searchParams; return linkCard(user, sp.get('kind'), sp.get('id')); });
