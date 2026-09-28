import * as THREE from 'three';
import { createStage, runLoop } from './cardScene';

/* "Rewards fall in your favour": glass + chrome spheres and gold ₹ coins drifting down. */

type Drifter = { mesh: THREE.Object3D; speed: number; spin: THREE.Vector3 };
const SPAN_Y = 16;

function rupeeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(200, 180, 20, 256, 256, 260);
  g.addColorStop(0, '#fff0c8'); g.addColorStop(0.5, '#e2b964'); g.addColorStop(1, '#8c6120');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = 'rgba(90,60,15,0.55)'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(256, 256, 214, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(80,52,12,0.85)';
  ctx.font = '700 280px "Mukta", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('₹', 256, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mountSpheresScene(host: HTMLElement, { still = false } = {}) {
  const stage = createStage(host, 1.5);
  const { renderer, scene } = stage;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.z = 14;

  // A soft studio backdrop gives the glass something to refract.
  const backdropCanvas = document.createElement('canvas');
  backdropCanvas.width = backdropCanvas.height = 256;
  const b = backdropCanvas.getContext('2d')!;
  const bg = b.createRadialGradient(128, 110, 10, 128, 128, 150);
  bg.addColorStop(0, '#5a5c63'); bg.addColorStop(0.5, '#1c1d21'); bg.addColorStop(1, '#070708');
  b.fillStyle = bg; b.fillRect(0, 0, 256, 256);
  const backdropTex = new THREE.CanvasTexture(backdropCanvas);
  backdropTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ map: backdropTex }));
  backdrop.position.z = -12;
  scene.add(backdrop);

  const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.4, ior: 1.45, clearcoat: 1, iridescence: 0.25, envMapIntensity: 1.6 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#e6e8ec', metalness: 1, roughness: 0.08, envMapIntensity: 1.3 });
  const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 64);
  const rupee = rupeeTexture();
  const coinEdge = new THREE.MeshPhysicalMaterial({ color: '#d9ad5a', metalness: 1, roughness: 0.25 });
  const coinFace = new THREE.MeshPhysicalMaterial({ map: rupee, metalness: 0.9, roughness: 0.3 });

  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const drifters: Drifter[] = [];
  const add = (mesh: THREE.Object3D, scale: number) => {
    mesh.scale.setScalar(scale);
    mesh.position.set((rand() - 0.5) * 26, (rand() - 0.5) * SPAN_Y, -8 + rand() * 12);
    mesh.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    scene.add(mesh);
    drifters.push({ mesh, speed: 0.25 + rand() * 0.45, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6) });
  };
  for (let i = 0; i < 16; i++) add(new THREE.Mesh(sphereGeo, glass), 0.9 + rand() * 1.6);
  for (let i = 0; i < 6; i++) add(new THREE.Mesh(sphereGeo, chrome), 0.4 + rand() * 0.7);
  for (let i = 0; i < 10; i++) add(new THREE.Mesh(coinGeo, [coinEdge, coinFace, coinFace]), 0.9 + rand() * 0.8);

  const pointer = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  if (!still) window.addEventListener('pointermove', onPointer, { passive: true });

  let last = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const r = host.getBoundingClientRect(), vh = window.innerHeight;
    const scroll = (vh - r.top) / (vh + r.height);
    for (const d of drifters) {
      if (!still) {
        d.mesh.position.y -= d.speed * dt;
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
        if (d.mesh.position.y < -SPAN_Y / 2) d.mesh.position.y += SPAN_Y;
      }
    }
    cur.x += (pointer.x - cur.x) * 0.04; cur.y += (pointer.y - cur.y) * 0.04;
    camera.position.x = cur.x * 0.8;
    camera.position.y = -cur.y * 0.5 - (scroll - 0.5) * 3;
    camera.lookAt(0, -(scroll - 0.5) * 3, 0);
    renderer.render(scene, camera);
  };
  const loop = runLoop(host, frame, still);

  const size = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    loop.render();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);

  return () => {
    loop.dispose(); ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    [sphereGeo, glass, chrome, coinGeo, rupee, coinEdge, coinFace, backdropTex, backdrop.geometry, backdrop.material as THREE.Material].forEach(d => d.dispose());
    stage.dispose();
  };
}
