/** What stands on the desk for company: a small piano you can play and a record player whose record turns while
 *  the radio is on. Only the shapes; shelf-scene.ts places them, turns the record and reports where the keys are. */
import * as THREE from 'three';
import { PIANO_KEYS, isBlack } from './piano';

const BODY = 0x23263a, TRIM = 0x4ade80, METAL = 0x9aa0b8;
const mat = (color: number, roughness = 0.7, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

/** A sloping stand, front edge on the desk at the group's origin; `top` is its surface (y up from it, z 0 … -depth). */
function stand(width: number, depth: number, slope: number): { group: THREE.Group; top: THREE.Group } {
  const group = new THREE.Group(), top = new THREE.Group();
  const side = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(depth * Math.cos(slope), 0),
    new THREE.Vector2(depth * Math.cos(slope), depth * Math.sin(slope))]);
  const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(side, { depth: width, bevelEnabled: false }), mat(BODY, 0.85));
  wedge.rotation.y = Math.PI / 2;
  wedge.position.x = -width / 2;
  wedge.castShadow = true; wedge.receiveShadow = true;
  top.rotation.x = slope;
  group.add(wedge, top);
  return { group, top };
}

export const PIANO_W = 3.7, PLAYER_W = 1.7;

/** Two octaves. keys[n] is the mesh of key n (0 = middle C); a pressed key is moved down by the scene. */
export function makePiano(): { group: THREE.Group; keys: THREE.Mesh[] } {
  const depth = 1.25, { group, top } = stand(PIANO_W, depth, 0.5);
  top.add(box(PIANO_W, 0.16, depth, mat(BODY, 0.6), 0, 0.08, -depth / 2));
  top.add(box(PIANO_W - 0.3, 0.02, 0.06, mat(TRIM, 0.4), 0, 0.17, -1.08));              // a green line above the keys
  const keys: THREE.Mesh[] = [];
  const whites = Array.from({ length: PIANO_KEYS }, (_, k) => k).filter(k => !isBlack(k));
  const step = (PIANO_W - 0.3) / whites.length, left = -(PIANO_W - 0.3) / 2;
  const ivory = () => mat(0xf1eee2, 0.45), ebony = () => mat(0x15171f, 0.35);
  whites.forEach((k, i) => {
    keys[k] = box(step - 0.025, 0.08, 0.86, ivory(), left + step * (i + 0.5), 0.2, -0.08 - 0.43);
    if (k + 1 < PIANO_KEYS && isBlack(k + 1)) keys[k + 1] = box(step * 0.58, 0.09, 0.52, ebony(), left + step * (i + 1), 0.285, -0.42 - 0.26);
  });
  for (const key of keys) { key.userData['restY'] = key.position.y; top.add(key); }
  return { group, keys };
}

/** The picture on the record: someone with headphones writing at a window at night, the city outside, a cat.
 *  Drawn here, in the look of those endless "beats to study to" loops. */
