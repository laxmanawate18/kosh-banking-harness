import * as THREE from 'three';
import { buildCard, createStage, fontsReady, runLoop } from './cardScene';

/* A turbine of metal cards (CRED-style card wheel), built live instead of a pre-rendered video. */

const COUNT = 22, RADIUS = 6.2, PITCH = 1.05;

export function mountRingScene(host: HTMLElement, { still = false } = {}) {
  const stage = createStage(host, 1.75);
  const { renderer, scene } = stage;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  // Two prototypes; clones share geometry, materials and textures.
  const platinum = buildCard(aniso, 'platinum', { texSize: 1024, back: false, name: 'KOSH MEMBER' });
  const gold = buildCard(aniso, 'gold', { texSize: 1024, back: false, name: 'KOSH RESERVE' });

  const wheel = new THREE.Group();
  for (let i = 0; i < COUNT; i++) {
    const spoke = new THREE.Group();
    spoke.rotation.z = (i / COUNT) * Math.PI * 2;
    const card = (i % 7 === 3 ? gold : platinum).group.clone();
    card.scale.setScalar(0.62);
    card.position.x = RADIUS;
    card.rotation.x = PITCH;
    spoke.add(card);
    wheel.add(spoke);
  }
  const rig = new THREE.Group();
  rig.add(wheel);
  rig.rotation.set(-0.35, -0.55, 0.1);
  scene.add(rig);

  const frame = (t: number) => {
    const r = host.getBoundingClientRect(), vh = window.innerHeight;
    const scroll = (vh - r.top) / (vh + r.height); // 0 entering → 1 leaving
    wheel.rotation.z = (still ? 0 : t / 1000) * 0.08 + scroll * 2.2;
    rig.rotation.y = -0.55 + (scroll - 0.5) * 0.35;
    renderer.render(scene, camera);
  };
  const loop = runLoop(host, frame, still);

  const size = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = Math.max((RADIUS * 2.9) / 2 / tan, (RADIUS * 2.6) / 2 / (tan * camera.aspect));
    camera.updateProjectionMatrix();
    loop.render();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  fontsReady().then(() => { platinum.redraw(); gold.redraw(); loop.render(); });

  return () => { loop.dispose(); ro.disconnect(); platinum.dispose(); gold.dispose(); stage.dispose(); };
}
