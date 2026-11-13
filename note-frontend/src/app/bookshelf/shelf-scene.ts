/** The shelf drawn with three.js: one standing book per folder (cover in the folder's colour, its name on the spine,
 *  thicker with more notes), and a desk below it where loose notes lean as slips next to Aria's stack.
 *  It only draws. Clicks, keyboard and drag and drop belong to the invisible buttons the Bookshelf component lays
 *  over it, at the places rects() reports. It renders when something moves, not all the time.
 *  startShelfScene(canvas, shelf) returns the scene; with still: true nothing is animated ("reduce motion"). */
import * as THREE from 'three';
import { Book, Shelf, plainText } from '../shelf/shelf-model';
import { Note } from '../../model/models';
import { ARM_PLAY, ARM_REST, PIANO_W, PLAYER_W, makePiano, makePlayer } from './desk-things';

/** clip: the exact outline inside the box (a CSS polygon), for things that stand at a slant, like the piano's keys. */
export interface SceneRect { key: string; x: number; y: number; w: number; h: number; clip?: string; }
export interface ShelfScene {
  update(shelf: Shelf): void;
  resize(): void;
  /** Where each book ("book:3"), slip ("slip:12"), Aria's stack ("aria") or her fanned notes ("aria:5") is, in CSS px.
   *  Also the piano's keys ("key:0" = middle C …) and the record player ("radio"). */
  rects(): SceneRect[];
  highlight(key: string | null): void;
  fan(open: boolean): void;
  /** The book comes forward and opens; resolves when the page can take over. */
  open(bookId: number): Promise<void>;
  /** A piano key goes down for a moment. */
  press(key: number): void;
  /** The radio is on: the record turns and the arm lies on it. */
  setPlaying(on: boolean): void;
  dispose(): void;
}
export interface SceneOptions { still?: boolean; returnFrom?: number | null; onLayout?: () => void; }

const PAL = { room: 0x171a29, wood: 0x4a4f6e, woodDark: 0x363b57, back: 0x262a3d, paper: 0xe9e5d6, pages: 0xded9c8 };
const FOV = 32, DEPTH = 2.0, COVER = 0.06, ROW = 3.9, GAP = 0.1;
const SLIP_W = 1.55, SLIP_H = 1.95;
const FONT = "-apple-system, 'Segoe UI', Roboto, Ubuntu, Cantarell, 'Noto Sans', sans-serif";

type Item = { key: string; group: THREE.Group; home: THREE.Vector3; out: number; want: number; cover?: THREE.Group; tilt: number;
  rect?: Omit<SceneRect, 'key'> };     // where it stands at rest: the button over it doesn't move when it's hovered

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > max) cut = cut.slice(0, -1);
  return cut.trimEnd() + '…';
}