function recordPicture(): THREE.CanvasTexture {
  const S = 768, canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d')!;
  const u = S / 100;                                                // work in 0…100
  c.scale(u, u);
  c.fillStyle = '#0b0c12'; c.fillRect(0, 0, 100, 100);
  c.save();
  c.beginPath(); c.arc(50, 50, 48, 0, Math.PI * 2); c.clip();

  const sky = c.createLinearGradient(0, 0, 0, 70);                   // dusk
  sky.addColorStop(0, '#1b1445'); sky.addColorStop(0.45, '#5b2a86'); sky.addColorStop(0.8, '#e0567a'); sky.addColorStop(1, '#ffb36b');
  c.fillStyle = sky; c.fillRect(0, 0, 100, 100);
  c.fillStyle = 'rgba(255,255,255,0.85)';                            // stars
  for (let i = 0; i < 46; i++) { const x = (i * 37.7) % 100, y = (i * 23.3) % 42; c.fillRect(x, y, i % 5 ? 0.35 : 0.6, i % 5 ? 0.35 : 0.6); }
  const halo = c.createRadialGradient(70, 24, 2, 70, 24, 22);        // the moon
  halo.addColorStop(0, 'rgba(255,240,210,0.55)'); halo.addColorStop(1, 'rgba(255,240,210,0)');
  c.fillStyle = halo; c.fillRect(40, 0, 60, 50);
  c.fillStyle = '#fff3d6'; c.beginPath(); c.arc(70, 24, 8.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(230,200,170,0.5)'; c.beginPath(); c.arc(67, 22, 1.6, 0, Math.PI * 2); c.arc(73, 27, 1.1, 0, Math.PI * 2); c.fill();

  const towers = [[2, 46, 9], [10, 38, 7], [16, 50, 10], [25, 33, 8], [32, 44, 9], [40, 52, 7], [46, 40, 8], [53, 49, 9], [61, 36, 8],
    [68, 47, 10], [77, 41, 8], [84, 51, 9], [92, 44, 8]];
  c.fillStyle = '#2a1b52';                                           // far city
  for (const [x, y, w] of towers) c.fillRect(x + 3, y - 5, w, 70);
  c.fillStyle = '#17112f';                                           // near city, lit windows
  for (const [x, y, w] of towers) c.fillRect(x, y, w, 70);
  for (const [x, y, w] of towers) for (let wy = y + 2; wy < 66; wy += 3.2) for (let wx = x + 1.2; wx < x + w - 1.5; wx += 2.4) {
    const lit = (Math.round(wx * 7 + wy * 13) % 5) < 2;
    c.fillStyle = lit ? ((Math.round(wx + wy) % 3) ? '#ffd27a' : '#8fe3ff') : 'rgba(255,255,255,0.05)';
    c.fillRect(wx, wy, 1.2, 1.6);
  }

  c.strokeStyle = '#120d24'; c.lineWidth = 2.2;                      // the window's bars
  c.beginPath(); c.moveTo(50, 0); c.lineTo(50, 66); c.moveTo(0, 30); c.lineTo(100, 30); c.stroke();
  c.fillStyle = '#231a3d'; c.fillRect(0, 64, 100, 4);                // sill
  c.fillStyle = '#1a1330'; c.fillRect(0, 68, 100, 40);               // the room, the desk
  c.fillStyle = '#2d2250'; c.fillRect(0, 79, 100, 30);

  c.fillStyle = '#0f0a1e';                                           // the cat on the sill, looking out
  c.beginPath(); c.ellipse(21, 60, 5.2, 4.2, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(25, 54.5, 2.9, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(22.6, 53.4); c.lineTo(23.2, 49.6); c.lineTo(25, 52.2); c.moveTo(25.4, 52.2); c.lineTo(27.3, 49.8); c.lineTo(27.6, 53.6); c.fill();
  c.strokeStyle = '#0f0a1e'; c.lineWidth = 1.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(16.5, 62.5); c.quadraticCurveTo(10, 63, 10.5, 57); c.stroke();

  c.fillStyle = '#1c5a3a';                                           // a plant
  for (const [a, l] of [[-1.9, 9], [-1.5, 11], [-1.1, 9.5], [-2.3, 7], [-0.8, 7]]) {
    c.beginPath(); c.ellipse(84 + Math.cos(a) * l / 2, 63 + Math.sin(a) * l / 2, l / 2, 1.5, a, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#b4532a'; c.beginPath(); c.moveTo(80.5, 62); c.lineTo(87.5, 62); c.lineTo(86.5, 68); c.lineTo(81.5, 68); c.fill();

  const lamp = c.createRadialGradient(31, 74, 1, 31, 74, 26);         // warm lamp light on the desk
  lamp.addColorStop(0, 'rgba(255,196,110,0.6)'); lamp.addColorStop(1, 'rgba(255,196,110,0)');
  c.fillStyle = lamp; c.fillRect(0, 48, 70, 52);
  c.strokeStyle = '#0f0a1e'; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(22, 80); c.lineTo(22, 70); c.lineTo(29, 66); c.stroke();
  c.fillStyle = '#ffcf7d'; c.beginPath(); c.moveTo(26.5, 64.5); c.lineTo(33.5, 66); c.lineTo(34, 71.5); c.lineTo(27.5, 70); c.fill();

  // the listener, seen from behind: hair in a bun, big headphones, a green hoodie
  c.fillStyle = '#2f9e64';
  c.beginPath(); c.moveTo(38, 100); c.quadraticCurveTo(38, 77, 50, 75); c.quadraticCurveTo(64, 77, 64, 100); c.fill();
  c.fillStyle = '#278554'; c.beginPath(); c.ellipse(51, 78, 8.5, 3.6, 0, 0, Math.PI * 2); c.fill();           // hood
  c.fillStyle = '#3a2233'; c.beginPath(); c.arc(51, 66, 8.2, 0, Math.PI * 2); c.fill();                       // hair
  c.beginPath(); c.arc(51, 56.5, 3.6, 0, Math.PI * 2); c.fill();                                             // bun
  c.strokeStyle = '#11131c'; c.lineWidth = 1.8; c.beginPath(); c.arc(51, 66, 9.4, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
  c.fillStyle = '#11131c';
  c.beginPath(); c.roundRect(40, 62.5, 3.6, 8.4, 1.6); c.roundRect(58.4, 62.5, 3.6, 8.4, 1.6); c.fill();
  c.fillStyle = '#4ade80'; c.fillRect(41, 65.6, 1.3, 2.2); c.fillRect(59.7, 65.6, 1.3, 2.2);
  c.fillStyle = '#efe9d8'; c.beginPath(); c.moveTo(62, 83); c.lineTo(78, 81.5); c.lineTo(80, 88); c.lineTo(64, 90); c.fill();   // the notebook
  c.strokeStyle = 'rgba(40,40,70,0.5)'; c.lineWidth = 0.35;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(65, 85 + i * 1.5); c.lineTo(77, 83.8 + i * 1.5); c.stroke(); }
  c.fillStyle = '#d9d2c0'; c.beginPath(); c.roundRect(69, 73, 4.6, 5.4, 0.8); c.fill();                        // a mug, steaming
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(70.6, 72); c.quadraticCurveTo(69.4, 70, 70.8, 68.4); c.moveTo(72.4, 72); c.quadraticCurveTo(73.6, 70, 72.2, 68); c.stroke();
  c.restore();

  c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 0.22;            // grooves
  for (let r = 15; r < 48; r += 1.5) { c.beginPath(); c.arc(50, 50, r, 0, Math.PI * 2); c.stroke(); }
  const shine = c.createLinearGradient(0, 0, 100, 100);              // light across the vinyl
  shine.addColorStop(0.3, 'rgba(255,255,255,0)'); shine.addColorStop(0.5, 'rgba(255,255,255,0.13)'); shine.addColorStop(0.7, 'rgba(255,255,255,0)');
  c.fillStyle = shine; c.beginPath(); c.arc(50, 50, 48, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#0b0c12'; c.lineWidth = 2.2; c.beginPath(); c.arc(50, 50, 48.6, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#11131c'; c.beginPath(); c.arc(50, 50, 4.4, 0, Math.PI * 2); c.fill();                      // label and hole
  c.fillStyle = '#4ade80'; c.beginPath(); c.arc(50, 50, 3.1, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#0b0c12'; c.beginPath(); c.arc(50, 50, 0.9, 0, Math.PI * 2); c.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** disc turns about its own y; arm swings about its y: ARM_REST off the record, ARM_PLAY on it. */
export const ARM_REST = 0.12, ARM_PLAY = -0.4;
export function makePlayer(): { group: THREE.Group; disc: THREE.Mesh; arm: THREE.Group } {
  const d = PLAYER_W, { group, top } = stand(PLAYER_W, d, 0.45);
  top.add(box(PLAYER_W, 0.22, d, mat(BODY, 0.55), 0, 0.11, -d / 2));
  top.add(box(PLAYER_W, 0.03, 0.05, mat(TRIM, 0.4), 0, 0.225, -0.04));
  const cx = -0.14, cz = -d / 2 - 0.04;
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.05, 48), mat(0x30344c, 0.4, 0.5));
  platter.position.set(cx, 0.245, cz);
  const side = mat(0x0b0c12, 0.35);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.02, 64),
    [side, new THREE.MeshStandardMaterial({ map: recordPicture(), roughness: 0.42, metalness: 0.08 }), side]);
  disc.position.set(cx, 0.282, cz);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 12), mat(METAL, 0.3, 0.8));
  pin.position.set(cx, 0.31, cz);
  const arm = new THREE.Group();
  arm.position.set(0.66, 0.3, -d + 0.26);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 20), mat(METAL, 0.3, 0.8));
  arm.add(base, box(0.035, 0.035, 0.92, mat(METAL, 0.3, 0.8), 0, 0.07, 0.42), box(0.1, 0.05, 0.17, mat(0x15171f, 0.4), 0, 0.05, 0.9));
  arm.rotation.y = ARM_REST;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), mat(TRIM, 0.4));
  knob.position.set(0.66, 0.25, -0.2);
  for (const m of [platter, disc, pin, base, knob]) { m.castShadow = true; m.receiveShadow = true; }
  top.add(platter, disc, pin, arm, knob);
  return { group, disc, arm };
}
