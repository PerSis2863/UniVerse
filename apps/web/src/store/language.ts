import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Language, t as translate } from '@/lib/i18n';
import { applyLanguage } from '@/lib/language-script';

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
        // lang for screen readers, and right to left for Arabic and Urdu (Stage 5 · Q21).
        applyLanguage(lang);
      },
      t: (key: string) => translate(key, get().language),
    }),
    { name: 'universe-language', onRehydrateStorage: () => (state) => { if (state) applyLanguage(state.language); } }
  )
);
