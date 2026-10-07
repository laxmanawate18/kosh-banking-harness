export type Theme = 'light' | 'dark';
export type ContrastMode = 'normal' | 'more';
export type DisplayPrefs = { theme: Theme; contrast: ContrastMode; zoom: number };

export const ZOOM_STEPS = [0.9, 1, 1.125];
const KEY = 'kosh.display';

export function loadPrefs(): DisplayPrefs {
  // Dark platinum is the brand default; a saved choice (e.g. light for accessibility) still wins.
  const fallback: DisplayPrefs = { theme: 'dark', contrast: 'normal', zoom: 1 };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved ? { ...fallback, ...saved } : fallback;
  } catch {
    return fallback;
  }
}

/** Display state lives on <html> attributes; CSS reads them. `zoom` is the native, layout-aware text-size control. */
export function applyPrefs(p: DisplayPrefs) {
  const html = document.documentElement;
  html.dataset.theme = p.theme;
  html.dataset.contrast = p.contrast;
  html.style.zoom = p.zoom === 1 ? '' : String(p.zoom);
  html.style.colorScheme = p.theme;
  localStorage.setItem(KEY, JSON.stringify(p));
}

/** Crossfade the whole page into a new look (theme, language). Instant when reduced motion is on or unsupported. */
export function crossfade(update: () => void) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) update();
  else document.startViewTransition(update);
}
