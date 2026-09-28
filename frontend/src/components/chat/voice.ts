import { useEffect, useRef, useState } from 'react';

/* Mitra voice: live dictation into the message box, and replies read aloud.
   Live text uses the browser's speech recognition (Chrome, Edge, Safari). Browsers without it
   record the clip and transcribe it on the server when the customer stops. */

export type DictationLang = 'en-IN' | 'hi-IN' | 'mr-IN';
export const DICTATION_LANGS: [DictationLang, string][] = [['en-IN', 'EN'], ['hi-IN', 'हिं'], ['mr-IN', 'मरा']];

type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
const Recognition = (): (new () => Recognition) | undefined =>
  typeof window === 'undefined' ? undefined : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
export const canDictate = () => !!Recognition() || canRecord();

const join = (base: string, spoken: string) => (base && spoken ? `${base.replace(/\s+$/, '')} ${spoken.trimStart()}` : base + spoken);

/**
 * Dictation into a text field. `onText` receives base text + everything heard so far (interim words included),
 * so the customer sees their words appear while speaking.
 */
export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const cb = useRef({ onText, onError });
  cb.current = { onText, onError };

  useEffect(() => () => stopRef.current?.(), []);

  const startLive = (SR: new () => Recognition, base: string, lang: DictationLang) => {
    const rec = new SR();
    rec.lang = lang; rec.interimResults = true; rec.continuous = true;
    rec.onresult = e => {
      let heard = '';
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      cb.current.onText(join(base, heard));
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') cb.current.onError('Microphone access is blocked. Allow it in your browser settings to use voice.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') cb.current.onError('Voice input stopped. Tap the mic to try again.');
    };
    rec.onend = () => { stopRef.current = null; setListening(false); };
    rec.start();
    stopRef.current = () => rec.stop();
    setListening(true);
  };

  const startRecorded = async (base: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const cap = window.setTimeout(() => recorder.stop(), 60_000);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      clearTimeout(cap);
      stream.getTracks().forEach(t => t.stop());
      stopRef.current = null;
      setListening(false);
      const blob = new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] });
      if (!blob.size) return;
      setTranscribing(true);
      try { cb.current.onText(join(base, await transcribe(blob))); }
      catch (err) { cb.current.onError(err instanceof Error ? err.message : 'Could not understand that. Please try again.'); }
      finally { setTranscribing(false); }
    };
    recorder.start();
    stopRef.current = () => recorder.stop();
    setListening(true);
  };

  const start = async (base: string, lang: DictationLang) => {
    stopRef.current?.();
    const SR = Recognition();
    try {
      if (SR) startLive(SR, base, lang);
      else await startRecorded(base);
    } catch {
      cb.current.onError('Microphone access is blocked. Allow it in your browser settings to use voice.');
    }
  };
  const stop = () => stopRef.current?.();

  return { listening, transcribing, start, stop };
}

async function transcribe(blob: Blob): Promise<string> {
  const res = await fetch('/api/chat/transcribe', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'audio/webm' }, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not understand that. Please try again.');
  return body.text as string;
}

/* ------------------------------------------------------------------ speaking replies */

const MR = /(आहे|आहेत|नाही|तुमच|माझ|करा|झाले|मिळेल|साठी)/;
/** Best-effort language for a reply: Devanagari → Marathi or Hindi, otherwise Indian English. */
export const speechLang = (text: string) => (/[ऀ-ॿ]/.test(text) ? (MR.test(text) ? 'mr-IN' : 'hi-IN') : 'en-IN');

/** Markdown and the hidden suggestion block are for eyes, not ears. */
export const speakable = (md: string) => md
  .replace(/SUGGESTIONS:\s*\[.*?\]/gis, '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>|~]+/g, ' ')
  .replace(/^\s*[-•]\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function voiceFor(lang: string) {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split('-')[0];
  return voices.find(v => v.lang.replace('_', '-') === lang)
    || voices.find(v => v.lang.startsWith(base))
    // No Marathi voice installed on most systems: a Hindi voice reads Devanagari well.
    || (base === 'mr' ? voices.find(v => v.lang.startsWith('hi')) : undefined)
    || (base === 'en' ? voices.find(v => v.lang.startsWith('en')) : undefined);
}

let speakingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();
const announce = (id: string | null) => { speakingId = id; listeners.forEach(l => l(id)); };

export function speak(id: string, text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const words = speakable(text);
  if (!words) return;
  const u = new SpeechSynthesisUtterance(words);
  u.lang = speechLang(words);
  const v = voiceFor(u.lang);
  if (v) u.voice = v;
  u.onend = u.onerror = () => { if (speakingId === id) announce(null); };
  announce(id);
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  announce(null);
}

/** The id of the message being read aloud right now (null when silent). */
export function useSpeaking() {
  const [id, setId] = useState<string | null>(speakingId);
  useEffect(() => { listeners.add(setId); return () => { listeners.delete(setId); }; }, []);
  return id;
}
