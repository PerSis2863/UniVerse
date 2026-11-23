// Languages chat messages can be translated into (ISO 639-1 code → English name, own name). Of India's languages only
// Hindi, and not Urdu (the owner, 22 Nov, M403); a message written in another one is still named (Intl).
export const LANGUAGES: Record<string, { name: string; native: string }> = {
  en: { name: 'English', native: 'English' },
  fr: { name: 'French', native: 'Français' },
  es: { name: 'Spanish', native: 'Español' },
  hi: { name: 'Hindi', native: 'हिन्दी' },
  de: { name: 'German', native: 'Deutsch' },
  it: { name: 'Italian', native: 'Italiano' },
  pt: { name: 'Portuguese', native: 'Português' },
  ar: { name: 'Arabic', native: 'العربية' },
  zh: { name: 'Chinese', native: '中文' },
  ja: { name: 'Japanese', native: '日本語' },
  ko: { name: 'Korean', native: '한국어' },
  ru: { name: 'Russian', native: 'Русский' },
  tr: { name: 'Turkish', native: 'Türkçe' },
  nl: { name: 'Dutch', native: 'Nederlands' },
  pl: { name: 'Polish', native: 'Polski' },
  sw: { name: 'Swahili', native: 'Kiswahili' },
  id: { name: 'Indonesian', native: 'Bahasa Indonesia' },
};
export const isLanguage = (x: unknown): x is string => typeof x === 'string' && Object.hasOwn(LANGUAGES, x);
const named = (code: string) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code); } catch { return undefined; } };
export const languageName = (code: string) => (isLanguage(code) ? LANGUAGES[code].name : undefined) ?? (code === 'und' ? 'another language' : named(code) ?? code.toUpperCase());
