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

export const canSpeak = () => typeof window !== 'undefined' && (typeof Audio !== 'undefined' || 'speechSynthesis' in window);

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
let player: HTMLAudioElement | null = null;
const listeners = new Set<(id: string | null) => void>();
const announce = (id: string | null) => { speakingId = id; listeners.forEach(l => l(id)); };

/** Device voice, used only when Gemini text-to-speech is unreachable. */
function speakWithBrowser(id: string, words: string) {
  if (!('speechSynthesis' in window)) { announce(null); return; }
  const u = new SpeechSynthesisUtterance(words);
  u.lang = speechLang(words);
  const v = voiceFor(u.lang);
  if (v) u.voice = v;
  u.onend = u.onerror = () => { if (speakingId === id) announce(null); };
  window.speechSynthesis.speak(u);
}

/** Sentence-sized pieces: a short first piece so audio starts quickly, longer ones after it. */
export function speechChunks(words: string): string[] {
  const sentences = words.match(/[^.!?।]+[.!?।]*\s*/g) || [words];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const limit = chunks.length === 0 ? 110 : 420;
    if (current && (current + sentence).length > limit) { chunks.push(current.trim()); current = ''; }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

let aborter: AbortController | null = null;

async function fetchSpeech(text: string, signal: AbortSignal): Promise<string> {
  const res = await fetch('/api/chat/speak', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`speak ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

const playUrl = (url: string) => new Promise<void>((resolve, reject) => {
  const audio = new Audio(url);
  player = audio;
  audio.onended = () => resolve();
  audio.onerror = () => reject(new Error('audio'));
  audio.play().catch(reject);
});

/** Stream Gemini TTS: 16-bit PCM arrives in chunks and plays through Web Audio as it comes (~2 s to first sound). */
let audioCtx: AudioContext | null = null;

async function speakStreaming(id: string, words: string, signal: AbortSignal): Promise<boolean> {
  const res = await fetch('/api/chat/speak/stream', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: words }),
  });
  if (!res.ok || !res.body) throw new Error(`speak stream ${res.status}`);
  const rate = Number(res.headers.get('X-Sample-Rate')) || 24000;
  const ctx = new AudioContext({ sampleRate: rate });
  audioCtx = ctx;
  const reader = res.body.getReader();
  let leftover = new Uint8Array(0);
  let pending: Float32Array<ArrayBuffer>[] = [];
  let pendingSamples = 0;
  let playAt = 0;
  let lastSource: AudioBufferSourceNode | null = null;
  let started = false;
  const flush = () => {
    if (!pendingSamples) return;
    const buffer = ctx.createBuffer(1, pendingSamples, rate);
    let offset = 0;
    for (const piece of pending) { buffer.copyToChannel(piece, 0, offset); offset += piece.length; }
    pending = []; pendingSamples = 0;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    playAt = Math.max(playAt, ctx.currentTime + (started ? 0 : 0.05));
    source.start(playAt);
    playAt += buffer.duration;
    lastSource = source;
    started = true;
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done || signal.aborted || speakingId !== id) break;
    const bytes = new Uint8Array(leftover.length + value.length);
    bytes.set(leftover); bytes.set(value, leftover.length);
    const usable = bytes.length - (bytes.length % 2);
    leftover = bytes.slice(usable);
    const view = new DataView(bytes.buffer, 0, usable);
    const samples = new Float32Array(usable / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    pending.push(samples); pendingSamples += samples.length;
    // Start after ~0.25 s of audio, then schedule ~0.5 s buffers back-to-back so playback never starves.
    if (pendingSamples >= rate * (started ? 0.5 : 0.25)) flush();
  }
  if (signal.aborted || speakingId !== id) return started;
  flush();
  if (!lastSource) return false;
  await new Promise<void>(resolve => { lastSource!.onended = () => resolve(); });
  if (audioCtx === ctx) { audioCtx = null; ctx.close(); }
  if (speakingId === id) announce(null);
  return true;
}

/** Read a reply aloud with Gemini TTS (same voice on every device, natural Hindi and Marathi). */
export async function speak(id: string, text: string) {
  if (!canSpeak()) return;
  stopSpeaking();
  const words = speakable(text);
  if (!words) return;
  announce(id);
  const controller = new AbortController();
  aborter = controller;
  try {
    if (typeof AudioContext !== 'undefined' && await speakStreaming(id, words, controller.signal)) return;
  } catch {
    if (controller.signal.aborted || speakingId !== id) return;
  } finally {
    if (aborter === controller && !controller.signal.aborted) aborter = null;
  }
  if (speakingId === id && !controller.signal.aborted) await speakInPieces(id, words);
}

/** Fallback: sentence-sized WAV pieces, next one prefetched while the current plays. */
async function speakInPieces(id: string, words: string) {
  const controller = new AbortController();
  aborter = controller;
  const chunks = speechChunks(words);
  // Keep the next piece downloading while the current one plays.
  const pending = chunks.map(() => null as Promise<string> | null);
  const load = (i: number) => (pending[i] ??= fetchSpeech(chunks[i], controller.signal));
  let started = false;
  try {
    for (let i = 0; i < chunks.length; i++) {
      const url = await load(i);
      if (i + 1 < chunks.length) load(i + 1);
      if (controller.signal.aborted || speakingId !== id) { URL.revokeObjectURL(url); return; }
      started = true;
      try { await playUrl(url); } finally { URL.revokeObjectURL(url); }
    }
    if (speakingId === id) announce(null);
  } catch {
    if (controller.signal.aborted || speakingId !== id) return;
    if (!started) speakWithBrowser(id, words);  // Gemini voice unreachable: fall back to the device voice
    else announce(null);
  } finally {
    if (aborter === controller) aborter = null;
    player = null;
  }
}

export function stopSpeaking() {
  aborter?.abort();
  aborter = null;
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (player) { player.pause(); player = null; }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  announce(null);
}

/** The id of the message being read aloud right now (null when silent). */
export function useSpeaking() {
  const [id, setId] = useState<string | null>(speakingId);
  useEffect(() => { listeners.add(setId); return () => { listeners.delete(setId); }; }, []);
  return id;
}
