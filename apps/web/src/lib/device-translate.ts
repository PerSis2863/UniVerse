// The browser's own translator (Chrome's built-in Translator and Language Detector), tried before
// the AI for class content (Stage 5 · Q22, D8): free, on the device, works offline, and nothing is
// sent anywhere. Not on data saver (the first use of a language pair may download its model).
// null whenever it can't (another browser, an unsupported pair, too unsure of the language).

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type Pair = { sourceLanguage: string; targetLanguage: string };
interface TranslatorApi { availability(o: Pair): Promise<Availability>; create(o: Pair): Promise<{ translate(text: string): Promise<string> }> }
interface DetectorApi { availability(): Promise<Availability>; create(): Promise<{ detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }> }

const translators = new Map<string, Promise<{ translate(text: string): Promise<string> }>>();

export async function deviceTranslate(text: string, to: string): Promise<{ text: string; from: string; same: boolean } | null> {
  const g = globalThis as { Translator?: TranslatorApi; LanguageDetector?: DetectorApi };
  if (!g.Translator || !g.LanguageDetector || !text.trim()) return null;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return null;
  try {
    if ((await g.LanguageDetector.availability()) === 'unavailable') return null;
    const [best] = await (await g.LanguageDetector.create()).detect(text.slice(0, 2000));
    if (!best || best.confidence < 0.6 || best.detectedLanguage === 'und') return null;
    const from = best.detectedLanguage.split('-')[0];
    if (from === to) return { text, from, same: true };
    const pair = { sourceLanguage: from, targetLanguage: to };
    if ((await g.Translator.availability(pair)) === 'unavailable') return null;
    const key = `${from}>${to}`;
    if (!translators.has(key)) translators.set(key, g.Translator.create(pair));
    const out = await (await translators.get(key)!).translate(text);
    return out?.trim() ? { text: out, from, same: false } : null;
  } catch {
    return null;
  }
}
