/** Parses a scanned `upi://pay?pa=...&pn=...&am=...` payload. Returns null for anything else. */
export function parseUpi(text: string): { pa: string; pn: string; am?: string } | null {
  try {
    const url = new URL(text.trim());
    if (url.protocol !== 'upi:') return null;
    const pa = url.searchParams.get('pa') || '';
    if (!/^[\w.-]{2,256}@[a-zA-Z][\w.-]{1,63}$/.test(pa)) return null;
    return { pa, pn: url.searchParams.get('pn') || pa.split('@')[0], am: url.searchParams.get('am') || undefined };
  } catch {
    return null;
  }
}
