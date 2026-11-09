/** A drawn study scene in a 90s anime look: Tokyo at night through a rainy window, neon signs, a passing train,
 *  a desk with a lamp, a steaming cup and a sleeping cat. Everything is drawn in code: no pictures, no video,
 *  no internet. It's drawn at a fixed size (1280×760) and scaled to cover the canvas, so it looks the same in the
 *  small corner window and as the background behind a note.
 *  startScene(canvas) returns stop(). With still: true it draws one frame (for "reduce motion"). */

const VW = 1280, VH = 760;
const HORIZON = VH * 0.62, DESK = VH * 0.8;
const WIN = { x: VW * 0.06, y: VH * 0.06, w: VW * 0.88, h: VH * 0.6 };
const PAL = {
  skyTop: '#120f2a', skyMid: '#2a1f4e', skyLow: '#5b2b5e', far: '#2b2550', mid: '#1f1a3c', near: '#151229',
  frame: '#0b0a16', warm: '#ffd38a', cool: '#bfe6ff', pink: '#ff5fa2', cyan: '#4ff0e6', green: '#4ade80', amber: '#ffb347',
};

type Light = { x: number; y: number; s: number; warm: boolean; on: boolean; depth: number; beacon?: boolean; ph: number };
type Sign = { x: number; y: number; text: string; color: string; vertical: boolean; flicker: boolean; ph: number };
type Drop = { x: number; y: number; s: number; v: number; life: number };

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startScene(canvas: HTMLCanvasElement, opts: { fps?: number; still?: boolean } = {}): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const fps = opts.fps ?? 30;
  const r = rng(90);
  let k = 1, scale = 1, ox = 0, oy = 0, raf = 0, last = 0, stopped = false;
  let sky: HTMLCanvasElement, city: HTMLCanvasElement, room: HTMLCanvasElement, grain: HTMLCanvasElement;
  let lights: Light[] = [];
  const signs: Sign[] = [], rain: { x: number; y: number; l: number; v: number }[] = [], drops: Drop[] = [];
  const steam: { x: number; y: number; a: number; ph: number }[] = [];
  const train = { x: -1, next: 4 };
  const t0 = performance.now();

  function layer(draw: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = Math.round(VW * k); c.height = Math.round(VH * k);
    const g = c.getContext('2d')!;
    g.setTransform(k, 0, 0, k, 0, 0);
    draw(g);
    return c;
  }

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    scale = Math.max(cw / VW, ch / VH);                      // cover: fill the canvas, crop the edges
    ox = (cw - VW * scale) / 2; oy = (ch - VH * scale) / 2;
    const nk = Math.min(2, Math.max(0.5, scale * dpr));
    if (!sky || Math.abs(nk - k) > 0.05) { k = nk; build(); }
    ctx!.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  }

  function build() {
    const R = rng(1990);
    sky = layer(g => {
      const grad = g.createLinearGradient(0, 0, 0, HORIZON);
      grad.addColorStop(0, PAL.skyTop); grad.addColorStop(0.55, PAL.skyMid); grad.addColorStop(1, PAL.skyLow);
      g.fillStyle = grad; g.fillRect(0, 0, VW, VH);
      const glow = g.createRadialGradient(VW * 0.5, HORIZON, 10, VW * 0.5, HORIZON, VW * 0.7);
      glow.addColorStop(0, 'rgba(255,110,150,0.35)'); glow.addColorStop(1, 'rgba(255,110,150,0)');
      g.fillStyle = glow; g.fillRect(0, 0, VW, VH);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,240,255,${0.2 + R() * 0.5})`;
        g.fillRect(R() * VW, R() * HORIZON * 0.6, 1, 1);
      }
      const mx = VW * 0.78, my = VH * 0.17, mr = VH * 0.06;
      const halo = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
      halo.addColorStop(0, 'rgba(255,230,240,0.25)'); halo.addColorStop(1, 'rgba(255,230,240,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(mx, my, mr * 3, 0, 7); g.fill();
      g.fillStyle = '#fbe9f0'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
      g.fillStyle = 'rgba(220,180,210,0.35)';
      g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, 7); g.fill();
      g.beginPath(); g.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, 7); g.fill();
    });

    lights = [];
    const bands = [
      { color: PAL.far, minH: 0.12, maxH: 0.3, w: [18, 46], lit: 0.25, size: 2 },
      { color: PAL.mid, minH: 0.1, maxH: 0.26, w: [30, 70], lit: 0.3, size: 3 },
      { color: PAL.near, minH: 0.12, maxH: 0.24, w: [50, 110], lit: 0.35, size: 4 },
    ];
    city = layer(g => {
      bands.forEach((b, depth) => {
        let x = -10;
        while (x < VW + 10) {
          const bw = b.w[0] + R() * (b.w[1] - b.w[0]);
          const bh = VH * (b.minH + R() * (b.maxH - b.minH));
          const ground = HORIZON + depth * VH * 0.05, top = ground - bh;
          g.fillStyle = b.color; g.fillRect(x, top, bw, VH - top);
          if (R() < 0.4) g.fillRect(x + bw * 0.2, top - 6, bw * 0.25, 6);              // water tank
          if (R() < 0.3) {                                                           // antenna
            g.fillRect(x + bw * 0.7, top - 18, 2, 18);
            if (depth === 0) lights.push({ x: x + bw * 0.7 + 1, y: top - 18, s: 3, warm: false, on: true, depth, beacon: true, ph: R() * 6 });
          }
          const s = b.size, gap = s * 2.2;
          for (let wy = top + 6; wy < ground + VH * 0.2; wy += gap * 1.4) {
            for (let wx = x + 4; wx < x + bw - 4; wx += gap) {
              if (R() < b.lit) lights.push({ x: wx, y: wy, s, warm: R() < 0.7, on: true, depth, ph: 0 });
            }
          }
          x += bw + R() * 4;
        }
      });
      // a lattice tower in the distance
      const tx = VW * 0.22, base = HORIZON - VH * 0.02, th = VH * 0.36;
      g.strokeStyle = '#ff7a59'; g.lineWidth = 1.2; g.globalAlpha = 0.9;
      g.beginPath();
      g.moveTo(tx - th * 0.12, base); g.lineTo(tx, base - th); g.lineTo(tx + th * 0.12, base);
      for (let i = 1; i < 9; i++) {
        const yy = base - (th * i) / 9, half = th * 0.12 * (1 - i / 9);
        g.moveTo(tx - half, yy); g.lineTo(tx + half, yy);
        g.moveTo(tx - half, yy); g.lineTo(tx + half * 0.6, yy - th / 9);
      }
      g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#ffb08a'; g.fillRect(tx - th * 0.05, base - th * 0.42, th * 0.1, 3);
      lights.push({ x: tx, y: base - th, s: 3, warm: false, on: true, depth: 0, beacon: true, ph: 0 });
      // the elevated train track
      const ty = HORIZON + VH * 0.03;
      g.fillStyle = '#0f0c20'; g.fillRect(0, ty, VW, 6);
      for (let px = 20; px < VW; px += 70) g.fillRect(px, ty, 5, VH);
    });

    // neon signs with made-up shop names: café, karaoke, ramen, 24h, books, games
    signs.length = 0;
    const words = ['喫茶', 'カラオケ', 'ラーメン', '24H', '本屋', 'ゲーム', '夜'];
    const colors = [PAL.pink, PAL.cyan, PAL.amber, PAL.green];
    for (let i = 0; i < 6; i++) {
      signs.push({
        x: VW * (0.1 + 0.15 * i + R() * 0.05), y: HORIZON - VH * (0.06 + R() * 0.12),
        text: words.splice(Math.floor(R() * words.length), 1)[0], color: colors[i % colors.length],
        vertical: R() < 0.6, flicker: R() < 0.35, ph: R() * 10,
      });
    }

    room = layer(g => {
      g.fillStyle = PAL.frame;
      g.fillRect(0, 0, VW, WIN.y); g.fillRect(0, 0, WIN.x, VH); g.fillRect(WIN.x + WIN.w, 0, VW, VH);
      g.fillRect(0, WIN.y + WIN.h, VW, VH);
      g.fillRect(WIN.x + WIN.w / 2 - 4, WIN.y, 8, WIN.h);
      g.fillRect(WIN.x, WIN.y + WIN.h * 0.38, WIN.w, 6);
      g.fillStyle = '#1c1830'; g.fillRect(WIN.x - 12, WIN.y + WIN.h, WIN.w + 24, 10);       // sill
      g.fillStyle = '#1a1528'; g.fillRect(0, DESK, VW, VH - DESK);                            // desk
      g.fillStyle = '#251e38'; g.fillRect(0, DESK, VW, 5);
      const bx = VW * 0.08;                                                                   // books
      ([['#3d2f63', 70, 12], ['#5a2d4e', 62, 10], ['#24476b', 74, 13]] as [string, number, number][]).forEach(([c, bw, bh], i) => {
        g.fillStyle = c; g.fillRect(bx + i * 3, DESK - 13 * (i + 1), bw, bh);
      });
      const lx = VW * 0.78;                                                                   // lamp
      g.strokeStyle = '#2d2545'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(lx, DESK); g.lineTo(lx - 20, DESK - VH * 0.14); g.lineTo(lx - 70, DESK - VH * 0.17); g.stroke();
      g.fillStyle = '#2d2545'; g.fillRect(lx - 22, DESK - 6, 44, 6);
      g.fillStyle = '#3a3060';
      g.beginPath(); g.moveTo(lx - 95, DESK - VH * 0.15); g.lineTo(lx - 62, DESK - VH * 0.195); g.lineTo(lx - 45, DESK - VH * 0.15); g.fill();
      g.fillStyle = '#d9d2c3'; g.save(); g.translate(VW * 0.42, DESK + 22); g.rotate(-0.05);      // notebook
      g.fillRect(-70, -14, 140, 46); g.fillStyle = 'rgba(80,70,110,0.5)';
      for (let i = 0; i < 4; i++) g.fillRect(-60, -6 + i * 9, 110 - i * 14, 1.5);
      g.restore();
      const cx = VW * 0.62;                                                                   // cup
      g.fillStyle = '#e8dcd0'; g.fillRect(cx - 16, DESK - 32, 32, 32);
      g.strokeStyle = '#e8dcd0'; g.lineWidth = 5; g.beginPath(); g.arc(cx + 18, DESK - 17, 8, -1.4, 1.4); g.stroke();
      g.fillStyle = PAL.green; g.fillRect(cx - 16, DESK - 22, 32, 5);
      const px = WIN.x + 30, py = WIN.y + WIN.h;                                              // plant
      g.fillStyle = '#3a2c3f'; g.fillRect(px - 10, py - 18, 20, 18);
      g.fillStyle = '#2f6b4a';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(px + (i - 2.5) * 5, py - 26 - (i % 2) * 6, 4, 10, (i - 2.5) * 0.3, 0, 7); g.fill(); }
    });

    grain = document.createElement('canvas'); grain.width = grain.height = 128;
    const gg = grain.getContext('2d')!; const img = gg.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 18; }
    gg.putImageData(img, 0, 0);

    rain.length = 0; drops.length = 0;
    for (let i = 0; i < 160; i++) rain.push({ x: R() * VW, y: R() * VH, l: 8 + R() * 14, v: 380 + R() * 260 });
    for (let i = 0; i < 40; i++) drops.push(newDrop(true));
  }

  function newDrop(anywhere: boolean): Drop {
    return { x: WIN.x + r() * WIN.w, y: anywhere ? WIN.y + r() * WIN.h : WIN.y, s: 1 + r() * 2.2,
             v: r() < 0.3 ? 20 + r() * 50 : 0, life: 4 + r() * 8 };
  }

  function draw(now: number) {
    const g = ctx!;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    const t = (now - t0) / 1000;
    g.drawImage(sky, 0, 0, VW, VH);

    g.fillStyle = 'rgba(70,45,100,0.35)';                                   // clouds drifting past the moon
    for (let i = 0; i < 3; i++) {
      const cx = ((t * (6 + i * 3) + i * 400) % (VW + 600)) - 300, cy = VH * (0.12 + i * 0.07);
      g.beginPath(); g.ellipse(cx, cy, 220, 18, 0, 0, 7); g.fill();
    }

    g.drawImage(city, 0, 0, VW, VH);
    for (const p of lights) {
      if (p.beacon) {
        const a = (Math.sin(t * 2 + p.ph) + 1) / 2;
        g.fillStyle = `rgba(255,70,70,${0.3 + a * 0.7})`; g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        continue;
      }
      if (r() < 0.0004) p.on = !p.on;                                      // someone switches a light on or off
      if (!p.on) continue;
      g.fillStyle = p.warm ? PAL.warm : PAL.cool;
      g.globalAlpha = 0.55 + p.depth * 0.15;
      g.fillRect(p.x, p.y, p.s, p.s * 1.3);
    }
    g.globalAlpha = 1;

    const fs = Math.max(12, VH * 0.025);
    g.font = `bold ${fs}px "Noto Sans CJK JP", "Noto Sans JP", sans-serif`;
    g.textBaseline = 'top';
    for (const s of signs) {
      let on = 1;
      if (s.flicker) on = Math.sin(t * 13 + s.ph) + Math.sin(t * 7.3 + s.ph * 2) > -1.2 ? 1 : 0.25;
      g.save();
      g.shadowColor = s.color; g.shadowBlur = 14 * on; g.fillStyle = s.color; g.strokeStyle = s.color;
      g.globalAlpha = 0.35 + 0.65 * on;
      if (s.vertical) {
        const chars = [...s.text];
        g.lineWidth = 1.5; g.strokeRect(s.x - 4, s.y - 4, fs + 8, fs * chars.length + 8);
        chars.forEach((ch, i) => g.fillText(ch, s.x, s.y + i * fs));
      } else {
        g.fillText(s.text, s.x, s.y);
      }
      g.restore();
    }

    const ty = HORIZON + VH * 0.03 - 14;                                    // the train, every 20–35 s
    train.next -= dt;
    if (train.x < 0 && train.next <= 0) { train.x = 0.0001; train.next = 20 + r() * 15; }
    if (train.x > 0) {
      train.x += dt * VW * 0.22;
      const len = VW * 0.55, x0 = VW + 40 - train.x;
      g.fillStyle = '#2a2342'; g.fillRect(x0, ty, len, 14);
      g.fillStyle = PAL.warm; g.globalAlpha = 0.85;
      for (let wx = x0 + 6; wx < x0 + len - 8; wx += 12) g.fillRect(wx, ty + 3, 7, 5);
      g.globalAlpha = 1; g.fillStyle = PAL.green; g.fillRect(x0, ty + 10, len, 2);
      if (x0 + len < -20) train.x = -1;
    }

    g.strokeStyle = 'rgba(190,200,255,0.25)'; g.lineWidth = 1;              // rain outside
    g.beginPath();
    for (const d of rain) {
      d.y += d.v * dt; d.x -= d.v * dt * 0.18;
      if (d.y > HORIZON + VH * 0.1) { d.y = -20; d.x = r() * (VW + 100); }
      g.moveTo(d.x, d.y); g.lineTo(d.x - d.l * 0.18, d.y + d.l);
    }
    g.stroke();

    for (let i = 0; i < drops.length; i++) {                                 // drops on the glass
      const d = drops[i];
      d.y += d.v * dt; d.life -= dt;
      if (d.life <= 0 || d.y > WIN.y + WIN.h) { drops[i] = newDrop(false); continue; }
      g.fillStyle = 'rgba(220,230,255,0.35)';
      g.beginPath(); g.ellipse(d.x, d.y, d.s, d.s * 1.3, 0, 0, 7); g.fill();
      if (d.v) { g.fillStyle = 'rgba(220,230,255,0.12)'; g.fillRect(d.x - 0.5, d.y - 30, 1, 30); }
    }

    g.drawImage(room, 0, 0, VW, VH);

    const lx = VW * 0.78 - 70, ly = DESK - VH * 0.15;                       // the lamp's warm light
    const flick = 0.92 + Math.sin(t * 3.1) * 0.02;
    const pool = g.createRadialGradient(lx, DESK + 10, 4, lx, DESK + 10, VW * 0.28);
    pool.addColorStop(0, `rgba(255,196,120,${0.32 * flick})`); pool.addColorStop(1, 'rgba(255,196,120,0)');
    g.fillStyle = pool; g.fillRect(0, DESK - VH * 0.25, VW, VH);
    const bulb = g.createRadialGradient(lx, ly + 4, 1, lx, ly + 4, 40);
    bulb.addColorStop(0, 'rgba(255,230,170,0.9)'); bulb.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = bulb; g.beginPath(); g.arc(lx, ly + 4, 40, 0, 7); g.fill();

    const cx = WIN.x + WIN.w * 0.56, cy = WIN.y + WIN.h, br = 1 + Math.sin(t * 1.6) * 0.03;   // the cat
    g.save(); g.shadowColor = 'rgba(255,120,170,0.9)'; g.shadowBlur = 10; g.fillStyle = '#0d0b18';
    g.beginPath(); g.ellipse(cx, cy - 14 * br, 30, 15 * br, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + 26, cy - 18, 11, 10, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx + 20, cy - 25); g.lineTo(cx + 23, cy - 34); g.lineTo(cx + 28, cy - 26); g.fill();
    g.beginPath(); g.moveTo(cx + 29, cy - 26); g.lineTo(cx + 34, cy - 34); g.lineTo(cx + 36, cy - 24); g.fill();
    g.strokeStyle = '#0d0b18'; g.lineWidth = 5; g.lineCap = 'round';
    const sw = Math.sin(t * 0.9) * 10;
    g.beginPath(); g.moveTo(cx - 28, cy - 8); g.quadraticCurveTo(cx - 48, cy + 2 + sw * 0.3, cx - 40 + sw, cy + 14); g.stroke();
    g.restore();

    if (r() < 0.25) steam.push({ x: VW * 0.62 + (r() - 0.5) * 8, y: DESK - 34, a: 0.35, ph: r() * 6 });   // steam
    g.lineWidth = 2;
    for (let i = steam.length - 1; i >= 0; i--) {
      const s = steam[i]; s.y -= dt * 18; s.a -= dt * 0.12;
      if (s.a <= 0) { steam.splice(i, 1); continue; }
      g.strokeStyle = `rgba(255,255,255,${s.a})`;
      g.beginPath(); g.moveTo(s.x + Math.sin(s.y * 0.08 + s.ph) * 4, s.y); g.lineTo(s.x + Math.sin((s.y - 4) * 0.08 + s.ph) * 4, s.y - 4); g.stroke();
    }

    g.fillStyle = 'rgba(0,0,0,0.08)';                                       // 90s finish: scanlines, grain, vignette
    for (let y = 0; y < VH; y += 3) g.fillRect(0, y, VW, 1);
    const pat = g.createPattern(grain, 'repeat');
    if (pat) {
      g.save(); g.translate((r() * 128) | 0, (r() * 128) | 0); g.fillStyle = pat; g.fillRect(-128, -128, VW + 256, VH + 256); g.restore();
    }
    const vig = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vig; g.fillRect(0, 0, VW, VH);
  }

  function frame(now: number) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || now - last < 1000 / fps) return;    // nothing drawn while the window is hidden
    draw(now);
  }

  const resize = new ResizeObserver(() => { size(); if (opts.still) draw(performance.now()); });
  resize.observe(canvas);
  size();
  if (opts.still) draw(performance.now());
  else raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); resize.disconnect(); };
}
