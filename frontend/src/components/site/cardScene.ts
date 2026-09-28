import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* Kosh dark-platinum metal cards in three.js. Lazy-loaded; every mount returns a dispose function. */

export const W = 8.56, H = 5.4;
const R = 0.42, T = 0.07, BEVEL = 0.02;
const TEX_W = 2048, TEX_H = Math.round(TEX_W * (H / W));

/** Card faces: graphite brushed metal with platinum type, or the champagne-gold accent card. */
export type Finish = 'platinum' | 'gold';
const FINISH = {
  platinum: { base: ['#2a2b30', '#0b0b0d'], ink: ['#ffffff', '#e2e4e8', '#a7abb3', '#5f636b'], rosette: 'rgba(226,229,236,0.08)', lines: 0.024, emboss: '#eceef2' },
  gold: { base: ['#e9d3a1', '#9c7331'], ink: ['#3a2a10', '#2a1d08', '#1b1205', '#120c03'], rosette: 'rgba(60,40,10,0.14)', lines: 0.05, emboss: '#2a1d08' },
};

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const grad = (ctx: CanvasRenderingContext2D, stops: string[], x0: number, y0: number, x1: number, y1: number) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
};
const GOLD = ['#fbe7bd', '#e2b964', '#b98530', '#7a5418'];
const spacing = (ctx: CanvasRenderingContext2D, px: number) => { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`; };

function brushed(ctx: CanvasRenderingContext2D, f: typeof FINISH.platinum) {
  ctx.fillStyle = grad(ctx, f.base, 0, 0, TEX_W, TEX_H); ctx.fillRect(0, 0, TEX_W, TEX_H);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < TEX_H; y += 2) {
    ctx.strokeStyle = `rgba(255,255,255,${rand() * f.lines})`;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TEX_W, y + rand() * 2); ctx.stroke();
  }
  const sheen = ctx.createRadialGradient(TEX_W * 0.18, TEX_H * 0.05, 0, TEX_W * 0.18, TEX_H * 0.05, TEX_W * 0.7);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, TEX_W, TEX_H);
}

function lotus(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string | CanvasGradient) {
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = fill;
  const petal = (angle: number, len: number, wid: number) => {
    ctx.save(); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.35, wid * 0.6, -len * 0.85, 0, -len);
    ctx.bezierCurveTo(-wid * 0.6, -len * 0.85, -wid, -len * 0.35, 0, 0);
    ctx.fill(); ctx.restore();
  };
  petal(-1.05, s * 0.72, s * 0.26); petal(1.05, s * 0.72, s * 0.26);
  petal(-0.52, s * 0.9, s * 0.3); petal(0.52, s * 0.9, s * 0.3);
  petal(0, s * 1.05, s * 0.34);
  ctx.fillRect(-s * 0.7, s * 0.12, s * 1.4, s * 0.1);
  ctx.restore();
}

function drawFront(ctx: CanvasRenderingContext2D, finish: Finish, name: string) {
  const f = FINISH[finish];
  brushed(ctx, f);
  ctx.save(); ctx.translate(TEX_W * 0.8, TEX_H * 0.52); ctx.strokeStyle = f.rosette; ctx.lineWidth = 1.6;
  for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 560, 170, (i * Math.PI) / 20, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 170, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // The gold thread: lotus + chip stay gold on the platinum card.
  lotus(ctx, 205, 250, 92, finish === 'gold' ? grad(ctx, f.ink, 100, 150, 300, 350) : grad(ctx, GOLD, 110, 150, 300, 340));
  ctx.fillStyle = grad(ctx, f.ink, 320, 140, 700, 300);
  ctx.font = '700 150px "Anek Devanagari Variable", "Mukta", sans-serif';
  ctx.textBaseline = 'alphabetic'; ctx.fillText('kosh', 318, 292);
  ctx.font = '600 70px "Anek Devanagari Variable", "Mukta", sans-serif';
  ctx.fillText('कोष', 660, 290);

  ctx.fillStyle = finish === 'gold' ? 'rgba(42,29,8,0.8)' : 'rgba(236,237,240,0.8)';
  ctx.font = '600 38px "Mukta", sans-serif'; spacing(ctx, 14);
  ctx.textAlign = 'right'; ctx.fillText(finish === 'gold' ? 'RESERVE' : 'SIGNATURE METAL', TEX_W - 150, 250); ctx.textAlign = 'left';

  const cx = 190, cy = 470, cw = 236, ch = 180;
  ctx.fillStyle = grad(ctx, GOLD, cx, cy, cx + cw, cy + ch);
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 30); ctx.fill();
  ctx.strokeStyle = 'rgba(110,70,10,0.55)'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + ch / 3); ctx.lineTo(cx + cw * 0.36, cy + ch / 3); ctx.moveTo(cx, cy + (2 * ch) / 3); ctx.lineTo(cx + cw * 0.36, cy + (2 * ch) / 3);
  ctx.moveTo(cx + cw, cy + ch / 3); ctx.lineTo(cx + cw * 0.64, cy + ch / 3); ctx.moveTo(cx + cw, cy + (2 * ch) / 3); ctx.lineTo(cx + cw * 0.64, cy + (2 * ch) / 3);
  ctx.moveTo(cx + cw * 0.36, cy); ctx.lineTo(cx + cw * 0.36, cy + ch); ctx.moveTo(cx + cw * 0.64, cy); ctx.lineTo(cx + cw * 0.64, cy + ch);
  ctx.stroke();
  ctx.strokeStyle = finish === 'gold' ? 'rgba(42,29,8,0.7)' : 'rgba(240,241,244,0.75)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(480, 560, 30 + i * 30, -0.8, 0.8); ctx.stroke(); }

  ctx.shadowColor = finish === 'gold' ? 'rgba(255,240,200,0.5)' : 'rgba(0,0,0,0.7)'; ctx.shadowOffsetY = finish === 'gold' ? -2 : 4; ctx.shadowBlur = 4;
  ctx.fillStyle = f.emboss;
  ctx.font = '500 92px "Mukta", sans-serif'; spacing(ctx, 10);
  ctx.fillText('4821   7730   1945   5521', 190, 900);
  ctx.font = '600 50px "Mukta", sans-serif'; spacing(ctx, 8);
  ctx.fillText(name, 190, 1130);
  ctx.font = '500 34px "Mukta", sans-serif';
  ctx.fillText('VALID THRU  08/31', 900, 1130);
  ctx.shadowColor = 'transparent';

  ctx.fillStyle = grad(ctx, f.ink, TEX_W - 480, 1030, TEX_W - 150, 1160);
  ctx.font = 'italic 800 118px "Mukta", sans-serif'; spacing(ctx, 0);
  ctx.textAlign = 'right'; ctx.fillText('RuPay', TEX_W - 150, 1150); ctx.textAlign = 'left';
}

function drawBack(ctx: CanvasRenderingContext2D) {
  brushed(ctx, FINISH.platinum);
  ctx.fillStyle = '#050506'; ctx.fillRect(0, 150, TEX_W, 210);
  ctx.fillStyle = '#ecebe6'; ctx.beginPath(); ctx.roundRect(150, 470, 1100, 150, 16); ctx.fill();
  ctx.fillStyle = grad(ctx, GOLD, 1300, 470, 1560, 620);
  ctx.beginPath(); ctx.roundRect(1300, 470, 260, 150, 16); ctx.fill();
  ctx.fillStyle = 'rgba(236,237,240,0.7)'; ctx.font = '500 40px "Mukta", sans-serif';
  ctx.fillText('Kosh Bank (demo) · Kavach protected · 1800 000 5674', 150, 1100);
  lotus(ctx, TEX_W - 260, 1000, 110, grad(ctx, GOLD, TEX_W - 370, 890, TEX_W - 150, 1110));
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void, anisotropy: number, size = TEX_W) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.round(size * (H / W));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(size / TEX_W, size / TEX_W);
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  // ShapeGeometry UVs are in card units centred on 0: map them onto 0..1.
  tex.repeat.set(1 / W, 1 / H);
  tex.offset.set(0.5, 0.5);
  return { tex, redraw: () => { ctx.clearRect(0, 0, TEX_W, TEX_H); draw(ctx); tex.needsUpdate = true; } };
}

/** Shared renderer + studio lighting. */
export function createStage(host: HTMLElement, maxDpr = 2) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const key = new THREE.DirectionalLight('#ffffff', 1.5); key.position.set(-4, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#d6dcff', 0.7); rim.position.set(5, -3, -4); scene.add(rim);
  return {
    renderer, scene,
    dispose() { env.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}

/** Runs `frame` while the host is on screen and the tab is visible; `still` renders on demand only. */
export function runLoop(host: HTMLElement, frame: (t: number) => void, still: boolean) {
  let visible = true, raf = 0;
  const start = performance.now();
  const tick = () => { raf = 0; if (!visible || document.hidden) return; frame(performance.now() - start); raf = requestAnimationFrame(tick); };
  const kick = () => { if (!still && visible && !document.hidden && !raf) raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
  io.observe(host);
  document.addEventListener('visibilitychange', kick);
  const onScroll = () => { if (still) frame(performance.now() - start); };
  window.addEventListener('scroll', onScroll, { passive: true });
  kick();
  return {
    render: () => frame(performance.now() - start),
    dispose() { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', kick); window.removeEventListener('scroll', onScroll); },
  };
}

/** A complete metal card (body + gold/platinum edge + printed faces). */
export function buildCard(anisotropy: number, finish: Finish = 'platinum', { name = 'AARAV SHARMA', texSize = TEX_W, back = true } = {}) {
  const front = canvasTexture(ctx => drawFront(ctx, finish, name), anisotropy, texSize);
  const backTex = back ? canvasTexture(drawBack, anisotropy, texSize) : null;
  const shape = roundedRect(W, H, R);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 4, curveSegments: 24 });
  bodyGeo.translate(0, 0, -T / 2);
  const capMat = new THREE.MeshPhysicalMaterial({ color: finish === 'gold' ? '#8a6428' : '#0b0b0d', metalness: 0.85, roughness: 0.4 });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: finish === 'gold' ? '#e7c67f' : '#dadde3', metalness: 1, roughness: 0.18, clearcoat: 0.6 });
  const faceGeo = new THREE.ShapeGeometry(shape, 24);
  const faceMat = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map, metalness: finish === 'gold' ? 0.75 : 0.5, roughness: finish === 'gold' ? 0.3 : 0.42, clearcoat: 1, clearcoatRoughness: 0.16, envMapIntensity: finish === 'gold' ? 0.9 : 0.5 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(bodyGeo, [capMat, edgeMat]));
  const frontMat = faceMat(front.tex), frontFace = new THREE.Mesh(faceGeo, frontMat);
  frontFace.position.z = T / 2 + BEVEL + 0.002;
  group.add(frontFace);
  let backMat: THREE.Material | null = null;
  if (backTex) {
    backMat = faceMat(backTex.tex);
    const backFace = new THREE.Mesh(faceGeo, backMat);
    backFace.rotation.y = Math.PI; backFace.position.z = -(T / 2 + BEVEL + 0.002);
    group.add(backFace);
  }
  return {
    group,
    redraw: () => { front.redraw(); backTex?.redraw(); },
    dispose() { [bodyGeo, faceGeo, capMat, edgeMat, frontMat, front.tex].forEach(d => d.dispose()); backMat?.dispose(); backTex?.tex.dispose(); },
  };
}

/** Canvas text needs the web fonts; resolves once they are ready (or failed). */
export const fontsReady = () => Promise.all([
  document.fonts.load('700 150px "Anek Devanagari Variable"'),
  document.fonts.load('600 50px "Mukta"'),
]).catch(() => []);

/** The hero card: floats, follows the pointer, and tilts away as the hero scrolls out. */
export function mountCardScene(host: HTMLElement, { still = false } = {}) {
  const stage = createStage(host);
  const { renderer, scene } = stage;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const card = buildCard(renderer.capabilities.getMaxAnisotropy());
  const rig = new THREE.Group();
  rig.add(card.group);
  scene.add(rig);

  const pointer = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!still) window.addEventListener('pointermove', onPointer, { passive: true });

  const frame = (t: number) => {
    const r = host.getBoundingClientRect();
    const scroll = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
    const intro = still ? 1 : 1 - Math.pow(1 - Math.min(1, t / 1600), 4);
    cur.x += (pointer.x - cur.x) * 0.05;
    cur.y += (pointer.y - cur.y) * 0.05;
    const s = t / 1000, wob = still ? 0 : 1;
    rig.rotation.set(
      -0.28 + cur.y * 0.22 + scroll * 0.9 + Math.sin(s * 0.6) * 0.035 * wob,
      0.42 + cur.x * 0.38 - scroll * 0.5 + (1 - intro) * 1.4 + Math.sin(s * 0.45) * 0.06 * wob,
      -0.1,
    );
    rig.position.y = Math.sin(s * 0.8) * 0.12 * wob + scroll * 1.2;
    rig.scale.setScalar(0.86 + intro * 0.14);
    renderer.render(scene, camera);
  };
  const loop = runLoop(host, frame, still);

  const size = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = Math.max((W * 1.25) / 2 / (tan * camera.aspect), (H * 1.9) / 2 / tan);
    camera.updateProjectionMatrix();
    loop.render();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  fontsReady().then(() => { card.redraw(); loop.render(); });

  return () => {
    loop.dispose(); ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    card.dispose(); stage.dispose();
  };
}
