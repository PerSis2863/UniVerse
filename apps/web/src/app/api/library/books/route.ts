import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { addBook } from '@/server/library';

// Add a book with its copies (Stage 5 · B15.4). Needs library.manage.
export const POST = (req: Request) => route(req, async (user) => {
  const out = await addBook(user, await req.json().catch(() => ({})));
  audit(user, { action: 'library.book_added', summary: `Added “${out.title}” to the library (${out.barcodes.length} cop${out.barcodes.length === 1 ? 'y' : 'ies'})`, targetType: 'library-book', targetId: out.id }, req);
  return out;
});