function texture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, Math.round(w)); canvas.height = Math.max(8, Math.round(h));
  draw(canvas.getContext('2d')!, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function bookHeight(id: number): number { return 2.75 + ((id * 37) % 5) * 0.1; }

function makeBook(book: Book): { group: THREE.Group; cover: THREE.Group } {
  const t = book.spine / 40, h = bookHeight(book.folder.id), px = 150;
  const name = (book.folder.name || 'Untitled').trim();
  const colour = new THREE.Color(book.colour);
  const cloth = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.78, metalness: 0.02 });
  const paper = new THREE.MeshStandardMaterial({ color: PAL.pages, roughness: 0.95 });
  const group = new THREE.Group();

  const spineTex = texture(t * px, h * px, (c, w, hh) => {
    c.fillStyle = book.colour; c.fillRect(0, 0, w, hh);
    c.fillStyle = book.ink; c.globalAlpha = 0.55;
    c.fillRect(0, hh * 0.07, w, 3); c.fillRect(0, hh * 0.93, w, 3);
    c.globalAlpha = 1;
    c.save(); c.translate(w / 2, hh * 0.47); c.rotate(Math.PI / 2);
    c.font = `600 ${Math.min(w * 0.46, 40)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(fit(c, name, hh * 0.7), 0, 0);
    c.restore();
    c.globalAlpha = 0.75; c.font = `500 ${Math.min(w * 0.36, 26)}px ${FONT}`; c.textAlign = 'center';
    c.fillText(String(book.count), w / 2, hh * 0.905);
  });
  const spineMats = [cloth, cloth, cloth, cloth, new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.78 }), cloth];
  const spine = new THREE.Mesh(new THREE.BoxGeometry(t, h, COVER), spineMats);
  spine.position.z = DEPTH / 2 - COVER / 2;

  const back = new THREE.Mesh(new THREE.BoxGeometry(COVER, h, DEPTH - COVER), cloth);
  back.position.set(-t / 2 + COVER / 2, 0, -COVER / 2);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, t - 2 * COVER), h - 0.14, DEPTH - COVER - 0.1), paper);
  pages.position.z = -COVER / 2 - 0.03;

  const frontTex = texture((DEPTH - COVER) * px, h * px, (c, w, hh) => {
    c.fillStyle = book.colour; c.fillRect(0, 0, w, hh);
    c.strokeStyle = book.ink; c.globalAlpha = 0.5; c.lineWidth = 3; c.strokeRect(w * 0.08, hh * 0.06, w * 0.84, hh * 0.88);
    c.globalAlpha = 1; c.fillStyle = book.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${Math.round(w * 0.11)}px ${FONT}`;
    c.fillText(fit(c, name, w * 0.72), w / 2, hh * 0.36);
    c.globalAlpha = 0.7; c.font = `500 ${Math.round(w * 0.06)}px ${FONT}`;
    c.fillText(book.count === 1 ? '1 note' : `${book.count} notes`, w / 2, hh * 0.47);
  });
  const frontMats = [new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.78 }), paper, cloth, cloth, cloth, cloth];
  const front = new THREE.Mesh(new THREE.BoxGeometry(COVER, h, DEPTH - COVER), frontMats);
  front.position.z = -(DEPTH - COVER) / 2;
  const cover = new THREE.Group();                 // hinged at the spine
  cover.position.set(t / 2 - COVER / 2, 0, DEPTH / 2 - COVER);
  cover.add(front);

  for (const m of [spine, back, pages, front]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(spine, back, pages, cover);
  return { group, cover };
}

