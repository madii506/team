/* TEAM docs: LED title and background, live config, a searchable table of contents. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

  /* ---------------- the dot panel behind the page ---------------- */
  let bg = null;
  try {
    bg = window.LED($('#bgled'), {
      cell: W => W < 700 ? 7 : W < 1200 ? 8 : 9, fit: 'self', fps: 40, ease: .12, idle: true, gpu: true,
      draw(g, gw, gh, t) {
        if (reduce) return true;
        const blobs = [[.15 + Math.sin(t * .06) * .12, .25 + Math.cos(t * .05) * .2, .4], [.85 + Math.cos(t * .05) * .1, .65 + Math.sin(t * .07) * .2, .46], [.5 + Math.sin(t * .04 + 2) * .3, .95 + Math.cos(t * .05) * .12, .34]];
        for (const [u, v, r] of blobs) { const R = Math.max(gw, gh) * r, gr = g.createRadialGradient(u * gw, v * gh, 0, u * gw, v * gh, R); gr.addColorStop(0, 'rgba(255,255,255,.065)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, gw, gh); }
        return false;
      },
    });
    addEventListener('pointermove', e => { const c = bg.cell || 9; bg.mouse.x = e.clientX / c; bg.mouse.y = e.clientY / c; bg.wake(); }, { passive: true });
    addEventListener('pointerdown', e => { if (e.target.closest('a,button,input,label,pre,table,.route')) return; const c = bg.cell || 9; bg.ripple(e.clientX / c, e.clientY / c); }, { passive: true });
  } catch (e) { }

  /* ---------------- the title, in dots ---------------- */
  function ledTitles() {
    const mob = innerWidth < 700, H = mob ? 64 : 96, cell = mob ? 3 : 4;
    $$('.led-t').forEach(h => {
      if (h.querySelector('canvas') || !window.LED) return;
      const t = h.dataset.t, c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
      const span = document.createElement('span'); span.className = 'ttxt sr'; span.textContent = h.textContent; h.textContent = ''; h.append(span, c);
      const m = document.createElement('canvas').getContext('2d'); m.font = `800 ${H * .86}px I, Inter, sans-serif`; try { m.letterSpacing = (H * .86 * .04) + 'px'; } catch (e) { }
      c.style.width = Math.min(h.parentElement.clientWidth, Math.ceil(m.measureText(t).width + cell * 4)) + 'px'; c.style.height = H + 'px'; c.style.minHeight = H + 'px';
      h.style.minHeight = H + 'px'; h.classList.add('ready');
      let start = null;
      const L = window.LED(c, {
        cell, fit: 'self', fps: 30, ease: .25, transparent: true,
        draw(g, gw, gh, tt) {
          if (start == null) return true;
          const p = reduce ? 1 : ease((tt - start) / 1.1), fs = gh * .86;
          g.font = `800 ${fs}px I, Inter, sans-serif`; try { g.letterSpacing = (fs * .04) + 'px'; } catch (e) { }
          g.textBaseline = 'alphabetic'; g.save(); g.beginPath(); g.rect(0, 0, gw * p, gh); g.clip();
          g.fillStyle = 'rgb(236,236,236)'; g.fillText(t, 1, gh * .86); g.lineWidth = .5; g.strokeStyle = 'rgb(120,120,120)'; g.strokeText(t, 1, gh * .86); g.restore();
          if (!reduce) {
            const sw = ((tt * .3) % 1.8 - .4) * gw, gr = g.createLinearGradient(sw - 8, 0, sw + 8, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.save(); g.beginPath(); g.rect(0, 0, gw * p, gh); g.clip(); g.fillStyle = gr; g.fillText(t, 1, gh * .86); g.restore();
          }
          return reduce;
        },
      });
      new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { start = L.t; L.wake(); o.disconnect(); } }, { threshold: .3 }).observe(c);
    });
  }
  (document.fonts && document.fonts.load ? document.fonts.load('800 80px I').catch(() => { }) : Promise.resolve()).then(ledTitles);

  /* ---------------- smooth scroll, reveal, progress ---------------- */
  let lenis = null;
  if (!reduce && window.Lenis) { lenis = new Lenis({ lerp: .085, smoothWheel: true }); const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  const nav = $('#nav'), prog = $('#progress'), toc = $('#toc'), tlist = $('#tlist');
  const secs = $$('.ds');
  const offset = () => (nav ? nav.offsetHeight : 62) + (getComputedStyle(toc).flexDirection === 'row' ? toc.offsetHeight : 0) + 14;
  function goTo(el, instant) {
    if (!el) return; let top = 0; for (let n = el; n; n = n.offsetParent) top += n.offsetTop;   // offsetTop ignores the reveal transform
    const y = Math.max(0, top - offset());
    if (lenis && !instant) lenis.scrollTo(y, { duration: 1.1 }); else scrollTo({ top: y, behavior: instant || reduce ? 'auto' : 'smooth' });
  }

  // the table of contents, built from the sections
  tlist.innerHTML = secs.map(s => { const h = $('h2', s), n = $('.mono', h).textContent; return `<a href="#${s.id}" data-id="${s.id}"><span>${n}</span>${h.textContent.replace(n, '').trim()}</a>`; }).join('');
  const links = $$('a', tlist);
  tlist.addEventListener('click', e => { const a = e.target.closest('a[data-id]'); if (!a) return; e.preventDefault(); const s = document.getElementById(a.dataset.id); s.classList.add('vis'); goTo(s); history.replaceState(null, '', '#' + a.dataset.id); });

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  secs.forEach(s => io.observe(s));

  let curId = null;
  function spy() {
    nav.classList.toggle('scrolled', scrollY > 10);
    const line = offset() + innerHeight * .18; let cur = null;
    for (const s of secs) { if (s.classList.contains('miss')) continue; if (s.getBoundingClientRect().top <= line) cur = s.id; }
    if (!cur) { const first = secs.find(s => !s.classList.contains('miss')); cur = first && first.id; }
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) { const vis = secs.filter(s => !s.classList.contains('miss')); if (vis.length) cur = vis[vis.length - 1].id; }
    if (cur !== curId) {
      curId = cur; links.forEach(a => a.classList.toggle('on', a.dataset.id === cur));
      const a = links.find(x => x.dataset.id === cur);
      if (a && tlist.scrollWidth > tlist.clientWidth + 2) tlist.scrollTo({ left: Math.max(0, a.offsetLeft - tlist.clientWidth / 2 + a.offsetWidth / 2), behavior: reduce ? 'auto' : 'smooth' });
    }
    const m = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${m > 0 ? Math.min(1, scrollY / m) : 0})`;
  }
  addEventListener('scroll', spy, { passive: true }); addEventListener('resize', spy);

  /* ---------------- copy buttons on code ---------------- */
  $$('pre.code').forEach(p => {
    const w = document.createElement('div'); w.className = 'cwrap'; p.parentNode.insertBefore(w, p); w.appendChild(p);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cpy'; b.textContent = 'COPY'; w.appendChild(b);
    b.onclick = async () => { try { await navigator.clipboard.writeText(p.textContent); b.textContent = 'COPIED'; } catch (e) { b.textContent = 'SELECT'; } setTimeout(() => { b.textContent = 'COPY'; }, 1400); };
  });

  /* ---------------- search ---------------- */
  const dq = $('#dq'), none = $('#tnone'), HL = window.CSS && CSS.highlights && window.Highlight ? new Highlight() : null;
  if (HL) CSS.highlights.set('dq', HL);
  function highlight(words) {
    if (!HL) return; HL.clear(); if (!words.length) return;
    for (const s of secs) {
      if (s.classList.contains('miss')) continue;
      const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT); let n, k = 0;
      while ((n = tw.nextNode()) && k < 400) {
        const tx = n.nodeValue.toLowerCase();
        for (const w of words) { let i = tx.indexOf(w); while (i >= 0 && k < 400) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + w.length); HL.add(r); k++; i = tx.indexOf(w, i + w.length); } }
      }
    }
  }
  let qTimer = 0;
  function search() {
    const q = dq.value.trim().toLowerCase(), words = q.split(/\s+/).filter(w => w.length > 1);
    let shown = 0;
    secs.forEach((s, i) => {
      const txt = (s.textContent + ' ' + (s.dataset.t || '')).toLowerCase();
      const hit = !words.length || words.every(w => txt.includes(w));
      s.classList.toggle('miss', !hit); links[i].classList.toggle('miss', !hit);
      let em = $('em', links[i]); if (em) em.remove();
      if (hit && words.length) { const c = words.reduce((a, w) => a + (txt.split(w).length - 1), 0); em = document.createElement('em'); em.textContent = c; links[i].appendChild(em); s.classList.add('vis'); }
      if (hit) shown++;
    });
    none.hidden = shown > 0; highlight(words);
    if (lenis) lenis.resize && lenis.resize();
    curId = null; spy();
  }
  dq.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { search(); const first = secs.find(s => !s.classList.contains('miss')); if (dq.value.trim() && first) goTo(first); }, 160); });
  dq.addEventListener('keydown', e => { if (e.key === 'Escape') { dq.value = ''; search(); dq.blur(); } if (e.key === 'Enter') { const first = secs.find(s => !s.classList.contains('miss')); if (first) goTo(first); } });
  addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== dq && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); dq.focus(); } });

  /* ---------------- live config ---------------- */
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const num = v => String(+(+v).toFixed(4));
  function fmt(v, el) {
    const f = el.dataset.f, u = el.dataset.u || '';
    const one = x => f === 'usd' ? '$' + Number(x).toLocaleString('en-US') : f === 'bps' ? num(x / 100) + '%' : num(x);
    if (Array.isArray(v)) return one(v[0]) + '–' + one(v[1]) + (f ? '' : u);
    return one(v) + (f ? '' : u);
  }
  (async () => {
    const st = $('#cfgState'), dot = $('#cfgDot');
    try {
      const r = await fetch('/api/config', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
      const c = await r.json();
      $$('[data-c]').forEach(el => { const v = get(c, el.dataset.c); if (v == null) return; const t = fmt(v, el); if (el.textContent !== t) { el.textContent = t; if (el.tagName === 'TD') el.classList.add('flash'); } });
      const d = c.defaults || {};
      st.textContent = `live config · band ${d.band}% · buy ${d.buy}% · trim ${d.trim}% · max ${c.maxSol} SOL a team · up to ${c.maxBetas} betas`;
    } catch (e) { st.textContent = 'config offline · showing the defaults in the code'; dot.classList.add('off'); }
  })();

  /* ---------------- deep links ---------------- */
  const startHash = location.hash.slice(1);
  if (startHash && document.getElementById(startHash)) { const s = document.getElementById(startHash); s.classList.add('vis'); requestAnimationFrame(() => setTimeout(() => { goTo(s, true); spy(); }, 60)); }
  spy();
})();
