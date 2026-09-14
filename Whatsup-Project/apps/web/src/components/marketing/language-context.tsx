"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LANGUAGES, translations, type LangCode, type Dict } from "@/lib/i18n";

const LANG_KEY = "site_lang";

const LanguageContext = createContext<{ lang: LangCode; setLang: (l: LangCode) => void; t: Dict }>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as LangCode | null;
      if (saved && translations[saved]) setLangState(saved);
    } catch { /* ignore */ }
  }, []);

  function setLang(l: LangCode) {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }

  const value = useMemo(() => ({ lang, setLang, t: translations[lang] ?? translations.en }), [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { LANGUAGES };