function makeSlip(note: Note, aria: boolean): THREE.Group {
  const px = 170;
  const tex = texture(SLIP_W * px, SLIP_H * px, (c, w, h) => {
    c.fillStyle = '#e9e5d6'; c.fillRect(0, 0, w, h);
    c.fillStyle = aria ? '#22c55e' : '#b9b3a0'; c.fillRect(0, 0, w, h * 0.045);
    c.fillStyle = '#1b1e2e'; c.textBaseline = 'top';
    c.font = `700 ${Math.round(w * 0.1)}px ${FONT}`;
    c.fillText(fit(c, (note.title || 'Untitled').trim(), w * 0.84), w * 0.08, h * 0.1);
    c.font = `400 ${Math.round(w * 0.07)}px ${FONT}`; c.fillStyle = '#4b5060';
    const words = plainText(note.content).slice(0, 90).split(' ');
    let line = '', y = h * 0.25;
    for (const word of words) {
      if (c.measureText(line + word).width > w * 0.84 && line) {
        c.fillText(line.trim(), w * 0.08, y); line = ''; y += w * 0.095;
        if (y > h * 0.86) break;
      }
      line += word + ' ';
    }
    if (line.trim() && y <= h * 0.86) c.fillText(line.trim(), w * 0.08, y);
  });
  const paper = new THREE.MeshStandardMaterial({ color: PAL.paper, roughness: 0.95 });
  const mats = [paper, paper, paper, paper, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), paper];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(SLIP_W, SLIP_H, 0.025), mats);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function startShelfScene(canvas: HTMLCanvasElement, first: Shelf, opts: SceneOptions = {}): ShelfScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(PAL.room);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2a22, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const glow = new THREE.PointLight(0x4ade80, 6, 30, 1.6);         // a little of the app's green from the side
  scene.add(glow);

  const furniture = new THREE.Group(), things = new THREE.Group();
  scene.add(furniture, things);
  let shelf = first, items: Item[] = [], fanned = false, opening = false, disposed = false;
  let fanStep = SLIP_W + 0.15;                        // how far apart Aria's notes lie when fanned out
  let frame = 0, last = 0, running = false, ready = false;      // ready: the caller has the scene, onLayout may be called
  let keys: THREE.Mesh[] = [], disc: THREE.Mesh | null = null, arm: THREE.Group | null = null;
  let decoRects: SceneRect[] = [], playing = false, turned = 0, shifting = false;
  const down = new Map<number, number>();              // piano key → when it comes up again

  const size = () => ({ w: canvas.clientWidth || canvas.width || 1, h: canvas.clientHeight || canvas.height || 1 });

  function clear(group: THREE.Group) {
    group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    group.clear();
  }

  function board(w: number, h: number, d: number, colour: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }));
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true; mesh.castShadow = true;
    furniture.add(mesh);
  }

  /** Rows of books that fit the window, then the desk under them. The camera steps back until everything fits. */
  function build() {
    clear(furniture); clear(things);
    const { w, h } = size();
    const aspect = w / h;
    camera.aspect = aspect;
    const made = shelf.books.map(book => ({ book, ...makeBook(book), t: book.spine / 40 }));
    let rows: typeof made[] = [], width = 0, z = 15;
    for (; z <= 80; z += 1.5) {
      const visH = 2 * z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const all = made.reduce((sum, b) => sum + b.t + GAP, 0);
      const desk = shelf.slips.length * (SLIP_W + 0.3) + shelf.aria.length * (SLIP_W + 0.15) + 1.4;   // room to fan Aria's notes
      width = Math.max(6, Math.min(visH * aspect * 0.8, Math.max(9, all + 1.2, desk)));     // a few books: a narrower shelf
      rows = [[]];
      let used = 0;
      for (const b of made) {
        if (used + b.t > width - 0.5 && rows[rows.length - 1].length) { rows.push([]); used = 0; }
        rows[rows.length - 1].push(b); used += b.t + GAP;
      }
      if (rows.length * ROW + 4.6 <= visH * 0.94) break;
    }
    const total = rows.length * ROW, top = total / 2 + 1.1, floor = -total / 2 + 1.1;
    items = [];
    board(width + 0.5, total + 0.3, 0.12, PAL.back, 0, (top + floor) / 2, -DEPTH / 2 - 0.2);
    board(0.2, total + 0.3, DEPTH + 0.5, PAL.wood, -width / 2 - 0.15, (top + floor) / 2, 0);
    board(0.2, total + 0.3, DEPTH + 0.5, PAL.wood, width / 2 + 0.15, (top + floor) / 2, 0);
    board(width + 0.5, 0.16, DEPTH + 0.5, PAL.wood, 0, top + 0.08, 0);
    rows.forEach((row, r) => {
      const y = top - (r + 1) * ROW;
      board(width + 0.1, 0.16, DEPTH + 0.5, PAL.wood, 0, y - 0.08, 0);
      let x = -width / 2 + 0.3;
      for (const b of row) {
        const hgt = bookHeight(b.book.folder.id);
        b.group.position.set(x + b.t / 2, y + hgt / 2, 0);
        things.add(b.group);
        items.push({ key: `book:${b.book.folder.id}`, group: b.group, home: b.group.position.clone(), out: 0, want: 0, cover: b.cover, tilt: 0 });
        x += b.t + GAP;
      }
    });

    // the desk: slips lean against the shelf's foot, Aria's stack at the right end
    const deskY = floor - 2.75;
    board(width + 2.4, 0.26, 5, PAL.woodDark, 0, deskY - 0.13, 1.4);
    board(width + 0.5, 2.75 - 0.16, 0.12, PAL.back, 0, deskY + (2.75 - 0.16) / 2, -DEPTH / 2 - 0.2);
    const lean = -0.2, slipY = deskY + SLIP_H / 2 * Math.cos(lean) + 0.02;
    const ariaX = width / 2 - SLIP_W / 2 - 0.5;
    const room = Math.max(1, (shelf.aria.length ? ariaX - SLIP_W : width / 2 - 0.3) - (-width / 2 + 0.5 + SLIP_W / 2));
    const step = shelf.slips.length > 1 ? Math.min(SLIP_W + 0.3, room / (shelf.slips.length - 1)) : 0;
    shelf.slips.forEach((note, i) => {
      const group = makeSlip(note, false);
      const tilt = (((note.id ?? i) * 53) % 9 - 4) * 0.012;
      group.position.set(-width / 2 + 0.5 + SLIP_W / 2 + i * step, slipY, 0.3 + i * 0.012);
      group.rotation.set(lean, 0, tilt);
      things.add(group);
      items.push({ key: `slip:${note.id}`, group, home: group.position.clone(), out: 0, want: 0, tilt });
    });
    shelf.aria.forEach((note, i) => {
      const group = makeSlip(note, true);
      const tilt = (i - (shelf.aria.length - 1) / 2) * 0.05;
      group.position.set(ariaX - i * 0.07, slipY, 0.3 + (shelf.aria.length - i) * 0.035);
      group.rotation.set(lean, 0, tilt);
      things.add(group);
      items.push({ key: `aria:${note.id}`, group, home: group.position.clone(), out: 0, want: 0, tilt });
    });
    const loose = items.filter(i => i.key.startsWith('slip:'));
    const leftEnd = loose.length ? loose[loose.length - 1].home.x + SLIP_W * 1.05 : -width / 2 + 0.5 + SLIP_W / 2;
    fanStep = shelf.aria.length > 1 ? Math.max(0.6, Math.min(SLIP_W + 0.15, (ariaX - leftEnd) / (shelf.aria.length - 1))) : 0;
    placeAria(1);

    // company on the front of the desk: the piano on the left, the record player on the right
    const deskW = width + 2.4, front = 3.45;
    const piano = makePiano(), player = makePlayer();
    piano.group.position.set(-deskW / 2 + 0.45 + PIANO_W / 2, deskY, front);
    player.group.position.set(deskW / 2 - 0.45 - PLAYER_W / 2, deskY, front);
    things.add(piano.group, player.group);
    keys = piano.keys; disc = player.disc; arm = player.arm;
    disc.rotation.y = turned;
    arm.rotation.y = playing ? ARM_PLAY : ARM_REST;
    down.clear();

    const cy = (top + deskY) / 2 - 0.2;
    camera.position.set(-width * 0.06, cy + 2.2, z);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    sun.position.set(-width * 0.45, top + 7, 11);
    sun.target.position.set(0, cy, 0);
    const reach = Math.max(width, total + 6) * 0.75;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
    glow.position.set(width / 2 + 2, cy + 1, 6);
    renderer.setSize(w, h, false);
    things.updateMatrixWorld(true);
    for (const item of items) item.rect = projected(item.group);
    decoRects = [...keys.map((mesh, k) => ({ key: `key:${k}`, ...keyRect(mesh) })), { key: 'radio', ...projected(player.group) }];
    if (ready) opts.onLayout?.();
    render();
  }

  /** Aria's notes: one stack, or fanned out to the left so each can be picked. k = how far (0 stacked, 1 target). */
  function placeAria(k: number) {
    const aria = items.filter(i => i.key.startsWith('aria:'));
    aria.forEach((item, i) => {
      const spread = fanned ? -(aria.length - 1 - i) * fanStep : 0;
      const target = item.home.x + spread;
      item.group.position.x += (target - item.group.position.x) * k;
    });
  }

  function render() { if (!disposed) renderer.render(scene, camera); }

  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = last ? Math.min(100, now - last) : 16;
    const k = last ? 1 - Math.exp(-dt / 70) : 0.2;     // the same speed at any frame rate
    last = now;
    let moving = false, busy = false;        // busy: something turns or settles that no button follows
    const wasMoving = shifting;
    for (const item of items) {
      if (opening && item.want === 2) continue;
      const d = item.want - item.out;
      if (Math.abs(d) > 0.004) { item.out += d * k; moving = true; } else item.out = item.want;
      const book = item.key.startsWith('book:');
      item.group.position.z = item.home.z + item.out * (book ? 0.6 : 0.25);
      item.group.position.y = item.home.y + item.out * (book ? 0.05 : 0.14);
      if (book) item.group.rotation.x = -item.out * 0.05;
    }
    const aria = items.filter(i => i.key.startsWith('aria:'));
    const before = aria.map(i => i.group.position.x);
    placeAria(k);
    if (aria.some((i, n) => Math.abs(i.group.position.x - before[n]) > 0.002)) moving = true;
    if (disc && playing && !opts.still) { turned -= dt * 0.0035; disc.rotation.y = turned; busy = true; }      // 33 turns a minute
    if (arm) {
      const d = (playing ? ARM_PLAY : ARM_REST) - arm.rotation.y;
      if (Math.abs(d) > 0.003) { arm.rotation.y += d * k * 0.5; busy = true; } else arm.rotation.y += d;
    }
    for (const [key, until] of down) {
      const mesh = keys[key];
      if (!mesh || performance.now() >= until) { if (mesh) mesh.position.y = mesh.userData['restY']; down.delete(key); }
      else { mesh.position.y = mesh.userData['restY'] - 0.035; busy = true; }
    }
    render();
    shifting = moving;
    if (moving) { opts.onLayout?.(); schedule(); }
    else if (busy) { if (wasMoving) opts.onLayout?.(); schedule(); }
    else { running = false; last = 0; opts.onLayout?.(); }
  }
  function schedule() { running = true; if (!frame) frame = requestAnimationFrame(tick); }

  function settle() {                                     // no animation: jump to where things belong
    for (const item of items) item.out = item.want;
    placeAria(1);
    tick(0);
  }

  /** p 0 → 1: off the shelf to the middle, turning its cover to you; then the cover swings open. */
  function pose(item: Item, p: number) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const centre = camera.position.clone().add(forward.multiplyScalar(camera.position.z * 0.5));
    const a = ease(Math.min(1, p / 0.6)), b = ease(Math.max(0, (p - 0.5) / 0.5));
    const scale = 1 + 0.25 * b;
    item.group.position.lerpVectors(item.home, centre, a);
    item.group.position.x += DEPTH / 2 * scale * b;        // opened, the spine is the middle
    item.group.rotation.set(0, -Math.PI / 2 * a, 0);
    item.group.scale.setScalar(scale);
    if (item.cover) item.cover.rotation.y = -2.95 * b;
  }

  function play(item: Item, from: number, to: number, ms: number): Promise<void> {
    return new Promise(resolve => {
      const start = performance.now();
      const step = (now: number) => {
        if (disposed) return resolve();
        const k = Math.min(1, (now - start) / ms);
        pose(item, from + (to - from) * k);
        render();
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function projected(group: THREE.Object3D): Omit<SceneRect, 'key'> {
    const { w, h } = size();
    const box = new THREE.Box3().setFromObject(group);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      const sx = (p.x + 1) / 2 * w, sy = (1 - p.y) / 2 * h;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** The top of a key as it is seen: a slanted four-sided shape, so a click lands on the key that is drawn there. */
  function keyRect(mesh: THREE.Mesh): Omit<SceneRect, 'key'> {
    const { w, h } = size();
    const p = (mesh.geometry as THREE.BoxGeometry).parameters;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const v = mesh.localToWorld(new THREE.Vector3(sx * p.width / 2, p.height / 2, sz * p.depth / 2)).project(camera);
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
    });
    const x = Math.min(...pts.map(q => q.x)), y = Math.min(...pts.map(q => q.y));
    const bw = Math.max(...pts.map(q => q.x)) - x, bh = Math.max(...pts.map(q => q.y)) - y;
    const clip = `polygon(${pts.map(q => `${(q.x - x).toFixed(1)}px ${(q.y - y).toFixed(1)}px`).join(', ')})`;
    return { x, y, w: bw, h: bh, clip };
  }

  build();
  ready = true;
  if (opts.returnFrom != null && !opts.still) {
    const item = items.find(i => i.key === `book:${opts.returnFrom}`);
    if (item) { opening = true; item.want = 2; pose(item, 1); render(); play(item, 1, 0, 560).then(() => { opening = false; item.want = 0; item.group.scale.setScalar(1); schedule(); }); }
  }

  return {
    update(next) { shelf = next; if (!opening) build(); },
    resize() { if (!opening) build(); },
    rects() {
      things.updateMatrixWorld(true);
      const out: SceneRect[] = [];
      const aria = items.filter(i => i.key.startsWith('aria:'));
      for (const item of items) {
        const aria = item.key.startsWith('aria:');
        if (aria && !fanned) continue;
        out.push({ key: item.key, ...(aria || !item.rect ? projected(item.group) : item.rect) });
      }
      if (aria.length && !fanned) {
        const boxes = aria.map(i => projected(i.group));
        const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
        out.push({ key: 'aria', x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y });
      }
      return out.concat(decoRects);
    },
    highlight(key) {
      for (const item of items) {
        if (item.want === 2) continue;
        item.want = key != null && (item.key === key || (key === 'aria' && item.key.startsWith('aria:'))) ? 1 : 0;
      }
      opts.still ? settle() : schedule();
    },
    fan(open) { fanned = open; opts.still ? settle() : schedule(); opts.onLayout?.(); },
    async open(bookId) {
      const item = items.find(i => i.key === `book:${bookId}`);
      if (!item || opts.still || opening) return;
      opening = true; item.want = 2;
      await play(item, 0, 1, 620);
    },
    press(key) {
      if (!keys[key]) return;
      down.set(key, performance.now() + 160);
      schedule();
    },
    setPlaying(on) {
      playing = on;
      if (opts.still && arm) { arm.rotation.y = on ? ARM_PLAY : ARM_REST; render(); } else schedule();
    },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      clear(furniture); clear(things);
      renderer.dispose();
    },
  };
}
