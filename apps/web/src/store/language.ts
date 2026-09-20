import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Language, t as translate } from '@/lib/i18n';

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set, get) => ({
      language: 'en',
      setLanguage: (lang) => {
        set({ language: lang });
        // Update document lang attribute for accessibility
        if (typeof document !== 'undefined') {
          document.documentElement.lang = lang;
        }
      },
      t: (key: string) => translate(key, get().language),
    }),
    { name: 'universe-language' }
  )
);
