// Runs in the page's <head> before anything is drawn (src/app/layout.tsx): the saved language's
// lang and direction on <html>, so Arabic and Urdu open right to left without a flash (Stage 5 · Q21).
export const RTL_LANGUAGES = ['ar', 'ur'];
export const LANGUAGE_SCRIPT = `(function(){try{var l=JSON.parse(localStorage.getItem('universe-language')||'{}').state;l=l&&l.language;if(l&&/^[a-z]{2}$/.test(l)){var h=document.documentElement;h.lang=l;h.dir=${JSON.stringify(RTL_LANGUAGES)}.indexOf(l)>-1?'rtl':'ltr';}}catch(e){}})();`;

/** Sets lang and direction on <html> for a language (when it changes). */
export function applyLanguage(lang: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
  window.dispatchEvent(new Event('uv-language')); // the screen translator loads if needed (UiTranslatorGate)
}
