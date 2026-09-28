import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'hi' | 'mr';
type Entry = { hi?: string; mr?: string };
type Dict = Record<string, Entry>;

// Every *.json in this folder is a dictionary keyed by the English string: { "Send money": { "hi": "...", "mr": "..." } }.
// They load lazily (~280 KB of Devanagari) so English visitors never download them.
const LOADERS = import.meta.glob<Dict>('./*.json', { import: 'default' });
let DICT: Dict = {};
let loading: Promise<void> | null = null;
const loadDict = () =>
  (loading ??= Promise.all(Object.values(LOADERS).map(load => load())).then(parts => { DICT = Object.assign({}, ...parts); }));

export const LANGS: { id: Lang; label: string; short: string; htmlLang: string }[] = [
  { id: 'en', label: 'English', short: 'EN', htmlLang: 'en-IN' },
  { id: 'hi', label: 'हिन्दी', short: 'हिं', htmlLang: 'hi' },
  { id: 'mr', label: 'मराठी', short: 'मरा', htmlLang: 'mr' },
];

const STORAGE_KEY = 'kosh.lang';

const initialLang = (): Lang => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'hi' || saved === 'mr' ? saved : 'en';
};

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const text = lang === 'en' ? key : DICT[key]?.[lang] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

type I18n = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string };

const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) });

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    document.documentElement.lang = LANGS.find(l => l.id === lang)!.htmlLang;
    localStorage.setItem(STORAGE_KEY, lang);
    if (lang !== 'en') loadDict().then(() => setVersion(v => v + 1));
  }, [lang]);

  // `version` bumps when dictionaries arrive so every t() consumer re-renders with the translations.
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang, version]);
  const value = useMemo(() => ({ lang, setLang: setLangState, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
