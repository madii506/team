/* TEAM hero: the LED intro that becomes the idle hero.
 * The panel powers on, launches pour in, one MAIN coin grows, a scan finds its BETAS, they fly into formation and get
 * threaded to the main, the main pumps and the betas follow it up, then TEAM decodes out of random glyphs.
 * After that it never stops: the main breathes, the betas bob on their arc, and every few seconds the main nudges up and
 * the team follows a beat later. Everything is drawn in grid cells on LED's tiny canvas (one pixel per dot). */
(() => {
  'use strict';
  const clamp = x => Math.min(1, Math.max(0, x));
  const ease = {
    out: x => 1 - Math.pow(1 - clamp(x), 3),
    inOut: x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    back: x => { x = clamp(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
    // a damped spring: overshoots a little, then settles at 1
    spring: x => x <= 0 ? 0 : 1 - Math.exp(-5.2 * x) * Math.cos(8.2 * x),
  };
  const hill = x => (x <= 0 || x >= 1) ? 0 : Math.sin(Math.PI * x);
  const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const GLYPH = 'ABCDEFGHJKLMNOPQRSUVWXYZ0123456789$#%&+';

  // the timeline, in seconds
  const TL = { power: 1.1, feed0: .4, feed1: 2.6, main0: 1.2, main1: 2.3, scan0: 1.9, scan1: 3.1, fade0: 2.9, fade1: 3.4, fly0: 3.0, fly1: 4.4, thread0: 3.55, pump0: 4.45, lag: .25, col0: 5.2, col1: 5.9, hand0: 5.3, clasp: 6.3, part0: 7.45, part1: 8.0, exp0: 7.6, exp1: 8.55, word: 8.15, END: 9.2 };
  // the finale: the team folds into two hands that meet and shake. One PNG pixel per LED dot, drawn at the same origin they make the handshake.
  const HW = [28, 34, 40, 46, 52, 58, 64, 78, 94, 112], HANDS = {};
  HW.forEach(w => { const l = new Image(), r = new Image(); l.src = '/img/hands/L' + w + '.png'; r.src = '/img/hands/R' + w + '.png'; HANDS[w] = { l, r, h: Math.ceil(w * .564) }; });
  const ready = im => im.complete && im.naturalWidth > 0;
  const NB = 6;                                             // how many betas the main finds

  // the field of launches: one in fifteen is a beta, the rest is noise
  const FIELD = Array.from({ length: 90 }, (_, i) => ({
    u: .04 + rnd(i, 1) * .92, v: .06 + rnd(i, 2) * .86, born: TL.feed0 + rnd(i, 3) * (TL.feed1 - TL.feed0),
    s: .55 + rnd(i, 4) * .6, w: rnd(i, 5) * 6.28, d: rnd(i, 6), beta: -1,
  }));
  // pick six betas spread across the panel (not too close to the main's spot)
  { let k = 0; const order = FIELD.map((c, i) => i).sort((a, b) => rnd(a, 9) - rnd(b, 9));
    for (const i of order) { const c = FIELD[i]; if (k >= NB) break; if (Math.abs(c.u - .5) < .12 && c.v < .5) continue; if (c.born > 2.0) continue; c.beta = k++; } }
  const BETA_LAG = Array.from({ length: NB }, (_, i) => TL.lag + Math.abs(i - (NB - 1) / 2) * .045 + rnd(i, 7) * .04);
  const BETA_PH = Array.from({ length: NB }, (_, i) => rnd(i, 8) * 6.28);

  function coin(g, x, y, r, a, lum) {
    if (r <= .2 || a <= .01) return;
    g.globalAlpha = Math.min(1, a); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    const l = lum == null ? 255 : lum; g.fillStyle = `rgb(${l},${l},${l})`; g.fill();
    g.lineWidth = Math.min(1.7, r * .35); g.strokeStyle = 'rgb(118,118,118)'; g.stroke(); g.globalAlpha = 1;
  }
  function ring(g, x, y, r, a, w) { if (a <= .01 || r <= 0) return; g.globalAlpha = Math.min(1, a); g.lineWidth = w || 1; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
  function plus(g, x, y, s, a) { if (a <= .01) return; g.globalAlpha = Math.min(1, a); g.fillStyle = '#fff'; g.fillRect(x - s, y - .5, s * 2, 1); g.fillRect(x - .5, y - s, 1, s * 2); g.globalAlpha = 1; }

  // where everything sits once the intro is over (the idle formation), in grid cells
  function layout(gw, gh) {
    const mob = gw < 70, m = Math.min(gw, gh);
    const R = m * (mob ? .115 : .1), cx = gw / 2, my = gh * (mob ? .25 : .27), rise = gh * .12;
    const rx = R * (mob || gw < 115 ? 3.5 : 4.3), ry = R * 1.9, r = R * .38;
    const slots = [];
    for (let i = 0; i < NB; i++) { const a = (160 - i * (140 / (NB - 1))) * Math.PI / 180; slots.push({ x: cx + Math.cos(a) * rx, y: my + R * .6 + Math.sin(a) * ry }); }
    const fs = mob ? Math.min(gh * .1, gw * .22) : Math.min(gh * .12, gw * .1), ty = gh * (mob ? .46 : .56);
    const want = Math.min(gw * (mob ? .6 : .33), gh * (mob ? .22 : .32) / .564), hw = HW.filter(w => w <= want).pop() || HW[0];
    const hand = { w: hw, h: HANDS[hw].h }, hy = gh * (mob ? .36 : .42);
    // the same arc spread over n betas (the real team in the idle web may have fewer than six)
    const slotOf = (i, n) => { const a = (n <= 1 ? 90 : 160 - i * (140 / (n - 1))) * Math.PI / 180; return { x: cx + Math.cos(a) * rx, y: my + R * .6 + Math.sin(a) * ry }; };
    return { mob, R, cx, my, rise, r, slots, slotOf, fs, ty, hand, hy };
  }

  window.TeamHero = function (canvas, opts = {}) {
    const reduce = !!opts.reduce;
    let skipAt = null, offset = reduce ? TL.END : 0, done = false, hero = null, labels = { main: '', betas: [] };
    let pumpAt = -1e9, lastCycle = -1, clasped = false, count = NB, last = null; const vis = new Array(NB).fill(1), cur = new Array(NB).fill(null);
    const api = {};
    function finish() {
      if (done) return; done = true;
      try { opts.onProgress && opts.onProgress(1); } catch (e) { }
      try { opts.onDone && opts.onDone(); } catch (e) { }
    }
    const timeOf = t0 => skipAt != null ? t0 - skipAt + TL.END : t0 + offset;
    // two hands slide in from the edges, meet, grip, shake; afterwards they shake again on every idle beat
    function hands(g, gw, gh, t, L, mxn, myn, sinceP, A) {
      const H = HANDS[L.hand.w], hk = clamp((t - TL.hand0) / (TL.clasp - TL.hand0)); if (hk <= 0 || !ready(H.l) || !ready(H.r)) return;
      const part = ease.inOut((t - TL.part0) / (TL.part1 - TL.part0)); if (part >= 1) return;
      const e = ease.inOut(hk), w = L.hand.w, h = H.h, dist = gw * .52 + w * .35, rel = part * w * .22;
      const s1 = (t - TL.clasp) / 1.0, s2 = sinceP / .9;
      let shake = 0; if (s1 > 0 && s1 < 1) shake += Math.sin(s1 * Math.PI * 4) * h * .075 * (1 - s1);
      const ox = L.cx - w / 2 + mxn * 1.6, oy = L.hy - h / 2 + myn * 1.2 + shake, lift = (1 - e) * gh * .07;
      const moving = hk < 1 || Math.abs(shake) > .05 || part > 0; g.imageSmoothingEnabled = moving;
      // glow behind the grip, a flash when they meet
      const flash = s1 > 0 && s1 < .6 ? (1 - s1 / .6) : 0, gl = (hk >= 1 ? .1 + flash * .35 : hk * .06) * (1 - part);
      const rg = g.createRadialGradient(L.cx, L.hy, 0, L.cx, L.hy, w * .62); rg.addColorStop(0, `rgba(255,255,255,${gl})`); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(L.cx - w, L.hy - w, w * 2, w * 2);
      g.globalAlpha = clamp(hk * 3) * (1 - part);
      const px = v => moving ? v : Math.round(v);
      g.drawImage(H.l, px(ox - dist * (1 - e) - rel), px(oy + lift));
      g.drawImage(H.r, px(ox + dist * (1 - e) + rel), px(oy + lift * .7));
      g.globalAlpha = 1; g.imageSmoothingEnabled = true;
      if (!clasped && t >= TL.clasp) { clasped = true; A.ripple(L.cx, L.hy); }
      if (flash > 0) { ring(g, L.cx, L.hy, w * (.25 + s1 * .9), flash * .55, 1); plus(g, L.cx - w * .2, L.hy - h * .62, 1.3, flash); plus(g, L.cx + w * .24, L.hy - h * .55, 1, flash * .8); plus(g, L.cx + w * .02, L.hy - h * .78, .9, flash * .7); }

    }

    hero = window.LED(canvas, {
      cell: (W, H) => W < 700 ? 7 : W < 1200 ? 8 : 9, gpu: true, fps: 60, ease: .2, idle: false,
      // the panel powers on from the centre (the GPU path dims dots outside a growing circle)
      power(t0, gw, gh) { const t = timeOf(t0); if (t > TL.power) return null; return [gw / 2, gh * .3, Math.hypot(gw, gh) * .55 * ease.out(t / (TL.power - .05))]; },
      draw(g, gw, gh, t0, A) {
        const t = timeOf(t0), L = layout(gw, gh), base = Math.max(1, Math.min(gw, gh) * .014);
        // the software path has no power(): fake the power-on with a growing clip
        if (!A.gpu && t < TL.power) { const rad = Math.hypot(gw, gh) * .55 * ease.out(t / (TL.power - .05)); g.beginPath(); g.arc(gw / 2, gh * .3, Math.max(.1, rad), 0, Math.PI * 2); g.clip(); }
        // mouse parallax: the main moves a little more than the betas
        const mxn = A.mouse.x > -50 ? (A.mouse.x - gw / 2) / gw : 0, myn = A.mouse.y > -50 ? (A.mouse.y - gh / 2) / gh : 0;

        // ---- the main: grows, then pumps, then breathes ----
        const grow = ease.back((t - TL.main0) / (TL.main1 - TL.main0));
        const pumpK = ease.spring((t - TL.pump0) / .9);
        let mainOff = L.rise * (1 - Math.min(1.04, pumpK));            // starts low, rises by `rise`
        // idle: every 4.2 s the main nudges up and the team follows a beat later
        let cyc = -1, cph = 0;
        if (t > TL.END + 1.2) { const c = (t - TL.END - 1.2) / 4.2; cyc = Math.floor(c); cph = (c - cyc) * 4.2; }
        let newPump = false; if (cyc >= 0 && cyc !== lastCycle) { lastCycle = cyc; pumpAt = t - cph; newPump = cph < .3; }
        const sinceP = t - pumpAt, bumpA = L.rise * .11;
        mainOff -= bumpA * hill(sinceP / .8);
        const breathe = reduce ? 0 : Math.sin(t * 1.6) * .02;
        const back = ease.inOut((t - TL.exp0) / (TL.exp1 - TL.exp0)), col = ease.inOut((t - TL.col0) / (TL.col1 - TL.col0)) * (1 - back), keep = 1 - col;
        const mx0 = L.cx + mxn * 2.6, my0 = L.my + mainOff + myn * 1.6;
        const mx = mx0 + (L.cx - mx0) * col, my = my0 + (L.hy - my0) * col, mr = L.R * grow * (1 + (t > TL.END ? breathe : 0)) * keep;

        // ---- betas: positions in the formation (with the follow-up lag) ----
        const bpos = [];
        for (let i = 0; i < NB; i++) {
          const tg = t > TL.END && i < count && count < NB ? L.slotOf(i, count) : L.slots[i];
          if (!cur[i] || t < TL.END) cur[i] = { x: tg.x, y: tg.y }; else { cur[i].x += (tg.x - cur[i].x) * .07; cur[i].y += (tg.y - cur[i].y) * .07; }
          const s = cur[i], k = ease.spring((t - TL.pump0 - BETA_LAG[i]) / .9);
          let off = L.rise * (1 - Math.min(1.06, k));
          off -= bumpA * .85 * hill((sinceP - .22 - i * .035) / .8);
          const bob = t > TL.fly1 ? Math.sin(t * 1.3 + BETA_PH[i]) * .55 : 0, sway = t > TL.fly1 ? Math.cos(t * .9 + BETA_PH[i]) * .4 : 0;
          const bx = s.x + sway + mxn * 1.5, by = s.y + off + bob + myn * 1.0, cc = ease.inOut((t - TL.col0 - i * .04) / (TL.col1 - TL.col0 - .1)) * (1 - ease.inOut((t - TL.exp0 - .1 - i * .05) / (TL.exp1 - TL.exp0 - .1)));
          if (t > TL.END) vis[i] += ((i < count ? 1 : 0) - vis[i]) * .1;
          bpos.push({ x: bx + (L.cx - bx) * cc, y: by + (L.hy - by) * cc, k: (1 - cc) * vis[i] });
        }

        // ---- 1–3. the field of launches, the scan, the found betas ----
        const ringMax = Math.hypot(gw, gh) * .62, scanK = ease.out((t - TL.scan0) / (TL.scan1 - TL.scan0)), ringR = scanK * ringMax;
        const scanned = c => { const dx = c.u * gw - L.cx, dy = c.v * gh - (L.my + L.rise); const d = Math.hypot(dx, dy); return t > TL.scan0 && ringR >= d ? (d / ringMax) : null; };
        if (t < TL.fly1 + .2) {
          for (const c of FIELD) {
            const pop = ease.back((t - c.born) / .28); if (pop <= 0) continue;
            let x = c.u * gw, y = c.v * gh + (t < TL.fly0 && !reduce ? Math.sin(t * 3 + c.w) * .25 : 0), r = base * c.s * pop, a = c.beta >= 0 ? 1 : .78;
            const sd = scanned(c), tf = sd != null ? TL.scan0 + (TL.scan1 - TL.scan0) * Math.pow(sd, 1 / 3) * .9 : null, since = tf != null ? t - tf : -1;
            if (c.beta < 0) {
              if (since > 0) a *= 1 - .55 * clamp(since / .35);
              a *= 1 - clamp((t - TL.fade0) / (TL.fade1 - TL.fade0)); if (a <= .02) continue;
              coin(g, x, y, r, a, 210); continue;
            }
            // a beta: flash when the scan finds it, then fly into its slot with a swirl
            if (since > 0 && since < .5) ring(g, x, y, r + since * 9, (1 - since / .5) * .9, .8);
            if (since > 0) r *= 1.25;
            const k = ease.inOut((t - TL.fly0 - c.d * .3) / 1.0);
            if (k > 0) {
              const tgt = { x: L.slots[c.beta].x, y: L.slots[c.beta].y + L.rise }, sw = (1 - k) * 1.1 * (c.u < .5 ? 1 : -1), dx = x - tgt.x, dy = y - tgt.y;
              x = tgt.x + (dx * Math.cos(sw) - dy * Math.sin(sw)) * (1 - k); y = tgt.y + (dx * Math.sin(sw) + dy * Math.cos(sw)) * (1 - k);
              r = r + (L.r - r) * k;
            }
            if (k >= 1) continue;                                   // from here the formation draws it
            coin(g, x, y, r, a, 236);
          }
          // the scan ring itself
          if (t > TL.scan0 && t < TL.scan1 + .1) { ring(g, L.cx, L.my + L.rise, ringR, .5 * (1 - scanK), 1); ring(g, L.cx, L.my + L.rise, ringR * .82, .22 * (1 - scanK), 1); }
        }

        // ---- halo + trail of the main ----
        if (mr > .3) {
          const hg = g.createRadialGradient(mx, my, mr * .8, mx, my, mr * 2.5); hg.addColorStop(0, `rgba(255,255,255,${.16 + (t > TL.END ? Math.max(0, Math.sin(t * 1.6)) * .05 : 0)})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
          g.globalAlpha = keep; g.fillStyle = hg; g.fillRect(mx - mr * 2.6, my - mr * 2.6, mr * 5.2, mr * 5.2); g.globalAlpha = 1;
          const tp = (t - TL.pump0) / .9;
          if (tp > 0 && tp < 1.2) { const tr = g.createLinearGradient(0, my + mr, 0, my + mr + L.rise * (1.1 - tp)); tr.addColorStop(0, `rgba(255,255,255,${.4 * (1 - clamp(tp))})`); tr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = tr; g.fillRect(mx - mr * .5, my + mr, mr, L.rise * 1.2); }
        }

        // ---- threads: each beta to the main (stretch while the main leads, snap when they catch up) ----
        const settled = t >= TL.fly0 + .95;
        if (t > TL.thread0 && keep > 0) {
          const snap = Math.max(0, 1 - Math.abs(t - (TL.pump0 + .85)) / .25) * .45;
          g.lineWidth = .6;
          for (let i = 0; i < NB; i++) {
            const b = bpos[i], k = ease.out((t - TL.thread0 - i * .07) / .5); if (k <= 0) continue;
            const sh = t > TL.END ? Math.sin(t * 3 + i * 1.7) * .12 : 0;
            g.globalAlpha = Math.min(1, .42 + sh + snap) * b.k;
            g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(b.x, b.y - L.r * .9);
            g.lineTo(b.x + (mx - b.x) * k, (b.y - L.r * .9) + ((my + mr * .85) - (b.y - L.r * .9)) * k); g.stroke();
          }
          g.globalAlpha = 1;
        }

        // ---- the formation: betas, then the main on top ----
        if (settled) for (let i = 0; i < NB; i++) if (bpos[i].k > .02) coin(g, bpos[i].x, bpos[i].y, L.r * bpos[i].k, 1, 236);
        if (mr > .3) {
          coin(g, mx, my, mr, 1, 255);
          if (mr > 2.2) { g.lineWidth = .9; g.strokeStyle = 'rgb(140,140,140)'; g.beginPath(); g.arc(mx, my, mr * .66, 0, Math.PI * 2); g.stroke(); }
        }
        // the main's own scan pulses while it finds its team, and a soft ring on every idle pump
        if (t > TL.main1 - .3 && t < TL.scan0 + .4) { const k = (t - (TL.main1 - .3)) / 1.0; ring(g, mx, my, mr * (1.1 + k * 1.6), .5 * (1 - clamp(k)), 1); }
        hands(g, gw, gh, t, L, mxn, myn, sinceP, A);
        if (cyc >= 0 && sinceP < 1.1) ring(g, mx, my, mr * (1.15 + sinceP * 2.2), .4 * (1 - sinceP / 1.1), .8);

        // ---- sparkles as each beta arrives at the top ----
        for (let i = 0; i < NB; i++) {
          const ta = TL.pump0 + BETA_LAG[i] + .55, d = t - ta;
          if (d > 0 && d < .6) { const b = bpos[i], a = 1 - d / .6, o = L.r + 1.4 + d * 3; plus(g, b.x - o * .7, b.y - o * .7, 1.1, a); plus(g, b.x + o * .8, b.y - o * .5, .9, a * .8); }
          if (cyc >= 0 && bpos[i].k > .5) { const d2 = sinceP - .6 - i * .035; if (d2 > 0 && d2 < .45) { const b = bpos[i]; plus(g, b.x + (i % 2 ? 1 : -1) * (L.r + 1.5), b.y - L.r - 1, .8, (1 - d2 / .45) * .7); } }

        }

        // (no wordmark on the page itself: the web of a real team is the hero)
        if (newPump) A.ripple(mx, my);
        last = { mx, my, mr, b: bpos.map(b => ({ x: b.x, y: b.y, r: L.r * b.k, k: b.k })) };

        if (!done) { try { opts.onProgress && opts.onProgress(clamp(t / TL.END)); } catch (e) { } if (t >= TL.END) finish(); }
        return false;
      },
    });
    requestAnimationFrame(() => canvas.classList.add('on'));
    if (reduce) setTimeout(finish, 0);
    // safety: never hold the page hostage
    setTimeout(() => { if (!done) api.skip(); }, TL.END * 1000 + 4000);

    api.skip = () => { if (done) return; skipAt = hero.t; finish(); hero.wake(); };
    api.pulse = (x, y) => { const L = layout(hero.gw, hero.gh); pumpAt = timeOf(hero.t); hero.ripple(x == null ? L.cx : x, y == null ? L.hy : y); };
    api.setLabels = (mainSym, betaSyms) => { labels = { main: String(mainSym || ''), betas: (betaSyms || []).map(String) }; };
    // how many betas the idle web shows (the real team in it may have fewer than six)
    api.setCount = n => { count = Math.max(0, Math.min(NB, n | 0)); hero.wake(); };
    // where the main and each beta sit right now, in CSS pixels relative to the canvas
    api.nodes = () => { if (!last) return null; const c = hero.cell; return { main: { x: last.mx * c, y: last.my * c, r: last.mr * c }, betas: last.b.map(b => ({ x: b.x * c, y: b.y * c, r: b.r * c, k: b.k })) }; };
    api.led = hero; api.TL = TL;
    Object.defineProperty(api, 'done', { get: () => done });
    return api;
  };
})();
