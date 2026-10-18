/* TEAM: betas that actually follow the main. Every number on this page is read live; every action is a signature or a
 * transaction you sign. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null || v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { } } };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
  const usd = v => !v ? '$0' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v);
  const ago = t => { if (!t) return '—'; const s = Math.max(0, (Date.now() - new Date(t)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const mins = m => m == null ? '—' : m < 0 ? 'before' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd';
  const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(d) + '%';
  const pctc = (v, d = 1) => v == null || !isFinite(v) ? '<span class="dim">—</span>' : `<span class="${v >= 0 ? 'up' : 'dn'}">${pct(v, d)}</span>`;
  const sol = v => (+v || 0).toFixed(Math.abs(v) >= 10 ? 2 : 3);
  const av = (c, cls = '') => c && c.image ? `<img class="av ${cls}" src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<i class=&quot;av ${cls}&quot;>${esc(((c && c.symbol) || '?')[0])}</i>'">` : `<i class="av ${cls}">${esc(((c && c.symbol) || '?')[0])}</i>`;
  const links = m => `<a class="lk" href="https://pump.fun/coin/${esc(m)}" target="_blank" rel="noopener">pump</a><a class="lk" href="https://dexscreener.com/solana/${esc(m)}" target="_blank" rel="noopener">dex</a><a class="lk" href="https://axiom.trade/meme/${esc(m)}?chain=sol" target="_blank" rel="noopener">axiom</a>`;
  const say = t => { $('#srlive').textContent = t; };
  function toast(t, ms = 2600) { $$('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); say(t); setTimeout(() => d.remove(), ms); }
  const S = { tok: store.get('tm:tok'), wallet: store.get('tm:w'), prov: null, cfg: { defaults: { band: 10, buy: 15, trim: 30, cooldown: 3, maxTrade: .3, impact: 4 }, maxSol: 5, minFund: .05, reserve: .015, minLiq: 3000, maxBetas: 5 } };
  const errMsg = e => /reject|cancel|denied|declin/i.test(e && e.message) ? 'Cancelled in the wallet.' : (e && e.message) || 'Something went wrong.';

  async function api(p, body) {
    const h = { 'content-type': 'application/json' }; if (S.tok) h.authorization = 'Bearer ' + S.tok;
    const r = await fetch('/api/' + p, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (r.status === 401 && S.tok && !/^(login|nonce)/.test(p)) { S.tok = null; store.set('tm:tok', ''); renderMe(); }
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong (' + r.status + ').'); e.status = r.status; e.data = j; throw e; }
    return j;
  }
  const ease = { out: x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3) };

  /* ---------------- the hero: the intro, then the idle team ---------------- */
  const root = document.documentElement;
  let hero = null;
  const finishIntro = () => { root.classList.remove('intro'); };
  try {
    hero = window.TeamHero($('#led'), { reduce: reduce || !root.classList.contains('intro'), onProgress: p => { $('#bootBar').style.transform = `scaleX(${p})`; }, onDone: finishIntro });
  } catch (e) { finishIntro(); }
  const skip = () => { if (hero && !hero.done) hero.skip(); else finishIntro(); };
  ['wheel', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (root.classList.contains('intro')) skip(); }, { passive: true }));
  $('#top').addEventListener('click', e => { if (root.classList.contains('intro') && !e.target.closest('form,a')) skip(); });
  $('#skip').onclick = skip;
  setTimeout(() => { if (root.classList.contains('intro')) skip(); }, 12000);

  /* ---------------- the same dot panel behind every section ---------------- */
  const heroEl = $('#top');
  const bg = window.LED($('#bgled'), {
    cell: (W, H) => W < 700 ? 7 : W < 1200 ? 8 : 9, fit: 'self', fps: 40, ease: .12, idle: true, gpu: true,
    active: () => heroEl.getBoundingClientRect().bottom < innerHeight * .98,
    draw(g, gw, gh, t) {
      if (reduce) return true;
      const blobs = [[.2 + Math.sin(t * .07) * .14, .3 + Math.cos(t * .05) * .2, .42], [.8 + Math.cos(t * .06) * .12, .6 + Math.sin(t * .08) * .22, .5], [.5 + Math.sin(t * .045 + 2) * .3, .9 + Math.cos(t * .05) * .15, .36]];
      for (const [u, v, r] of blobs) { const R = Math.max(gw, gh) * r, gr = g.createRadialGradient(u * gw, v * gh, 0, u * gw, v * gh, R); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, gw, gh); }
      return false;
    },
  });
  addEventListener('pointermove', e => { const c = bg.cell || 9; bg.mouse.x = e.clientX / c; bg.mouse.y = e.clientY / c; bg.wake(); }, { passive: true });
  addEventListener('pointerdown', e => { if (e.target.closest('a,button,input,label,.drawer,.modal,#top,.brow,.mcard,.tcard2')) return; const c = bg.cell || 9; bg.ripple(e.clientX / c, e.clientY / c); }, { passive: true });

  /* ---------------- smooth scroll, reveal, nav, progress ---------------- */
  let lenis = null;
  if (!reduce && window.Lenis) { lenis = new Lenis({ lerp: .085, smoothWheel: true }); const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  const goTo = (el, off = 70) => { if (typeof el === 'string') el = document.getElementById(el); if (!el) return; const y = el.getBoundingClientRect().top + scrollY - off; lenis ? lenis.scrollTo(Math.max(0, y), { duration: 1.2 }) : scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach(el => io.observe(el));
  const nav = $('#nav'), navLinks = $$('#links a[data-s]'), ind = $('#ind'), prog = $('#progress');
  function moveInd(a) { navLinks.forEach(x => x.classList.toggle('on', x === a)); if (!a) { ind.style.opacity = 0; return; } ind.style.opacity = 1; ind.style.width = a.offsetWidth + 'px'; ind.style.transform = `translateX(${a.offsetLeft - 4}px)`; }
  function spy() {
    nav.classList.toggle('scrolled', scrollY > 10);
    let cur = null; navLinks.forEach(a => { const s = $('#' + a.dataset.s); if (s && s.getBoundingClientRect().top < innerHeight * .45) cur = a; }); moveInd(cur);
    const m = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${m > 0 ? scrollY / m : 0})`;
  }
  addEventListener('scroll', spy, { passive: true }); addEventListener('resize', spy); spy();
  document.addEventListener('click', e => { const a = e.target.closest('a[data-s], a[data-go], button[data-go]'); if (!a) return; e.preventDefault(); goTo(a.dataset.s || a.dataset.go); });
  // cards lean toward the pointer
  document.addEventListener('pointermove', e => {
    if (reduce) return; const c = e.target.closest('.mcard,.tcard2'); $$('.mcard.tilting,.tcard2.tilting').forEach(x => { if (x !== c) { x.classList.remove('tilting'); x.style.transform = ''; } });
    if (!c) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.classList.add('tilting'); c.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-2px)`;
  }, { passive: true });

  /* ---------------- section titles in dots ---------------- */
  function ledTitles() {
    const mob = innerWidth < 700, H = mob ? 52 : 84, cell = mob ? 3 : 4;
    $$('.led-t').forEach(h => {
      if (h.querySelector('canvas')) return;
      const t = h.dataset.t, c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
      const span = document.createElement('span'); span.className = 'ttxt sr'; span.textContent = h.textContent; h.textContent = ''; h.append(span, c);
      const m = document.createElement('canvas').getContext('2d'); m.font = `800 ${H * .86}px I, Inter, sans-serif`; try { m.letterSpacing = (H * .86 * .04) + 'px'; } catch (e) { }
      c.style.width = Math.min(h.parentElement.clientWidth, Math.ceil(m.measureText(t).width + cell * 4)) + 'px'; c.style.height = H + 'px'; h.classList.add('ready');
      let start = null;
      const L = window.LED(c, {
        cell, fit: 'self', fps: 30, ease: .25, transparent: true,
        draw(g, gw, gh, tt) {
          if (start == null) return true;
          const p = ease.out((tt - start) / 1), fs = gh * .86;
          g.font = `800 ${fs}px I, Inter, sans-serif`; try { g.letterSpacing = (fs * .04) + 'px'; } catch (e) { }
          g.textBaseline = 'alphabetic'; g.save(); g.beginPath(); g.rect(0, 0, gw * p, gh); g.clip();
          g.fillStyle = 'rgb(232,232,232)'; g.fillText(t, 1, gh * .86); g.lineWidth = .5; g.strokeStyle = 'rgb(120,120,120)'; g.strokeText(t, 1, gh * .86); g.restore();
          const sw = ((tt * .3) % 1.8 - .4) * gw, gr = g.createLinearGradient(sw - 8, 0, sw + 8, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.save(); g.beginPath(); g.rect(0, 0, gw * p, gh); g.clip(); g.fillStyle = gr; g.fillText(t, 1, gh * .86); g.restore();
          return false;
        },
      });
      new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { start = L.t; L.wake(); o.disconnect(); } }, { threshold: .4 }).observe(c);
    });
  }
  (document.fonts && document.fonts.load ? document.fonts.load('800 80px I').catch(() => { }) : Promise.resolve()).then(ledTitles);

  /* ---------------- the engine, drawn in dots ---------------- */
  const disc = (g, x, y, r, a = 1) => { if (r <= .2) return; g.globalAlpha = a; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = Math.min(1.4, r * .3); g.strokeStyle = 'rgb(110,110,110)'; g.stroke(); g.globalAlpha = 1; };
  const line = (g, x0, y0, x1, y1, a = .5, w = .8) => { g.globalAlpha = a; g.strokeStyle = '#fff'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.globalAlpha = 1; };
  const VLED = {
    1(g, w, h, t) { const k = t % 4, cx = w * .3, cy = h * .55 - Math.sin(t * 1.4) * h * .08, r = h * .2; disc(g, cx, cy, r); g.globalAlpha = .7; g.strokeStyle = '#fff'; g.lineWidth = .9; g.beginPath(); for (let x = 0; x < w * .5; x++) { const y = h * .55 - Math.sin((t - x * .06) * 1.4) * h * .08; x ? g.lineTo(cx + r + 2 + x, y) : g.moveTo(cx + r + 2, y); } g.stroke(); g.globalAlpha = 1; },
    2(g, w, h, t) { const mY = h * .38, bY = h * .66 + Math.sin(t * 1.3) * h * .06; disc(g, w * .3, mY, h * .17); disc(g, w * .7, bY, h * .11, .85); line(g, w * .3, mY, w * .7, bY, .35); const gx = w * .86; line(g, gx, mY, gx, bY, .8, 1); line(g, gx - 2, mY, gx + 2, mY, .8); line(g, gx - 2, bY, gx + 2, bY, .8); },
    3(g, w, h, t) { const k = (t % 3.2) / 3.2, mY = h * .36, from = h * .76, by = from + (mY + h * .02 - from) * ease.out((k - .35) / .4); disc(g, w * .28, mY, h * .16); line(g, w * .5, mY, w * .92, mY, .25); disc(g, w * .7, k < .35 ? from : by, h * .11, .9); if (k > .2 && k < .5) { g.globalAlpha = .9; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w * .7, h * .5); g.lineTo(w * .7 - 4, h * .58); g.lineTo(w * .7 + 4, h * .58); g.fill(); g.globalAlpha = 1; } },
    4(g, w, h, t) { const k = (t % 3.2) / 3.2, mY = h * .6, from = h * .2, by = from + (mY - h * .02 - from) * ease.out((k - .35) / .4); disc(g, w * .28, mY, h * .16); line(g, w * .5, mY, w * .92, mY, .25); disc(g, w * .7, k < .35 ? from : by, h * .11 * (k > .35 ? 1 - .25 * ease.out((k - .35) / .4) : 1), .9); },
  };
  $$('.vled').forEach(c => { const f = VLED[c.dataset.v]; window.LED(c, { cell: 4, fit: 'self', fps: 30, ease: .3, transparent: true, draw(g, w, h, t) { f(g, w, h, t); return false; } }); });
  { const nodes = $$('#pipe .node'); let i = 0; setInterval(() => { nodes.forEach((n, k) => n.classList.toggle('hot', k === i)); i = (i + 1) % nodes.length; }, 1300); }

  /* ---------------- wallet ---------------- */
  const PROV = {
    phantom: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : ((window.solana && window.solana.isPhantom) ? window.solana : null),
    solflare: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null,
    backpack: () => (window.backpack && window.backpack.isBackpack) ? window.backpack : null,
  };
  const mobile = /iphone|ipad|android/i.test(navigator.userAgent);
  function modal(html, onBuild) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(m); if (lenis) lenis.stop();
    const close = () => { m.remove(); if (lenis && !$('.drawer.on')) lenis.start(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', k);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) close(); });
    if (onBuild) onBuild(m, close); return close;
  }
  // in-page confirm / input (no native dialogs)
  function ask({ title, text, input, ok = 'Confirm', danger }) {
    return new Promise(res => {
      let done = false; const fin = v => { if (!done) { done = true; res(v); } };
      const close = modal(`<h3>${esc(title)}</h3><p>${text}</p>${input ? `<input class="askin" inputmode="decimal" value="${esc(input)}" style="margin-bottom:14px">` : ''}<div class="askb"><button class="btn" type="button" data-x>Cancel</button><button class="btn pri${danger ? ' danger' : ''}" type="button" data-ok>${esc(ok)}</button></div>`, (m, cl) => {
        const go = () => { fin(input ? $('.askin', m).value : true); cl(); };
        $('[data-ok]', m).onclick = go; const i = $('.askin', m); if (i) { setTimeout(() => { i.focus(); i.select(); }, 50); i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
        new MutationObserver((_, o) => { if (!m.isConnected) { o.disconnect(); fin(null); } }).observe(document.body, { childList: true });
      });
    });
  }
  function walletModal(then) {
    const here = encodeURIComponent(location.href);
    modal(`<h3>Connect</h3><p>Sign in with one free signature. It is not a transaction and cannot move anything.</p><div class="wl">${['phantom', 'solflare', 'backpack'].map(k => `<button class="btn" type="button" data-pv="${k}"><span>${k[0].toUpperCase() + k.slice(1)}</span><small class="mono${PROV[k]() ? ' ok' : ''}">${PROV[k]() ? 'DETECTED' : mobile ? 'OPEN APP' : 'INSTALL'}</small></button>`).join('')}</div><p class="err" data-err></p>`, (m, close) => {
      m.addEventListener('click', async e => {
        const b = e.target.closest('[data-pv]'); if (!b) return; const k = b.dataset.pv, p = PROV[k]();
        if (!p) { if (k === 'phantom') return mobile ? location.href = `https://phantom.app/ul/browse/${here}?ref=${encodeURIComponent(location.origin)}` : open('https://phantom.com/download', '_blank', 'noopener'); if (k === 'solflare') return mobile ? location.href = `https://solflare.com/ul/v1/browse/${here}` : open('https://solflare.com/download', '_blank', 'noopener'); return open('https://backpack.app/download', '_blank', 'noopener'); }
        const err = $('[data-err]', m); err.textContent = ''; b.disabled = true; b.querySelector('small').textContent = 'CHECK WALLET';
        try { await connect(p); close(); if (then) setTimeout(then, 150); }
        catch (x) { err.textContent = errMsg(x); b.disabled = false; b.querySelector('small').textContent = 'DETECTED'; }
      });
    });
  }
  const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = ALPH[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = '1' + s; else break; } return s; }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  async function connect(p) {
    const r = await p.connect(); const k = (r && r.publicKey) || p.publicKey; const wallet = k.toString();
    if (!S.tok || S.wallet !== wallet) {
      const n = await api('nonce?wallet=' + wallet), bytes = new TextEncoder().encode(n.message);
      const o = await p.signMessage(bytes, 'utf8'), sig = o.signature || o;
      const j = await api('login', { wallet, nonce: n.nonce, sig: b58(new Uint8Array(sig)), msg: b64(bytes) });
      S.tok = j.token; store.set('tm:tok', S.tok);
    }
    S.wallet = wallet; S.prov = p; store.set('tm:w', wallet); renderMe(); toast('Connected ' + short(wallet));
    loadTeams(); if (S.drawer) openTeam(S.drawer);
  }
  async function disconnect() { try { S.prov && S.prov.disconnect && await S.prov.disconnect(); } catch (e) { } S.wallet = S.tok = S.prov = null; store.set('tm:w', ''); store.set('tm:tok', ''); renderMe(); loadTeams(); }
  function renderMe() { const on = !!(S.wallet && S.tok); $('#wBtn').classList.toggle('on', on); $('#wLabel').textContent = on ? short(S.wallet) : 'Connect'; }
  $('#wBtn').addEventListener('click', () => S.wallet && S.tok ? modal(`<h3>${esc(short(S.wallet))}</h3><p>Signed in. Your teams and their controls use this wallet.</p><div class="wl"><button class="btn" data-x type="button" data-out>Disconnect</button></div>`, (m, close) => { $('[data-out]', m).onclick = () => { disconnect(); close(); }; }) : walletModal());
  async function needWallet(then) {
    if (S.tok && S.wallet) {
      if (!S.prov) { for (const k of ['phantom', 'solflare', 'backpack']) { const p = PROV[k](); if (p) { try { const r = await p.connect({ onlyIfTrusted: true }); const pk = ((r && r.publicKey) || p.publicKey); if (pk && pk.toString() === S.wallet) { S.prov = p; break; } } catch (e) { } } } }
      if (S.prov) return then();
    }
    walletModal(then);
  }
  const W3 = () => window.solanaWeb3;
  async function rpc(method, params) { return (await api('rpc', { method, params })).result; }
  async function sendRaw(tx) { return rpc('sendTransaction', [b64(tx.serialize()), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]); }
  async function signSend(tx) {
    if (!S.prov) throw new Error('Connect a wallet first.');
    if (!S.prov.signAndSendTransaction) { const signed = await S.prov.signTransaction(tx); return sendRaw(signed); }
    try { const r = await S.prov.signAndSendTransaction(tx); return typeof r === 'string' ? r : r.signature; }
    catch (e) { if (/not.*(support|implemented)/i.test(e.message || '')) { const signed = await S.prov.signTransaction(tx); return sendRaw(signed); } throw e; }
  }
  async function confirmSig(sig, secs = 75) {
    for (let i = 0; i < secs / 1.5; i++) {
      await sleep(1500);
      try { const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]); const s = r.value[0]; if (s) { if (s.err) throw new Error('The transaction failed on chain.'); if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return true; } } catch (e) { if (/failed on chain/.test(e.message)) throw e; }
    }
    return false;
  }
  async function sendSol(to, amt) {
    const w = W3(), bh = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
    const tx = new w.Transaction({ feePayer: new w.PublicKey(S.wallet), recentBlockhash: bh }).add(w.SystemProgram.transfer({ fromPubkey: new w.PublicKey(S.wallet), toPubkey: new w.PublicKey(to), lamports: Math.round(amt * 1e9) }));
    const sig = await signSend(tx); const ok = await confirmSig(sig); return { sig, ok };
  }
  document.addEventListener('click', async e => { const c = e.target.closest('[data-copy]'); if (c) { e.stopPropagation(); try { await navigator.clipboard.writeText(c.dataset.copy); toast('Copied'); } catch (x) { } } });

  /* ---------------- the scanner: every pump.fun runner and the betas riding it, every minute ---------------- */
  const SC = { d: null, board: 'all', sort: 'ready', q: '', only: true, open: new Set(), sel: new Map(), loading: false, wait: 0, first: true };
  const STATE = { behind: ['behind', 'buy'], ahead: ['ahead', 'trim'], step: ['in step', ''] };
  async function loadScan() {
    if (SC.loading) return; SC.loading = true;
    try {
      const d = await api('scan'); const same = SC.d && d.n === SC.d.n; SC.d = d;
      if (same) SC.wait = Date.now() + 5000; else { renderScan(); renderRadar(); if (!SC.first) say(`Scan ${d.n}: ${d.totals.mains} mains, ${d.totals.tradeable} tradeable betas`); SC.first = false; }
    } catch (e) { SC.wait = Date.now() + 10000; if (!SC.d) $('#scBoard').innerHTML = `<div class="empty">${esc(e.message)} Retrying…</div>`; }
    SC.loading = false;
  }
  const selOf = m => { if (!SC.sel.has(m.mint)) SC.sel.set(m.mint, new Set(m.pick || [])); return SC.sel.get(m.mint); };
  function gapStrip(m) {
    const pts = m.betas.filter(b => b.tradeable && b.g1h != null), band = SC.d.band, X = g => (50 + Math.max(-40, Math.min(40, g)) / 40 * 50).toFixed(2);
    const dots = pts.map(b => `<i class="gd ${b.state || ''}" style="left:${X(b.g1h)}%" title="$${esc(b.symbol)} ${pct(b.g1h)} vs the main, last hour"></i>`).join('');
    return `<div class="gs"><div class="gband" style="left:${X(-band)}%;right:${(100 - X(band)).toFixed(2)}%"></div><div class="gmid"></div>${dots}<span class="gl mono">behind</span><span class="gr mono">ahead</span></div>
      <div class="gsum mono">${pts.length ? `<b class="up">${m.behind}</b> behind · <b>${m.step}</b> in step · <b class="dn">${m.ahead}</b> ahead` : m.n ? 'no tradeable betas yet' : 'no betas yet'}</div>`;
  }
  function betaRow(m, b, sel) {
    const on = sel.has(b.mint), st = STATE[b.state], g = b.g1h, w = g == null ? 0 : Math.min(50, Math.abs(g) / 40 * 50);
    const chips = [b.copy ? '<span class="chip">same ticker</span>' : '', b.src.length === 1 && b.src[0] === 'solana' ? '<span class="chip w">fresh · on chain</span>' : '', b.isNew ? '<span class="chip nw">new this scan</span>' : ''].join('');
    return `<div class="bt-r${on ? ' on' : ''}${b.tradeable ? '' : ' thin'}" data-b="${esc(b.mint)}" title="${b.tradeable ? 'Tap to pick' : `Under ${usd(SC.d.minLiq)} of liquidity: the maker can't trade it`}">
      <span class="ck"></span>${av(b, '')}<div class="nm"><b>$${esc(b.symbol)}</b><span>${esc(b.name)}</span>${chips ? `<div class="chips">${chips}</div>` : ''}</div>
      <span class="c-mc num">${b.mc ? usd(b.mc) : '—'}</span><span class="c-lq">${b.liq ? usd(b.liq) : '—'}</span><span class="c-1h">${pctc(b.ch1h)}</span>
      <span class="c-gap"><span class="gb"><i class="${b.state || 'step'}" style="${g == null ? 'width:0' : g < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></span><b>${g == null ? '—' : pct(g)}</b></span>
      <span class="c-st">${st ? `<span class="stc ${b.state}">${st[0]}${st[1] && b.tradeable ? ` · ${st[1]}` : ''}</span>` : '<span class="dim">—</span>'}</span>
      <span class="c-age">${b.after != null && b.after >= 0 ? mins(b.after) + ' after' : b.age != null ? mins(b.age) + ' ago' : '—'}</span></div>`;
  }
  function scanRow(m, i) {
    const open = SC.open.has(m.mint), sel = selOf(m);
    const stack = m.betas.slice(0, 6).map(b => av(b, 'sm')).join('') + (m.n > 6 ? `<span class="more mono">+${m.n - 6}</span>` : '');
    const boards = (m.boards || []).map(b => ({ trending: 'trending', traded: 'traded', organic: 'organic', hot: 'hot 5m' }[b])).join(' · ');
    return `<article class="srw${open ? ' open' : ''}${m.isNew ? ' new' : ''}" data-m="${esc(m.mint)}" style="animation-delay:${Math.min(i, 12) * 40}ms">
      <div class="srw-top" data-act="open">
        <span class="rk mono">${String(i + 1).padStart(2, '0')}</span>
        <div class="sr-main">${av(m, 'lg')}<div class="nm"><b>$${esc(m.symbol)}${m.isNew ? '<em class="nw mono">new</em>' : ''}</b><span>${esc(m.name)} · ${ago(m.created)} · ${esc(boards)}</span>
          <div class="ms mono"><span>mcap <b>${usd(m.mc)}</b></span><span>1h ${pctc(m.ch1h)}</span><span>24h ${pctc(m.ch24, 0)}</span><span>vol 1h <b>${usd(m.vol1h)}</b></span></div></div></div>
        <div class="sr-crowd"><div class="stack">${stack || ''}</div><span class="mono"><b>${m.n}</b> beta${m.n === 1 ? '' : 's'} · <b>${m.tradeable}</b> tradeable${m.fresh ? ` · <b>${m.fresh}</b> new in 6h` : ''}</span></div>
        <div class="sr-gap">${gapStrip(m)}</div>
        <div class="sr-act"><button class="btn sm pri" type="button" data-act="team"${m.tradeable ? '' : ' disabled'}><span class="lg2">Team them</span><span class="sm2">Team</span></button><button class="chev" type="button" data-act="open" aria-label="Show betas" aria-expanded="${open}"></button></div>
      </div>
      <div class="srw-d"><div class="srw-in">
        ${m.betas.length ? `<div class="bt"><div class="bt-h mono"><span></span><span></span><span>beta</span><span>mcap</span><span>liquidity</span><span>1h</span><span>gap to $${esc(m.symbol)} · 1h</span><span>right now</span><span>launched</span></div>${m.betas.map(b => betaRow(m, b, sel)).join('')}</div>` : `<div class="empty">No betas riding $${esc(m.symbol)} yet. New pump.fun launches carrying its name show up here within a minute.</div>`}
        <div class="sr-foot"><span class="mono" data-cnt>${sel.size} of ${S.cfg.maxBetas} picked</span><div class="lks">${links(m.mint)}</div><button class="btn sm" type="button" data-act="deep">Deep scan · follow on candles</button><button class="btn sm" type="button" data-act="lab"${sel.size ? '' : ' disabled'}>Watch in the lab</button><button class="btn sm pri" type="button" data-act="team"${sel.size ? '' : ' disabled'}>Team ${sel.size || ''} →</button></div>
      </div></div></article>`;
  }
  function scanList() {
    const d = SC.d, q = SC.q.toLowerCase(); let list = d.mains.filter(m => SC.board === 'all' || (m.boards || []).includes(SC.board));
    if (q) list = list.filter(m => (m.symbol + ' ' + m.name).toLowerCase().includes(q) || m.betas.some(b => (b.symbol + ' ' + b.name).toLowerCase().includes(q)));
    const all = list.length; if (SC.only) list = list.filter(m => m.tradeable > 0);
    const by = { ready: (a, b) => (b.tradeable - a.tradeable) || (b.behind - a.behind) || ((b.vol1h || 0) - (a.vol1h || 0)), behind: (a, b) => (b.behind - a.behind) || (b.tradeable - a.tradeable), ch1h: (a, b) => (b.ch1h ?? -1e9) - (a.ch1h ?? -1e9), fresh: (a, b) => (a.newest ?? 1e9) - (b.newest ?? 1e9), mc: (a, b) => (b.mc || 0) - (a.mc || 0) }[SC.sort];
    return { list: list.slice().sort(by), hidden: all - list.length };
  }
  function renderScan() {
    const d = SC.d; if (!d) return; const { list, hidden } = scanList();
    $('#scBoard').innerHTML = list.length ? list.map(scanRow).join('') : `<div class="empty">${d.mains.length ? (SC.q ? 'Nothing in this scan matches that filter.' : 'None of these mains has a tradeable beta right now.') : 'No pump.fun runners on the boards right now.'}</div>`;
    $('#scNote').innerHTML = (hidden ? `${hidden} main${hidden > 1 ? 's' : ''} with no tradeable beta hidden · <button type="button" class="ul" id="scShow">show them</button> · ` : '') + `tradeable = at least ${usd(d.minLiq)} of liquidity · behind / ahead = more than ${d.band}% off the main's move over the last hour, the default band`;
    const sh = $('#scShow'); if (sh) sh.onclick = () => { $('#scOnly').checked = false; SC.only = false; renderScan(); };
    scanText();
  }
  function scanText() {
    const d = SC.d; if (!d) return; const t = d.totals, s = Math.max(0, Math.round((Date.now() - d.at) / 1000));
    const down = Object.entries(d.src || {}).filter(([, v]) => v.fail && !v.ok).map(([k]) => k);
    $('#scTxt').innerHTML = `<b>scan #${d.n}</b> · ${s < 5 ? 'just now' : s + 's ago'} · <b>${t.mains}</b> pump.fun mains · <b>${t.betas}</b> betas found · <b>${t.tradeable}</b> tradeable · <b class="up">${t.behind}</b> behind their main${t.creates1h != null ? ` · <b>${t.creates1h}</b> launches read from Solana in the last hour` : ''} · took ${(d.took / 1000).toFixed(1)}s${down.length ? ` · <span class="dn">${down.join(', ')} not answering</span>` : ''}`;
  }
  function renderRadar() {
    const top = SC.d.mains.filter(m => m.n).slice(0, 16); if (!top.length) return;
    const items = top.map(m => `<button type="button" data-goscan="${esc(m.mint)}">${av(m, 'sm')}<b>$${esc(m.symbol)}</b>${m.n} betas · ${m.behind} behind ${pctc(m.ch1h)}</button>`).join('');
    $('#radarIn').innerHTML = items + items; $('#radarN').textContent = '#' + SC.d.n; $('#radar').hidden = false;
  }
  setInterval(() => {
    const d = SC.d; if (!d) return;
    const left = Math.max(0, Math.ceil((d.at + d.every * 1000 - Date.now()) / 1000) + 1);
    $('#scNext').textContent = left; $('#scRing').style.strokeDashoffset = (94.25 * (1 - Math.min(1, left / d.every))).toFixed(2);
    const s = Math.round((Date.now() - d.at) / 1000); $('#radarAge').textContent = s < 5 ? 'live' : s + 's ago'; scanText();
    if (left === 0 && !document.hidden && Date.now() > SC.wait) loadScan();
  }, 1000);
  const mainOf = mint => SC.d && SC.d.mains.find(m => m.mint === mint);
  $('#scBoard').addEventListener('click', e => {
    const row = e.target.closest('.srw'); if (!row) return; const m = mainOf(row.dataset.m); if (!m) return;
    if (e.target.closest('a')) return;
    const br = e.target.closest('.bt-r');
    if (br) {
      const b = m.betas.find(x => x.mint === br.dataset.b); if (!b) return; const sel = selOf(m);
      if (!b.tradeable) return toast(`$${b.symbol} has under ${usd(SC.d.minLiq)} of liquidity. The maker can't trade it.`);
      if (sel.has(b.mint)) sel.delete(b.mint); else { if (sel.size >= S.cfg.maxBetas) return toast(`Up to ${S.cfg.maxBetas} betas per team.`); sel.add(b.mint); }
      br.classList.toggle('on', sel.has(b.mint)); $('[data-cnt]', row).textContent = `${sel.size} of ${S.cfg.maxBetas} picked`;
      $$('.sr-foot [data-act="team"], .sr-foot [data-act="lab"]', row).forEach(x => x.disabled = !sel.size); $('.sr-foot [data-act="team"]', row).textContent = `Team ${sel.size || ''} →`;
      return;
    }
    const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
    if (act === 'open') { if (e.target.closest('button:not(.chev)')) return; const op = !SC.open.has(m.mint); op ? SC.open.add(m.mint) : SC.open.delete(m.mint); row.classList.toggle('open', op); const ch = $('.chev', row); if (ch) ch.setAttribute('aria-expanded', op); return; }
    const sel = selOf(m), betas = m.betas.filter(b => sel.has(b.mint));
    if (act === 'team') { if (!betas.length) { SC.open.add(m.mint); row.classList.add('open'); return toast('Pick at least one tradeable beta.'); } setTeam(m, betas); goTo('pair'); toast(`$${m.symbol} with ${betas.length} beta${betas.length > 1 ? 's' : ''} is ready to pair.`); }
    if (act === 'lab') { if (betas.length) { loadLab(m, betas); goTo('lab'); } }
    if (act === 'deep') { findBetas(m.mint); goTo('betas'); }
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-goscan]'); if (!b) return; e.preventDefault(); const mint = b.dataset.goscan; SC.open.add(mint); if (SC.only && mainOf(mint) && !mainOf(mint).tradeable) { SC.only = false; $('#scOnly').checked = false; } renderScan(); const row = $(`.srw[data-m="${mint}"]`); goTo(row || 'scan', 90); });
  $('#scBoards').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (!b) return; $$('#scBoards button').forEach(x => x.classList.toggle('on', x === b)); SC.board = b.dataset.b; renderScan(); });
  $('#scSort').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; $$('#scSort button').forEach(x => x.classList.toggle('on', x === b)); SC.sort = b.dataset.s; renderScan(); });
  $('#scOnly').addEventListener('change', e => { SC.only = e.target.checked; renderScan(); });
  let scT = 0; $('#scQ').addEventListener('input', e => { clearTimeout(scT); scT = setTimeout(() => { SC.q = e.target.value.trim(); renderScan(); }, 120); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-find]'); if (!b) return; e.preventDefault(); findBetas(b.dataset.find); goTo('betas'); });

  /* ---------------- betas: who's riding the main ---------------- */
  const BS = { data: null, picks: [] };
  async function findBetas(q) {
    q = String(q || '').trim(); if (!q) return;
    $('#bQ').value = B58.test(q) ? q : q.replace(/^\$/, '');
    $('#bOut').innerHTML = `<div class="empty">Searching Jupiter, Dexscreener and the chain for coins riding ${esc(B58.test(q) ? short(q) : '$' + q.replace(/^\$/, '').toUpperCase())}…</div>`;
    BS.picks = []; renderPick();
    try { const d = await api('betas?q=' + encodeURIComponent(q)); BS.data = d; renderBetas(); }
    catch (e) { $('#bOut').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }
  function renderBetas() {
    const d = BS.data, m = d.main;
    const head = `<div class="bmain">${av(m, 'lg')}<div><h3>$${esc(m.symbol)} <span class="dim" style="font:500 14px M">${esc(m.name)}</span></h3>
      <div class="m"><span>mcap <b>${usd(m.mc)}</b></span><span>24h <b>${pct(m.chg, 0)}</b></span><span>liq <b>${usd(m.liq)}</b></span>${m.created ? `<span>launched <b>${ago(m.created)}</b></span>` : ''}</div>
      <div class="keys">searching for ${d.keys.map(k => `<em>${esc(k)}</em>`).join('')}</div></div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end"><div style="display:flex;gap:10px">${links(m.mint)}</div><button class="btn sm" type="button" data-copy="${esc(m.mint)}">Copy CA</button></div></div>`;
    if (!d.list.length) { $('#bOut').innerHTML = head + `<div class="empty">No betas found for $${esc(m.symbol)} yet. When someone launches one on pump.fun, it shows up here within a minute.</div>`; return; }
    const rows = d.list.map((c, i) => {
      const thin = (c.liq || 0) < S.cfg.minLiq, f = c.follow;
      const fol = f != null ? `<div class="fol"><div class="fb"><i style="width:${Math.max(3, Math.min(100, Math.max(0, f) * 100)).toFixed(0)}%"></i></div><b>${Math.round(f * 100)}%</b></div>` : `<span class="dim">${thin ? 'too thin' : 'not measured'}</span>`;
      const chips = [c.copy ? '<span class="chip">same ticker</span>' : '', c.src.includes('solana') ? '<span class="chip w">fresh · on chain</span>' : '', c.bonded ? '<span class="chip">bonded</span>' : ''].join('');
      return `<div class="brow${thin ? ' thin' : ''}" data-b="${esc(c.mint)}" style="animation-delay:${Math.min(i, 14) * 30}ms" title="${thin ? 'Under $' + S.cfg.minLiq + ' liquidity: the maker can\'t trade it' : 'Tap to pick'}">
        <span class="ck"></span>${av(c, '')}<div class="nm"><b>$${esc(c.symbol)}</b><span>${esc(c.name)}</span><div class="chips">${chips}</div></div>
        <span class="c4 num">${usd(c.mc)}</span><span class="c5">${usd(c.liq)}</span><span class="c6">${pctc(c.rel24, 0)}</span><span class="c7">${fol}</span><span class="c8">${c.after != null ? mins(c.after) + (c.after >= 0 ? ' after' : '') : ago(c.created)}</span></div>`;
    }).join('');
    $('#bOut').innerHTML = head + `<div class="blist"><div class="bhead"><span></span><span></span><span>beta</span><span>mcap</span><span>liquidity</span><span>24h vs main</span><span>follow</span><span>launched</span></div>${rows}</div>
      <p class="bnote">${d.list.length} betas · ${d.chain ? d.chain + ' found only on chain · ' : ''}follow = how closely a beta's 15-minute moves match the main's · 24h vs main = the beta's day minus the main's · tap rows to pick up to ${S.cfg.maxBetas}</p>`;
  }
  function renderPick() {
    const bar = $('#pickBar'); if (!BS.picks.length) { bar.hidden = true; $$('.brow').forEach(r => r.classList.remove('on')); return; }
    bar.hidden = false; $('#pickTxt').textContent = `${BS.picks.length} of ${S.cfg.maxBetas} picked · main $${BS.data.main.symbol}`;
    $('#pickChips').innerHTML = BS.picks.map(c => `<span class="chip">$${esc(c.symbol)}</span>`).join('');
    $$('.brow').forEach(r => r.classList.toggle('on', BS.picks.some(p => p.mint === r.dataset.b)));
  }
  $('#bOut').addEventListener('click', e => {
    const r = e.target.closest('.brow'); if (!r || e.target.closest('a,button')) return;
    const c = BS.data.list.find(x => x.mint === r.dataset.b); if (!c) return;
    if ((c.liq || 0) < S.cfg.minLiq) return toast(`$${c.symbol} has under $${S.cfg.minLiq} of liquidity. The maker can't trade it.`);
    const i = BS.picks.findIndex(p => p.mint === c.mint);
    if (i >= 0) BS.picks.splice(i, 1); else { if (BS.picks.length >= S.cfg.maxBetas) return toast(`Up to ${S.cfg.maxBetas} betas per team.`); BS.picks.push(c); }
    renderPick();
  });
  $('#bFind').addEventListener('submit', e => { e.preventDefault(); findBetas($('#bQ').value); });
  if (innerWidth < 520) { $('#heroQ').placeholder = 'ticker or contract address'; $('#bQ').placeholder = 'ticker or contract address'; }
  $('#heroFind').addEventListener('submit', e => { e.preventDefault(); const v = $('#heroQ').value.trim(); if (!v) return $('#heroQ').focus(); if (hero && hero.pulse) hero.pulse(); findBetas(v); goTo('betas'); });
  $('#pickLab').onclick = () => { if (!BS.picks.length) return; loadLab(BS.data.main, BS.picks); goTo('lab'); };
  $('#pickPair').onclick = () => { if (!BS.picks.length) return; setTeam(BS.data.main, BS.picks); goTo('pair'); };

  // fresh betas: brand-new launches riding today's mains, read from the chain
  const FS = { seen: new Set(), at: 0 };
  async function loadFresh() {
    try {
      const d = await api('fresh'); FS.at = d.at;
      if (!d.feed.length) { $('#fList').innerHTML = `<div class="empty" style="grid-column:1/-1">No new betas in the last few hours. ${d.stats && d.stats.h1 != null ? `${d.stats.h1} launches read from Solana in the last hour.` : ''}</div>`; return; }
      const first = !FS.seen.size;
      $('#fList').innerHTML = d.feed.map(r => `<div class="frow${!first && !FS.seen.has(r.mint) ? ' new' : ''}">${av(r, 'sm')}<div class="nm"><b>$${esc(r.symbol)}</b><span>${esc(r.name)} · ${ago(r.t)}${r.mc ? ' · ' + usd(r.mc) : ''}</span></div><span class="to"><span class="rd">riding</span> ${av(r.main, 'sm')}$${esc(r.main.symbol)}</span><button class="btn sm" type="button" data-find="${esc(r.main.mint)}">Team</button></div>`).join('');
      d.feed.forEach(r => FS.seen.add(r.mint));
    } catch (e) { if (!FS.at) $('#fList').innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
  }
  setInterval(() => { if (FS.at) { const s = Math.round((Date.now() - FS.at) / 1000); $('#fAge').textContent = s < 5 ? 'read just now' : `read ${s}s ago`; } }, 1000);

  /* ---------------- the lab ---------------- */
  const L = { rows: null, main: null, betas: [], tf: '15m', follow: [], anim: 1, hover: null };
  const SHADES = ['#bdbdbd', '#8f8f8f', '#d9d9d9', '#6f6f6f', '#a6a6a6'], DASH = [[], [5, 3], [], [2, 3], [7, 2, 2, 2]];
  function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w: r.width, h: r.height }; }
  const labRules = () => ({ band: +$('#sBand').value, buy: +$('#sBuy').value, trim: +$('#sTrim').value });
  function replay(rows, s, nb) {
    if (!rows || rows.length < 3) return null;
    const m0 = rows[0][1], b0 = rows[0].slice(2), band = s.band / 100, fee = .005;
    let cash = 100; const bags = new Array(nb).fill(0), lad = new Array(nb).fill(0), marks = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], pm = r[1]; let n = 0;
      const order = [...Array(nb).keys()].sort((a, b) => Math.abs(Math.log((r[2 + b] / b0[b]) / (pm / m0))) - Math.abs(Math.log((r[2 + a] / b0[a]) / (pm / m0))));
      for (const k of order) {
        const pb = r[2 + k], gap = Math.log((pb / b0[k]) / (pm / m0)), level = Math.floor(Math.abs(gap) / band), sg = gap < 0 ? -1 : 1;
        let l = lad[k]; if (l && Math.sign(l) !== sg) l = 0; l = Math.abs(l);
        if (level === 0) { lad[k] = 0; continue; }
        if (level < l - 1) { lad[k] = sg * (level + 1); continue; }
        if (level <= l || n >= 2) { lad[k] = sg * l; continue; }
        if (gap < 0) { const spend = cash * s.buy / 100; if (spend > .01) { cash -= spend; bags[k] += spend * (1 - fee) / pb; marks.push({ i, k, side: 'buy' }); n++; } }
        else if (s.trim > 0 && bags[k] > 0) { const q = bags[k] * s.trim / 100; bags[k] -= q; cash += q * pb * (1 - fee); marks.push({ i, k, side: 'sell' }); n++; }
        lad[k] = sg * level;
      }
    }
    const last = rows[rows.length - 1]; let value = cash; for (let k = 0; k < nb; k++) value += bags[k] * last[2 + k];
    let hold = 0; for (let k = 0; k < nb; k++) hold += (last[2 + k] / b0[k] - 1) * 100; hold /= nb;
    return { trades: marks.length, marks, value: value - 100, hold };
  }
  function drawLab() {
    const rows = L.rows; if (!rows) return;
    const nb = L.betas.length, s = labRules(), rep = replay(rows, s, nb), upto = Math.max(2, Math.round(L.anim * (rows.length - 1)));
    // top: the main and every beta, rebased to 100
    { const { x, w, h } = fit($('#cMain')); x.clearRect(0, 0, w, h);
      const base = rows[0].slice(1), series = [...Array(nb + 1).keys()].map(k => rows.map(r => r[1 + k] / base[k] * 100));
      let lo = Infinity, hi = -Infinity; series.forEach(sr => sr.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); })); const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
      const X = i => 8 + i / (rows.length - 1) * (w - 52), Y = v => 10 + (1 - (v - lo) / (hi - lo)) * (h - 24);
      x.strokeStyle = '#1c1c1c'; x.lineWidth = 1; x.font = '500 10px M, monospace'; x.fillStyle = '#5a5a5a'; x.textAlign = 'left';
      for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); x.beginPath(); x.moveTo(8, y); x.lineTo(w - 44, y); x.stroke(); x.fillText(Math.round(v), w - 40, y + 3); }
      x.setLineDash([3, 4]); x.strokeStyle = '#333'; x.beginPath(); x.moveTo(8, Y(100)); x.lineTo(w - 44, Y(100)); x.stroke(); x.setLineDash([]);
      for (let k = nb; k >= 0; k--) {
        const sr = series[k], main = k === 0; x.beginPath(); for (let i = 0; i <= upto; i++) { const px = X(i), py = Y(sr[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.lineWidth = main ? 2.4 : 1.3; x.strokeStyle = main ? '#fff' : SHADES[(k - 1) % 5]; x.setLineDash(main ? [] : DASH[(k - 1) % 5]); if (main) { x.shadowColor = 'rgba(255,255,255,.5)'; x.shadowBlur = 10; } x.stroke(); x.shadowBlur = 0; x.setLineDash([]);
      }
      if (rep) for (const mk of rep.marks) { if (mk.i > upto) continue; const px = X(mk.i), py = Y(series[mk.k + 1][mk.i]); x.fillStyle = mk.side === 'buy' ? '#8dffad' : '#ff8a8a'; x.beginPath(); if (mk.side === 'buy') { x.moveTo(px, py + 4); x.lineTo(px - 4, py + 10); x.lineTo(px + 4, py + 10); } else { x.moveTo(px, py - 4); x.lineTo(px - 4, py - 10); x.lineTo(px + 4, py - 10); } x.fill(); }
      if (L.hover != null) { const px = X(L.hover); x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(px, 6); x.lineTo(px, h - 6); x.stroke(); }
      L.X = X; L.series = series; }
    // bottom: every beta's gap to the main, with the band
    { const { x, w, h } = fit($('#cGap')); x.clearRect(0, 0, w, h);
      const m0 = rows[0][1], gaps = L.betas.map((_, k) => rows.map(r => Math.log((r[2 + k] / rows[0][2 + k]) / (r[1] / m0)) * 100));
      let mx = s.band * 1.4; gaps.forEach(g => g.forEach(v => { mx = Math.max(mx, Math.abs(v)); }));
      const X = i => 8 + i / (rows.length - 1) * (w - 52), Y = v => h / 2 - v / mx * (h / 2 - 10);
      x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(8, Y(s.band), w - 52, Y(-s.band) - Y(s.band));
      x.strokeStyle = '#3a3a3a'; x.setLineDash([4, 4]); [s.band, -s.band].forEach(v => { x.beginPath(); x.moveTo(8, Y(v)); x.lineTo(w - 44, Y(v)); x.stroke(); }); x.setLineDash([]);
      x.strokeStyle = '#555'; x.beginPath(); x.moveTo(8, Y(0)); x.lineTo(w - 44, Y(0)); x.stroke();
      x.font = '500 10px M, monospace'; x.fillStyle = '#5a5a5a'; x.fillText('+' + s.band + '%', w - 40, Y(s.band) + 3); x.fillText('−' + s.band + '%', w - 40, Y(-s.band) + 3); x.fillText('GAP TO THE MAIN', 10, 12);
      gaps.forEach((g, k) => { x.beginPath(); for (let i = 0; i <= upto; i++) { const px = X(i), py = Y(g[i]); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.lineWidth = 1.2; x.strokeStyle = SHADES[k % 5]; x.setLineDash(DASH[k % 5]); x.stroke(); x.setLineDash([]); });
      if (L.hover != null) { const px = X(L.hover); x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(px, 4); x.lineTo(px, h - 4); x.stroke(); }
      L.gaps = gaps; }
    if (rep) { $('#rTrades').textContent = rep.trades; $('#rValue').innerHTML = pctc(rep.value); $('#rHold').innerHTML = pctc(rep.hold); }
    rulesPreview(rep);
  }
  function labHover(e) {
    if (!L.rows || !L.X) return; const c = e.currentTarget, r = c.getBoundingClientRect(), x = e.clientX - r.left;
    const n = L.rows.length, i = Math.max(0, Math.min(n - 1, Math.round((x - 8) / (r.width - 52) * (n - 1)))); L.hover = i; drawLab();
    const row = L.rows[i], d = new Date(row[0] * 1000), xh = $('#xh');
    xh.innerHTML = `<b>${d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</b><br>$${esc(L.main.symbol)} <b>${pct(L.series[0][i] - 100)}</b>` + L.betas.map((b, k) => `<br>$${esc(b.symbol)} ${pct(L.series[k + 1][i] - 100)} · gap ${pct(L.gaps[k][i])}`).join('');
    xh.hidden = false; xh.style.left = Math.min(r.width - xh.offsetWidth - 8, Math.max(8, x + 14)) + 'px';
  }
  ['#cMain', '#cGap'].forEach(id => { $(id).addEventListener('pointermove', labHover); $(id).addEventListener('pointerleave', () => { L.hover = null; $('#xh').hidden = true; drawLab(); }); });
  async function loadLab(main, betas, tf) {
    if (tf) L.tf = tf;
    L.main = main; L.betas = betas; const em = $('#labEmpty'); em.hidden = false; em.innerHTML = '<span>Reading real candles for the main and its betas…</span>';
    $('#labChips').innerHTML = `<span class="c">${av(main, 'sm')}$${esc(main.symbol)}</span>` + betas.map((b, k) => `<span class="c"><i class="sw" style="background:${SHADES[k % 5]}"></i>$${esc(b.symbol)}</span>`).join('');
    try {
      const d = await api(`lab?main=${main.mint}&betas=${betas.map(b => b.mint).join(',')}&tf=${L.tf}`);
      L.rows = d.rows; L.main = d.main; L.betas = d.betas; L.follow = d.follow;
      $('#labChips').innerHTML = `<span class="c">${av(d.main, 'sm')}$${esc(d.main.symbol)}</span>` + d.betas.map((b, k) => `<span class="c"><i class="sw" style="background:${SHADES[k % 5]}"></i>$${esc(b.symbol)}</span>`).join('');
      $('#legend').innerHTML = `<span><i style="background:#fff;height:3px"></i>$${esc(d.main.symbol)} (main)</span>` + d.betas.map((b, k) => `<span><i style="background:${SHADES[k % 5]}"></i>$${esc(b.symbol)}</span>`).join('') + '<span><i style="background:#8dffad;width:8px;height:8px;border-radius:2px"></i>replay buy</span><span><i style="background:#ff8a8a;width:8px;height:8px;border-radius:2px"></i>replay trim</span>';
      $('#follow').innerHTML = d.betas.map((b, k) => { const f = d.follow[k]; return `<div class="fr"><span>$${esc(b.symbol)}</span><div class="fol"><div class="fb"><i style="width:${f != null ? Math.max(3, Math.max(0, f) * 100).toFixed(0) : 0}%"></i></div></div><b>${f != null ? Math.round(f * 100) + '%' : '—'}</b></div>`; }).join('');
      em.hidden = true; $('#labPair').disabled = false;
      L.anim = reduce ? 1 : 0; const t0 = performance.now(); const f = now => { L.anim = Math.min(1, (now - t0) / 1300); drawLab(); if (L.anim < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
      say(`Lab loaded: $${d.main.symbol} with ${d.betas.length} betas`);
    } catch (e) { em.innerHTML = `<span><b>Couldn't load this team.</b><br>${esc(e.message)}</span>`; }
  }
  $('#tfTabs').addEventListener('click', e => { const b = e.target.closest('[data-tf]'); if (!b) return; $$('#tfTabs button').forEach(x => x.classList.toggle('on', x === b)); L.tf = b.dataset.tf; if (L.main && L.betas.length) loadLab(L.main, L.betas); });
  function fillRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  [['sBand', 'vBand', v => v + '%', 'rBand'], ['sBuy', 'vBuy', v => v + '%', 'rBuy'], ['sTrim', 'vTrim', v => v + '%', 'rTrim']].forEach(([s, v, f, twin]) => {
    const el = $('#' + s); const upd = () => { $('#' + v).textContent = f(+el.value); fillRange(el); }; el.addEventListener('input', () => { upd(); const t = $('#' + twin); t.value = el.value; t.dispatchEvent(new Event('input')); drawLab(); }); upd();
  });
  $('#labDemo').onclick = async () => {
    const em = $('#labEmpty'); em.innerHTML = '<span>Finding today\'s top runner and its betas…</span>';
    try {
      const sm = SC.d && SC.d.mains.find(m => m.tradeable >= 1); if (sm) return loadLab(sm, sm.betas.filter(b => b.tradeable).slice(0, 3));
      const ms = (await api('mains?tab=trending')).list; if (!ms.length) throw new Error('No runners on the board right now.');
      for (const m of ms.slice(0, 4)) {
        const d = await api('betas?q=' + m.mint); const picks = d.list.filter(c => (c.liq || 0) >= S.cfg.minLiq).sort((a, b) => (b.follow ?? -1) - (a.follow ?? -1)).slice(0, 3);
        if (picks.length) { BS.data = d; return loadLab(d.main, picks); }
      }
      throw new Error('None of today\'s top runners has tradeable betas yet.');
    } catch (e) { em.innerHTML = `<span>${esc(e.message)}</span>`; }
  };
  $('#labPair').onclick = () => { if (!L.main) return; setTeam(L.main, L.betas); goTo('pair'); };
  addEventListener('resize', () => { if (L.rows) drawLab(); });

  /* ---------------- pair: build the team, set the rules, fund the maker ---------------- */
  const P = { main: null, betas: [] };
  function setTeam(main, betas) {
    P.main = main; P.betas = betas.slice(0, S.cfg.maxBetas).map(b => ({ mint: b.mint, symbol: b.symbol, name: b.name, image: b.image, liq: b.liq, mc: b.mc }));
    $('#tMain').value = main.mint; renderTeam(); step(1);
  }
  function renderTeam() {
    $('#tMainC').innerHTML = P.main ? `<div class="tc">${av(P.main, '')}<div class="nm"><b>$${esc(P.main.symbol)}</b><span>${usd(P.main.mc)} mcap · the signal, never traded</span></div></div>` : '';
    $('#tBetas').innerHTML = P.betas.length ? P.betas.map(b => `<div class="tb">${av(b, 'sm')}<div class="nm"><b>$${esc(b.symbol)}</b>${usd(b.mc)} mcap · ${usd(b.liq)} liq</div><button class="x" type="button" data-rm="${esc(b.mint)}" aria-label="Remove">×</button></div>`).join('') : '<div class="dim mono">no betas yet · pick them in Betas or paste one</div>';
    $('#to2').disabled = !(P.main && P.betas.length);
    renderFacts();
  }
  $('#tBetas').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; P.betas = P.betas.filter(x => x.mint !== b.dataset.rm); renderTeam(); });
  let mainTimer = 0;
  $('#tMain').addEventListener('input', () => {
    clearTimeout(mainTimer); const v = $('#tMain').value.trim(); $('#e1').textContent = '';
    if (!B58.test(v)) { P.main = null; renderTeam(); return; }
    if (P.main && P.main.mint === v) return;
    $('#tMainC').innerHTML = '<div class="dim mono">reading…</div>';
    mainTimer = setTimeout(async () => { try { P.main = await api('coin?ca=' + v); P.betas = P.betas.filter(b => b.mint !== v); renderTeam(); } catch (e) { P.main = null; renderTeam(); $('#e1').textContent = e.message; } }, 300);
  });
  async function addBeta() {
    const v = $('#tAdd').value.trim(); $('#e1').textContent = '';
    if (!B58.test(v)) return $('#e1').textContent = 'Paste a beta contract address.';
    if (P.main && v === P.main.mint) return $('#e1').textContent = 'That one is the main.';
    if (P.betas.some(b => b.mint === v)) return $('#e1').textContent = 'Already on the team.';
    if (P.betas.length >= S.cfg.maxBetas) return $('#e1').textContent = `Up to ${S.cfg.maxBetas} betas per team.`;
    try { const c = await api('coin?ca=' + v); if ((c.liq || 0) < S.cfg.minLiq) throw new Error(`$${c.symbol} has only ${usd(c.liq)} of liquidity. A beta needs ${usd(S.cfg.minLiq)} to be traded.`); P.betas.push(c); $('#tAdd').value = ''; renderTeam(); }
    catch (e) { $('#e1').textContent = e.message; }
  }
  $('#tAddB').onclick = addBeta; $('#tAdd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addBeta(); } });
  function step(k) {
    $$('#steps li').forEach(li => { const n = +li.dataset.k; li.classList.toggle('on', n === k); li.classList.toggle('done', n < k); });
    $$('.console .step').forEach(s => s.hidden = +s.dataset.k !== k);
    if (k === 2 && P.main && P.betas.length && (!L.main || L.main.mint !== P.main.mint || L.betas.map(b => b.mint).join() !== P.betas.map(b => b.mint).join())) loadLab(P.main, P.betas);
    if (k === 3) renderFacts();
  }
  $('#to2').onclick = () => step(2); $('#to3').onclick = () => step(3);
  $$('[data-to]').forEach(b => b.onclick = () => step(+b.dataset.to));
  const RULE = [['rBand', 'xBand', v => v + '%', 'band', 1, 'sBand'], ['rBuy', 'xBuy', v => v + '%', 'buy', 1, 'sBuy'], ['rTrim', 'xTrim', v => v + '%', 'trim', 1, 'sTrim'], ['rCool', 'xCool', v => v + 'm', 'cooldown', 1], ['rMax', 'xMax', v => (v / 100).toFixed(2) + ' SOL', 'maxTrade', .01], ['rImp', 'xImp', v => (v / 10).toFixed(1).replace(/\.0$/, '') + '%', 'impact', .1]];
  RULE.forEach(([r, x, f, , , lab]) => {
    const el = $('#' + r); const upd = () => { $('#' + x).textContent = f(+el.value); fillRange(el); };
    el.addEventListener('input', () => { upd(); if (lab && $('#' + lab).value !== el.value) { $('#' + lab).value = el.value; $('#' + lab).dispatchEvent(new Event('input')); } else rulesPreview(); renderFacts(); }); upd();
  });
  const rules = () => Object.fromEntries(RULE.map(([r, , , k, sc]) => [k, Math.round(+$('#' + r).value * sc * 1000) / 1000]));
  function setRules(s) { RULE.forEach(([r, , , k, sc]) => { const el = $('#' + r); if (s[k] != null) { el.value = Math.round(s[k] / sc); el.dispatchEvent(new Event('input')); } }); }
  function rulesPreview(rep) {
    const el = $('#rPrev'); if (!el) return;
    if (!L.rows || !P.main || L.main.mint !== P.main.mint) { el.textContent = 'Load the team in the lab to see how these rules would have traded.'; return; }
    rep = rep || replay(L.rows, labRules(), L.betas.length); if (!rep) return;
    el.innerHTML = `Over the last ${L.rows.length} candles (${L.tf}), these rules would have made <b>${rep.trades} trades</b> across ${L.betas.length} betas and ended <b>${pct(rep.value)}</b> against plain cash; simply holding the betas did <b>${pct(rep.hold)}</b>. A replay of the past, not a promise.`;
  }
  function renderFacts() {
    const s = rules(), c = S.cfg;
    $('#facts').innerHTML = [
      `<li>A <b>fresh maker wallet</b> is created for this team only. You send it SOL from your own wallet.</li>`,
      `<li>The main <b>$${esc(P.main ? P.main.symbol : '…')}</b> is the signal. The maker only ever trades the ${P.betas.length || '…'} betas.</li>`,
      `<li>A beta <b>${s.band}%</b> behind the main gets bought with <b>${s.buy}%</b> of free SOL (max <b>${s.maxTrade} SOL</b>). A beta ${s.band}% ahead gets <b>${s.trim}%</b> of its bag trimmed.</li>`,
      `<li>At most <b>${c.maxSol} SOL</b> is ever put to work. <b>${c.reserve} SOL</b> stays for fees and rent. Swaps above <b>${s.impact}%</b> price impact are skipped.</li>`,
      `<li><b>Only your wallet</b> can change the rules, pause, or withdraw. Withdraw sells every beta and sends every lamport back to you.</li>`,
      `<li>The server holds the maker's key so it can trade while you sleep. <b>Fund only what you can lose.</b></li>`,
    ].join('');
  }
  $('#presets').addEventListener('click', e => { const b = e.target.closest('[data-amt]'); if (b) $('#fAmt').value = b.dataset.amt; });
  $('#goPair').onclick = () => needWallet(async () => {
    const btn = $('#goPair'), out = $('#pairOut'), err = $('#e3'), amt = +$('#fAmt').value; err.textContent = '';
    if (!(amt >= S.cfg.minFund)) return err.textContent = `Fund it with at least ${S.cfg.minFund} SOL.`;
    if (!P.main || !P.betas.length) return step(1);
    btn.disabled = true;
    try {
      btn.textContent = 'Creating the maker…'; const c = await api('create', { main: P.main.mint, betas: P.betas.map(b => b.mint), settings: rules() });
      out.innerHTML = `<div class="done-card"><b>Maker wallet created</b><div class="addr"><span>${esc(c.treasury)}</span><button class="btn sm" type="button" data-copy="${esc(c.treasury)}">Copy</button></div><span id="pStat">Sending ${amt} SOL…</span></div>`;
      btn.textContent = 'Check your wallet'; const r = await sendSol(c.treasury, amt);
      $('#pStat').textContent = r.ok ? 'Funded. Starting the engine…' : 'Sent. Waiting for the network…';
      let live = null; for (let i = 0; i < 12 && !live; i++) { try { live = await api('funded', { id: c.id }); } catch (e) { if (e.status !== 409) throw e; await sleep(2500); } }
      if (!live) throw new Error('The deposit has not landed yet. Open the team in a minute and press start.');
      if (hero && hero.pulse) hero.pulse(); toast(`Team #${c.id} is live.`, 4000);
      $('#pStat').innerHTML = `Live. <a class="ul" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">deposit ↗</a> · <button type="button" class="ul" data-team="${c.id}">open team #${c.id}</button>`;
      loadTeams(); loadStats();
    } catch (e) { err.textContent = errMsg(e); }
    btn.disabled = false; btn.textContent = 'Create the maker and fund it';
  });

  /* ---------------- teams ---------------- */
  let twView = 'live';
  function spark(c, vals) {
    const { x, w, h } = fit(c); x.clearRect(0, 0, w, h); if (!vals || vals.length < 2) { x.fillStyle = '#3a3a3a'; x.font = '500 10px M, monospace'; x.fillText('waiting for the first passes', 0, h / 2 + 3); return; }
    const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1; x.beginPath();
    vals.forEach((v, i) => { const px = i / (vals.length - 1) * w, py = h - 4 - (v - lo) / r * (h - 8); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = '#fff'; x.lineWidth = 1.4; x.shadowColor = 'rgba(255,255,255,.45)'; x.shadowBlur = 6; x.stroke(); x.shadowBlur = 0;
  }
  async function loadTeams() {
    const g = $('#twGrid');
    if (twView === 'mine' && !S.wallet) { g.innerHTML = '<div class="empty" style="grid-column:1/-1">Connect a wallet to see your teams.</div>'; return; }
    try {
      const d = await api('teams' + (twView === 'mine' ? '?owner=' + S.wallet : ''));
      if (!d.teams.length) { g.innerHTML = `<div class="empty" style="grid-column:1/-1">${twView === 'mine' ? 'You have no teams yet. Pick a main and pair its betas above.' : 'No teams running yet. <b>Be the first:</b> pick a main and pair its betas.'}</div>`; return; }
      g.innerHTML = d.teams.map((t, i) => `<article class="tcard2" data-team="${t.id}" style="animation-delay:${Math.min(i, 9) * 50}ms">
        <div class="troster">${av(t.main, 'lg')}<div class="nm"><b>$${esc(t.main.symbol)}</b><span>team #${t.id} · ${t.betas.length} beta${t.betas.length > 1 ? 's' : ''} · ${esc(t.owner)}</span></div><span class="st ${t.status === 'live' && !t.paused ? 'live' : ''}">${t.paused ? 'paused' : esc(t.status)}</span></div>
        <div class="troster"><div class="bs">${t.betas.map(b => av(b, '')).join('')}</div><span class="dim mono">${t.betas.map(b => '$' + esc(b.symbol)).join(' · ')}</span></div>
        <canvas data-spark="${t.id}"></canvas>
        <div class="tmeta"><span>value <b>${t.last ? usd(t.last.value) : '—'}</b></span><span>trades <b>${t.trades}</b></span><span>${t.lastPass ? 'pass ' + ago(t.lastPass) : 'starting'}</span></div></article>`).join('');
      d.teams.forEach(t => { const c = $(`[data-spark="${t.id}"]`); if (c) spark(c, t.spark); });
    } catch (e) { g.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`; }
  }
  $('#twTabs').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; $$('#twTabs button').forEach(x => x.classList.toggle('on', x === b)); twView = b.dataset.v; loadTeams(); });
  function countUp(el, to, fmt) { const from = parseFloat(el.dataset.v || 0) || 0; el.dataset.v = to; if (reduce) { el.textContent = fmt(to); return; } const t0 = performance.now(); const f = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  async function loadStats() { try { const s = await api('stats'); countUp($('#kLive'), s.live, v => Math.round(v)); countUp($('#kBetas'), s.betas, v => Math.round(v)); countUp($('#kTrades'), s.trades24, v => Math.round(v)); countUp($('#kVol'), s.volume, v => v.toFixed(2)); } catch (e) { } }

  // one team, in the drawer
  const drawer = $('#drawer'), dPanel = $('#dPanel');
  function openDrawer(html) { delete dPanel.dataset.dirty; dPanel.innerHTML = '<button class="dclose" type="button" data-close aria-label="Close">×</button>' + html; drawer.classList.add('on'); drawer.setAttribute('aria-hidden', 'false'); if (lenis) lenis.stop(); }
  function closeDrawer() { drawer.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); S.drawer = null; if (lenis) lenis.start(); if (location.hash.startsWith('#t=')) history.replaceState(null, '', location.pathname); }
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('on') && !$('.modal')) closeDrawer(); });
  document.addEventListener('click', e => { const c = e.target.closest('[data-team]'); if (!c || e.target.closest('a')) return; openTeam(+c.dataset.team); });
  async function openTeam(id) {
    const first = S.drawer !== id; S.drawer = id; history.replaceState(null, '', '#t=' + id);
    if (first) openDrawer('<div class="empty" style="margin-top:40px">Loading team…</div>');
    let d; try { d = await api('team?id=' + id); } catch (e) { openDrawer(`<div class="empty" style="margin-top:40px">${esc(e.message)}</div>`); return; }
    if (S.drawer !== id) return;
    const t = d.team, last = t.last || {}, live = d.live || {}, s = t.settings, band = s.band / 100, isOwner = S.wallet && t.ownerFull === S.wallet;
    const gapRows = t.betas.map(b => {
      const g = last.gaps ? last.gaps[b.mint] : null, w = g == null ? 0 : Math.min(50, Math.abs(g) / Math.max(band * 2.5, Math.abs(g)) * 50);
      return `<div class="gap">${av(b, 'sm')}<div class="nm"><b>$${esc(b.symbol)}</b>${g == null ? 'no pass yet' : g < -band ? 'behind the main' : g > band ? 'ahead of the main' : 'in step with the main'}</div><div class="gbar"><i style="${g == null ? '' : g < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></div><span>${g == null ? '—' : pct(g * 100)} · ${live.bags && live.bags[b.mint] != null ? (live.bags[b.mint] >= 1e6 ? (live.bags[b.mint] / 1e6).toFixed(2) + 'M' : Math.round(live.bags[b.mint]).toLocaleString()) : '0'}</span></div>`;
    }).join('');
    openDrawer(`<div class="dh">${av(t.main, 'lg')}<div><h3>$${esc(t.main.symbol)} · team #${t.id}</h3><span>${t.betas.length} betas · owner ${esc(t.owner)} · <span class="st ${t.status === 'live' && !t.paused ? 'live' : ''}">${t.paused ? 'paused' : esc(t.status)}</span></span></div></div>
      <div class="dk"><div><b>${last.value != null ? usd(last.value) : '—'}</b><span>maker value</span></div><div><b>${live.sol != null ? sol(live.sol) : '—'}</b><span>SOL in the maker</span></div><div><b>${d.trades.length}</b><span>trades</span></div><div><b>${t.lastPass ? ago(t.lastPass) : '—'}</b><span>last pass</span></div></div>
      <div class="addr mono" style="font-size:12px;color:var(--mu)"><span>maker ${esc(t.treasury)}</span><span style="display:flex;gap:8px"><button class="btn sm" type="button" data-copy="${esc(t.treasury)}">Copy</button><a class="btn sm" href="https://solscan.io/account/${esc(t.treasury)}" target="_blank" rel="noopener">Solscan ↗</a></span></div>
      <div class="dsec"><div class="lab mono">EACH BETA AGAINST THE MAIN · BAND ±${s.band}%</div><div class="gaps">${gapRows}</div></div>
      <div class="dsec"><div class="lab mono">GAPS OVER TIME</div><canvas class="big" id="dGap"></canvas></div>
      <div class="dsec"><div class="lab mono">TRADES</div><div class="tlist">${d.trades.length ? d.trades.map(x => `<div><span class="s ${x.side}">${x.side === 'buy' ? 'BUY' : 'SELL'}</span><span>$${esc(x.sym || '')} · ${sol(x.sol)} SOL · ${esc(x.reason || '')}</span><a class="lk" href="https://solscan.io/tx/${esc(x.sig)}" target="_blank" rel="noopener">${ago(x.at)} ↗</a></div>`).join('') : '<div><span></span><span>No trades yet. The maker trades when a beta leaves the band.</span><span></span></div>'}</div></div>
      <div class="dsec"><div class="lab mono">LOG</div><div class="log">${d.events.map(x => `<div><span>${ago(x.at)}</span>${esc(x.note)}</div>`).join('')}</div></div>
      ${isOwner && t.status !== 'closed' ? ownerPanel(t) : ''}`);
    drawGaps($('#dGap'), d.samples, t);
    if (isOwner && t.status !== 'closed') wireOwner(t);
  }
  function drawGaps(c, samples, t) {
    const { x, w, h } = fit(c); x.clearRect(0, 0, w, h);
    if (!samples || samples.length < 2) { x.fillStyle = '#555'; x.font = '500 11px M, monospace'; x.fillText('The chart fills in as the engine runs its passes.', 14, h / 2); return; }
    const band = t.settings.band; let mx = band * 1.5; samples.forEach(s => t.betas.forEach(b => { const g = s.gaps && s.gaps[b.mint]; if (g != null) mx = Math.max(mx, Math.abs(g * 100)); }));
    const X = i => 10 + i / (samples.length - 1) * (w - 20), Y = v => h / 2 - v / mx * (h / 2 - 12);
    x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(10, Y(band), w - 20, Y(-band) - Y(band)); x.strokeStyle = '#555'; x.beginPath(); x.moveTo(10, Y(0)); x.lineTo(w - 10, Y(0)); x.stroke();
    t.betas.forEach((b, k) => { x.beginPath(); samples.forEach((s, i) => { const g = (s.gaps && s.gaps[b.mint] || 0) * 100; i ? x.lineTo(X(i), Y(g)) : x.moveTo(X(i), Y(g)); }); x.strokeStyle = SHADES[k % 5]; x.setLineDash(DASH[k % 5]); x.lineWidth = 1.3; x.stroke(); x.setLineDash([]); });
  }
  function ownerPanel(t) {
    return `<div class="owner"><div class="lab mono">YOUR CONTROLS</div><div class="rgrid">
      ${[['band', 'band', 3, 40, 1, '%'], ['buy', 'buy a beta', 5, 50, 1, '%'], ['trim', 'trim a beta', 0, 100, 1, '%'], ['cooldown', 'cooldown', 1, 120, 1, 'm']].map(([k, n, a, b, st, u]) => `<label><span>${n}</span><small>now ${t.settings[k]}${u}</small><b data-ov="${k}">${t.settings[k]}${u}</b><input type="range" data-o="${k}" data-u="${u}" min="${a}" max="${b}" step="${st}" value="${t.settings[k]}"></label>`).join('')}
      </div><div class="oacts"><button class="btn sm pri" type="button" data-oa="save">Save rules</button><button class="btn sm" type="button" data-oa="pause">${t.paused ? 'Resume' : 'Pause'}</button><button class="btn sm" type="button" data-oa="anchor">Reset kickoff</button><button class="btn sm" type="button" data-oa="add">Add SOL</button><button class="btn sm" type="button" data-oa="withdraw">Withdraw everything</button></div><p class="err" data-oerr></p></div>`;
  }
  function wireOwner(t) {
    $$('[data-o]', dPanel).forEach(el => { fillRange(el); el.addEventListener('input', () => { dPanel.dataset.dirty = '1'; $(`[data-ov="${el.dataset.o}"]`, dPanel).textContent = el.value + el.dataset.u; fillRange(el); }); });
    dPanel.querySelector('.oacts').addEventListener('click', e => {
      const b = e.target.closest('[data-oa]'); if (!b) return; const err = $('[data-oerr]', dPanel); err.textContent = '';
      needWallet(async () => {
        b.disabled = true;
        try {
          const a = b.dataset.oa;
          if (a === 'save') { const s = {}; $$('[data-o]', dPanel).forEach(el => s[el.dataset.o] = +el.value); await api('settings', { id: t.id, settings: s }); toast('Rules saved.'); }
          if (a === 'pause') { await api('pause', { id: t.id, paused: !t.paused }); toast(t.paused ? 'Resumed.' : 'Paused.'); }
          if (a === 'anchor') { await api('reanchor', { id: t.id }); toast('Kickoff reset to today\'s prices.'); }
          if (a === 'add') { const v = await ask({ title: 'Add SOL', text: 'Send more SOL from your wallet to this team\'s maker. You sign it in your wallet.', input: '0.25', ok: 'Send' }); const n = +v; if (!(n > 0)) { b.disabled = false; return; } const r = await sendSol(t.treasury, n); toast(r.ok ? 'SOL added.' : 'Sent. Waiting for the network.'); if (t.status === 'pending') await api('funded', { id: t.id }).catch(() => { }); }
          if (a === 'withdraw') { if (!await ask({ title: 'Withdraw everything', text: 'The maker sells every beta, one per pass, then sends every lamport back to your wallet. This closes the team.', ok: 'Withdraw', danger: true })) { b.disabled = false; return; } await api('withdraw', { id: t.id }); toast('Withdrawing: selling every beta, then sending all SOL home.', 4000); }
          await openTeam(t.id); loadTeams();
        } catch (x) { err.textContent = errMsg(x); b.disabled = false; }
      });
    });
  }

  /* ---------------- the rules, from the engine ---------------- */
  function renderRules() {
    const c = S.cfg, d = c.defaults, l = c.limits || {};
    $('#rulesList').innerHTML = [
      `<li><b>Band ${d.band}%</b> by default (${(l.band || [3, 40]).join('–')}%): how far a beta drifts from the main before the maker acts.</li>`,
      `<li><b>Buy ${d.buy}%</b> of free SOL when a beta falls a band behind, never more than <b>${d.maxTrade} SOL</b> a trade by default.</li>`,
      `<li><b>Trim ${d.trim}%</b> of a beta's bag when it runs a band ahead. Once per step, never twice for the same step.</li>`,
      `<li><b>At most ${c.maxSol} SOL</b> is ever put to work; <b>${c.reserve} SOL</b> stays for fees and rent; up to <b>${c.maxBetas} betas</b> per team.</li>`,
      `<li>Swaps above <b>${d.impact}%</b> price impact are skipped and logged. Betas need <b>${usd(c.minLiq)}</b> of liquidity.</li>`,
      `<li>Passes run every <b>${d.cooldown} minutes</b> by default, at most two trades a pass, the beta furthest from the main first.</li>`,
    ].join('');
  }

  /* ---------------- start ---------------- */
  (async () => { try { const c = await api('config'); S.cfg = { ...S.cfg, ...c }; } catch (e) { } renderRules(); setRules(S.cfg.defaults); renderFacts(); })();
  renderMe(); renderTeam();
  loadScan();
  loadFresh(); loadTeams(); loadStats();
  setInterval(() => { if (document.hidden) return; loadStats(); loadTeams(); if (S.drawer && !dPanel.dataset.dirty && !$('.modal')) openTeam(S.drawer); }, 30000);
  setInterval(() => { if (!document.hidden) loadFresh(); }, 30000);
  const deep = (location.hash.match(/^#t=(\d+)/) || [])[1]; if (deep) setTimeout(() => openTeam(+deep), 500);
})();
