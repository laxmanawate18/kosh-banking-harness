/** Kosh is English-only. t() stays as the one place copy passes through, and keeps the {placeholder} substitution. */
export type Lang = 'en';

export function translate(_lang: Lang, key: string, vars?: Record<string, string | number>): string {
  return vars ? key.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : key;
}

const I18N = { lang: 'en' as Lang, t: (key: string, vars?: Record<string, string | number>) => translate('en', key, vars) };
export const useI18n = () => I18N;
