import type { Router } from '../router';
import { languageStatus, readChunk, saveChunk, translateBatch } from '../ui-translations';

// Owner console → Languages (Stage 5 · Q21): draft the app's screens in a language with the AI
// translator, a batch at a time, and correct any translation (src/server/ui-translations.ts).
export default function ownerLanguagesModule(router: Router) {
  const r = router.controller('owner', { owner: true });
  r.get('i18n', () => languageStatus());
  r.post('i18n/translate', ({ user, body }) => translateBatch(user, body));
  r.get<{ lang: string; chunk: string }>('i18n/:lang/:chunk', ({ params }) => readChunk(params.lang, Number(params.chunk)));
  r.put<{ lang: string; chunk: string }>('i18n/:lang/:chunk', ({ params, body }) => saveChunk(params.lang, Number(params.chunk), body));
}
