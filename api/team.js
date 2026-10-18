'use strict';
/* TEAM: betas that actually follow the main. Win as a team.
 * Pick a main (the runner) and up to five of its betas. One maker wallet holds SOL and the betas and watches every beta
 * against the main: a beta that falls behind the main gets bought, a beta that runs ahead of it gets trimmed.
 * The main itself is only the signal; the maker never trades it.
 * Every number comes from Solana, Jupiter, Dexscreener or GeckoTerminal. The owner's wallet is the only place the
 * maker's SOL can ever be sent. */
const crypto = require('crypto');
const { PublicKey, Keypair, VersionedTransaction, Transaction, SystemProgram, TransactionInstruction } = require('@solana/web3.js');

const E = (k, d = '') => String(process.env[k] == null ? d : process.env[k]).trim();
const RPC_URL = E('RPC_URL');
const RPCS = E('TEAM_RPCS') ? E('TEAM_RPCS').split(',') : [RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const DEX = E('TEAM_DEX', 'https://api.dexscreener.com'), JUP = E('TEAM_JUP', 'https://lite-api.jup.ag'), GT = E('TEAM_GT', 'https://api.geckoterminal.com/api/v2');
const DB_URL = E('TEAM_DB_URL') || E('TEAM_DB_DATABASE_URL') || E('TEAM_DB_POSTGRES_URL') || E('DATABASE_URL') || E('POSTGRES_URL');
const SECRET = E('SESSION_SECRET') || crypto.createHash('sha256').update('team-session:' + DB_URL).digest('hex');
const KEY_SECRET = E('TEAM_SECRET') || ('db:' + DB_URL);       // set TEAM_SECRET in the project to keep maker keys apart from the database
const MAX_SOL = Number(E('TEAM_MAX_SOL', '5')) || 5;           // the most SOL one maker will ever put to work
const MIN_LIQ = Number(E('TEAM_MIN_LIQ', '3000')) || 3000;     // a beta needs at least this much liquidity (USD) to be traded
const MIN_FUND = 0.05, RESERVE = 0.015, MAX_BETAS = 5, MAX_TRADES_PER_PASS = 2;
const SOL = 'So11111111111111111111111111111111111111112';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SPL = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const DEFAULTS = { band: 10, buy: 15, trim: 30, cooldown: 3, maxTrade: 0.3, impact: 4, slippage: 300 };
const LIMITS = { band: [3, 40], buy: [5, 50], trim: [0, 100], cooldown: [1, 120], maxTrade: [0.01, 5], impact: [0.5, 10], slippage: [50, 1500] };
const STABLE = /^(usd|usdc|usdt|usds|usdf|pyusd|eurc|usdg)$/i;

/* ---------------- plumbing ---------------- */
function send(res, code, body, headers) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); if (headers) for (const k in headers) res.setHeader(k, headers[k]); res.end(JSON.stringify(body)); }
function http(code, msg, extra) { const e = new Error(msg); e.code = code; if (extra) e.extra = extra; return e; }
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; let n = 0; for await (const c of req) { chunks.push(c); n += c.length; if (n > 1e6) break; }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { return {}; }
}
const timed = ms => (url, opt = {}) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
const getJson = async (url, opt, ms = 9000) => { const r = await timed(ms)(url, opt); if (!r.ok) throw http(502, 'Upstream ' + r.status); return r.json(); };
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ');
const hits = new Map();
function limit(key, n, ms, msg) { const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < ms); if (a.length >= n) throw http(429, msg || 'Slow down a little.'); a.push(t); hits.set(key, a); if (hits.size > 5000) hits.clear(); }
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const norm = s => String(s || '').toLowerCase().replace(/^\$/, '').replace(/[^a-z0-9]/g, '');
const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(s) { let n = 0n; for (const c of s) { const i = ALPH.indexOf(c); if (i < 0) throw new Error('bad'); n = n * 58n + BigInt(i); } let hex = n.toString(16); if (hex.length % 2) hex = '0' + hex; const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex'); let z = 0; while (z < s.length && s[z] === '1') z++; return Buffer.concat([Buffer.alloc(z), body]); }
function b58enc(buf) {
  const digits = [];
  for (const byte of buf) { let carry = byte; for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; } while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; } }
  let s = ''; for (const byte of buf) { if (byte) break; s += '1'; }
  for (let i = digits.length - 1; i >= 0; i--) s += ALPH[digits[i]];
  return s;
}
function verifySig(wallet, msg, sig) { try { const pub = b58dec(wallet); if (pub.length !== 32 || sig.length !== 64) return false; const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]), format: 'der', type: 'spki' }); return crypto.verify(null, msg, key, sig); } catch (e) { return false; } }
const b64u = b => Buffer.from(b).toString('base64url');
function issue(wallet) { const p = b64u(JSON.stringify({ w: wallet, e: Date.now() + 14 * 864e5 })); return p + '.' + b64u(crypto.createHmac('sha256', SECRET).update(p).digest()); }
function who(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer ([\w-]+)\.([\w-]+)$/); if (!m) return null;
  const want = b64u(crypto.createHmac('sha256', SECRET).update(m[1]).digest());
  if (want.length !== m[2].length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[2]))) return null;
  try { const j = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return j.w && j.e > Date.now() ? j.w : null; } catch (e) { return null; }
}
// maker keys are encrypted at rest (AES-256-GCM)
const kek = () => crypto.createHash('sha256').update('team-keys-v1:' + KEY_SECRET).digest();
function seal(bytes) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', kek(), iv); const ct = Buffer.concat([c.update(Buffer.from(bytes)), c.final()]); return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') }; }
function unseal(o) { const d = crypto.createDecipheriv('aes-256-gcm', kek(), Buffer.from(o.iv, 'base64')); d.setAuthTag(Buffer.from(o.tag, 'base64')); return Keypair.fromSecretKey(Uint8Array.from(Buffer.concat([d.update(Buffer.from(o.ct, 'base64')), d.final()]))); }

/* ---------------- database ---------------- */
let sqlFn, ready;
function db() {
  if (!sqlFn) {
    if (E('TEAM_LOCAL_PG')) { const { Pool } = require('pg'); const pool = new Pool({ connectionString: E('TEAM_LOCAL_PG') }); sqlFn = async (strs, ...vals) => { let q = strs[0]; vals.forEach((v, i) => { q += '$' + (i + 1) + strs[i + 1]; }); return (await pool.query(q, vals)).rows; }; }
    else { if (!DB_URL) throw http(503, 'The database is not connected yet.'); const { neon } = require('@neondatabase/serverless'); sqlFn = neon(DB_URL); }
  }
  return sqlFn;
}
async function ensure() {
  if (ready) return ready;
  ready = (async () => {
    const s = db();
    await s`CREATE TABLE IF NOT EXISTS tm_nonces (nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, text TEXT NOT NULL, used BOOLEAN DEFAULT false, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS tm_teams (id BIGSERIAL PRIMARY KEY, owner TEXT NOT NULL, main_mint TEXT, main JSONB, betas JSONB, treasury TEXT UNIQUE, enc JSONB, settings JSONB, status TEXT DEFAULT 'pending', paused BOOLEAN DEFAULT false, anchors JSONB, ladders JSONB DEFAULT '{}'::jsonb, next_pass TIMESTAMPTZ DEFAULT now(), last_pass TIMESTAMPTZ, last JSONB, created TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS tm_teams_due ON tm_teams (status, next_pass)`;
    await s`CREATE TABLE IF NOT EXISTS tm_trades (id BIGSERIAL PRIMARY KEY, team BIGINT, side TEXT, mint TEXT, sym TEXT, sol DOUBLE PRECISION, tokens DOUBLE PRECISION, usd DOUBLE PRECISION, sig TEXT, status TEXT, reason TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE INDEX IF NOT EXISTS tm_trades_team ON tm_trades (team, at)`;
    await s`CREATE TABLE IF NOT EXISTS tm_samples (team BIGINT, at TIMESTAMPTZ DEFAULT now(), pm DOUBLE PRECISION, gaps JSONB, px JSONB, sol DOUBLE PRECISION, value DOUBLE PRECISION)`;
    await s`CREATE INDEX IF NOT EXISTS tm_samples_team ON tm_samples (team, at)`;
    await s`CREATE TABLE IF NOT EXISTS tm_events (id BIGSERIAL PRIMARY KEY, team BIGINT, kind TEXT, note TEXT, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS tm_cache (k TEXT PRIMARY KEY, v JSONB, at TIMESTAMPTZ DEFAULT now())`;
    await s`CREATE TABLE IF NOT EXISTS tm_creates (mint TEXT PRIMARY KEY, sig TEXT, name TEXT, symbol TEXT, ns TEXT, nn TEXT, creator TEXT, uri TEXT, img TEXT, t TIMESTAMPTZ)`;
    await s`CREATE INDEX IF NOT EXISTS tm_creates_t ON tm_creates (t)`;
  })();
  try { await ready; } catch (e) { ready = null; throw e; }
  return ready;
}
async function cached(k, secs, fn) {
  const row = (await db()`SELECT v, extract(epoch FROM now() - at) AS age FROM tm_cache WHERE k=${k}`)[0];
  if (row && row.age < secs) return row.v;
  try { const v = await fn(); await db()`INSERT INTO tm_cache (k, v, at) VALUES (${k}, ${JSON.stringify(v)}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`; return v; }
  catch (e) { if (row) return row.v; throw e; }
}
const event = (team, kind, note) => db()`INSERT INTO tm_events (team, kind, note) VALUES (${team}, ${kind}, ${String(note).slice(0, 300)})`.catch(() => { });

/* ---------------- Solana ---------------- */
async function rpc(method, params, good) {
  for (const u of RPCS) {
    try {
      const r = await timed(9000)(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || 'rpc error');
      if (good && !good(j.result)) throw new Error('unusable answer'); return j.result;
    } catch (e) { if (method === 'sendTransaction' && /blockhash|insufficient|custom program error|simulation/i.test(e.message)) throw http(400, 'The transaction was refused: ' + e.message.slice(0, 120)); }
  }
  throw http(502, 'Solana RPC is busy, try again in a moment.');
}
// batched JSON-RPC with a per-item fallback (public nodes refuse or rate-limit batches)
async function rpcBatch(calls, deadline = Date.now() + 14000) {
  const out = calls.map(() => null), miss = new Set(calls.map((_, i) => i));
  for (const u of RPCS) {
    if (!miss.size || Date.now() > deadline) break;
    const idx = [...miss];
    try {
      const r = await timed(12000)(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(idx.map(i => ({ jsonrpc: '2.0', id: i, method: calls[i][0], params: calls[i][1] }))) });
      const j = await r.json(); if (!Array.isArray(j)) continue;
      for (const x of j) if (x && x.result && miss.has(x.id)) { out[x.id] = x.result; miss.delete(x.id); }
    } catch (e) { }
  }
  const left = [...miss];
  for (let k = 0; k < left.length && Date.now() < deadline; k += 5) {
    await Promise.all(left.slice(k, k + 5).map(async i => { try { out[i] = await rpc(calls[i][0], calls[i][1], x => x != null); miss.delete(i); } catch (e) { } }));
  }
  out.missed = miss.size;
  return out;
}
const mintCache = new Map();
async function mintInfo(mint) {
  const c = mintCache.get(mint); if (c && Date.now() - c.t < 600e3) return c.v;
  const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const v = r && r.value; if (!v || !v.data || !v.data.parsed || v.data.parsed.type !== 'mint') throw http(400, 'That address is not a token.');
  const i = v.data.parsed.info, out = { program: v.owner, decimals: i.decimals, supply: Number(i.supply) / 10 ** i.decimals };
  mintCache.set(mint, { t: Date.now(), v: out }); return out;
}
async function holdings(owner) {
  const [bal, a, b] = await Promise.all([
    rpc('getBalance', [owner, { commitment: 'confirmed' }], x => x && typeof x.value === 'number'),
    rpc('getTokenAccountsByOwner', [owner, { programId: SPL }, { encoding: 'jsonParsed', commitment: 'confirmed' }], x => x && Array.isArray(x.value)),
    rpc('getTokenAccountsByOwner', [owner, { programId: T22 }, { encoding: 'jsonParsed', commitment: 'confirmed' }], x => x && Array.isArray(x.value)).catch(() => ({ value: [] })),
  ]);
  const tokens = {};
  for (const x of [...a.value, ...b.value]) {
    const i = x.account.data.parsed.info, t = tokens[i.mint] || (tokens[i.mint] = { ui: 0, raw: 0n, dec: i.tokenAmount.decimals, accounts: [], program: x.account.owner });
    t.ui += Number(i.tokenAmount.uiAmountString || 0); t.raw += BigInt(i.tokenAmount.amount); t.accounts.push(x.pubkey);
  }
  return { sol: bal.value / 1e9, lamports: bal.value, tokens };
}
async function sendSigned(tx) {
  const sig = await rpc('sendTransaction', [Buffer.from(tx.serialize()).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 4 }]);
  for (let i = 0; i < 9; i++) {
    await new Promise(r => setTimeout(r, 1200));
    try { const st = (await rpc('getSignatureStatuses', [[sig]])).value[0]; if (st) { if (st.err) return { sig, status: 'failed' }; if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return { sig, status: 'confirmed' }; } } catch (e) { }
  }
  return { sig, status: 'sent' };
}

/* ---------------- market data ---------------- */
function bestPair(pairs) { return (pairs || []).filter(p => p.chainId === 'solana').sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0] || null; }
const shape = p => p && ({
  mint: p.baseToken.address, symbol: clean(p.baseToken.symbol).slice(0, 16), name: clean(p.baseToken.name).slice(0, 48),
  image: (p.info && p.info.imageUrl) || null, mc: Math.round(p.marketCap || p.fdv || 0), liq: Math.round((p.liquidity || {}).usd || 0),
  vol: Math.round((p.volume || {}).h24 || 0), chg: (p.priceChange || {}).h24 ?? null, ch24: (p.priceChange || {}).h24 ?? null, ch1h: (p.priceChange || {}).h1 ?? null, ch5m: (p.priceChange || {}).m5 ?? null, vol1h: Math.round((p.volume || {}).h1 || 0), pad: p.dexId || null, price: Number(p.priceUsd || 0), pair: p.pairAddress, created: p.pairCreatedAt || null,
});
async function coin(ca) {
  if (!B58.test(ca)) throw http(400, 'Paste a Solana contract address.');
  if (ca === SOL) throw http(400, 'Pick a coin, not SOL.');
  return cached('coin:' + ca, 40, async () => {
    const [d, m] = await Promise.all([getJson(DEX + '/tokens/v1/solana/' + ca).catch(() => []), mintInfo(ca)]);
    const p = bestPair(Array.isArray(d) ? d : d.pairs); if (!p) throw http(404, 'No market found for that coin yet.');
    return { ...shape(p), decimals: m.decimals, program: m.program, supply: m.supply };
  });
}
async function prices(mints) {
  const j = await getJson(JUP + '/price/v3?ids=' + [...new Set(mints)].join(','), {}, 8000);
  const out = {}; for (const m of mints) if (j[m] && j[m].usdPrice) out[m] = Number(j[m].usdPrice); return out;
}
// Jupiter knows icons, market caps and stats for 100 mints per call
const jupMem = new Map();
const jupShape = t => {
  const s1 = t.stats1h || {}, s24 = t.stats24h || {}, s5 = t.stats5m || {};
  return { mint: t.id, symbol: clean(t.symbol).slice(0, 16), name: clean(t.name).slice(0, 48), image: t.icon || null, mc: Math.round(t.mcap || t.fdv || 0), liq: Math.round(t.liquidity || 0), price: Number(t.usdPrice || 0),
    ch5m: s5.priceChange != null ? +Number(s5.priceChange).toFixed(2) : null, ch1h: s1.priceChange != null ? +Number(s1.priceChange).toFixed(2) : null, ch24: s24.priceChange != null ? +Number(s24.priceChange).toFixed(2) : null,
    vol1h: Math.round((s1.buyVolume || 0) + (s1.sellVolume || 0)), vol24: Math.round((s24.buyVolume || 0) + (s24.sellVolume || 0)), holders: t.holderCount || 0,
    organic: t.organicScore != null ? Math.round(t.organicScore) : null, created: (t.firstPool && t.firstPool.createdAt) || null, bonded: !!t.graduatedPool || !!t.graduatedAt, pad: t.launchpad || null };
};
async function jupInfo(mints) {
  const out = {}, need = [];
  for (const m of new Set(mints)) { const h = jupMem.get(m); if (h && Date.now() - h.at < 60e3) out[m] = h.v; else need.push(m); }
  for (let i = 0; i < need.length; i += 100) {
    try { const j = await getJson(JUP + '/tokens/v2/search?query=' + need.slice(i, i + 100).join(','), {}, 8000); for (const t of (Array.isArray(j) ? j : [])) { const v = jupShape(t); jupMem.set(t.id, { at: Date.now(), v }); out[t.id] = v; } } catch (e) { }
  }
  if (jupMem.size > 4000) jupMem.clear();
  return out;
}
// GeckoTerminal candles: a coin's biggest pool, then its OHLCV
async function poolOf(mint) {
  return cached('pool:' + mint, 3600, async () => {
    const j = await getJson(`${GT}/networks/solana/tokens/${mint}/pools?page=1`, { headers: { accept: 'application/json' } });
    const p = (j.data || [])[0]; if (!p) throw http(404, 'No pool with candles for that coin.');
    return p.attributes.address;
  });
}
const TF = { '5m': ['minute', 5, 288], '15m': ['minute', 15, 192], '1h': ['hour', 1, 168] };
async function candles(mint, tf) {
  const [unit, agg, n] = TF[tf] || TF['15m'];
  return cached(`ohlcv:${mint}:${tf}`, 90, async () => {
    const pool = await poolOf(mint);
    const j = await getJson(`${GT}/networks/solana/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=${n}&currency=usd&token=${mint}`, { headers: { accept: 'application/json' } });
    const list = ((j.data || {}).attributes || {}).ohlcv_list || [];
    return list.map(c => [c[0], Number(c[4])]).filter(c => c[1] > 0).sort((a, b) => a[0] - b[0]);
  });
}
// line every series up on the main's timestamps, carrying each beta's last close forward
function alignMany(main, others) {
  const maps = others.map(o => o.map(c => c));
  const idx = maps.map(() => 0), last = maps.map(() => null), rows = [];
  for (const [t, pm] of main) {
    const row = [t, pm];
    for (let k = 0; k < maps.length; k++) { const m = maps[k]; while (idx[k] < m.length && m[idx[k]][0] <= t) { last[k] = m[idx[k]][1]; idx[k]++; } row.push(last[k]); }
    if (row.slice(2).every(v => v != null)) rows.push(row);
  }
  return rows;
}
function corrCols(rows, a, b) {
  const ra = [], rb = [];
  for (let i = 1; i < rows.length; i++) { ra.push(Math.log(rows[i][a] / rows[i - 1][a])); rb.push(Math.log(rows[i][b] / rows[i - 1][b])); }
  const n = ra.length; if (n < 8) return null;
  const ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = ra[i] - ma, y = rb[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

/* ---------------- the chain: every pump.fun launch, read straight from Solana ----------------
 * Every create touches the pump.fun mint authority; the CreateEvent in the logs carries name, symbol, uri, mint and creator.
 * Read at most every 25 seconds, kept 3 days. This is where brand-new betas show up first. */
const MINT_AUTH = 'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM';
const CREATE_DISC = Buffer.from([27, 114, 169, 77, 222, 235, 99, 118]);
function parseCreate(tx) {
  if (!tx || !tx.meta || tx.meta.err) return null;
  for (const line of (tx.meta.logMessages || [])) {
    if (!line.startsWith('Program data: ')) continue;
    let buf; try { buf = Buffer.from(line.slice(14), 'base64'); } catch (e) { continue; }
    if (buf.length < 8 + 12 + 96 || !buf.subarray(0, 8).equals(CREATE_DISC)) continue;
    let o = 8; const str = () => { const n = buf.readUInt32LE(o); o += 4; if (n > 400) throw new Error('long'); const s = buf.subarray(o, o + n).toString('utf8'); o += n; return s; };
    try {
      const name = str(), symbol = str(), uri = str();
      const mint = b58enc(buf.subarray(o, o + 32)); o += 32; o += 32; const user = b58enc(buf.subarray(o, o + 32)); o += 32;
      let creator = user; if (buf.length >= o + 32) { creator = b58enc(buf.subarray(o, o + 32)); o += 32; }
      let t = null; if (buf.length >= o + 8) t = Number(buf.readBigInt64LE(o)) * 1000;
      if (!t || t < 1.6e12 || t > Date.now() + 120e3) t = tx.blockTime ? tx.blockTime * 1000 : null;
      return { mint, name: clean(name).slice(0, 64), symbol: clean(symbol).slice(0, 24), uri: clean(uri).slice(0, 220), creator, t, sig: tx.transaction && tx.transaction.signatures && tx.transaction.signatures[0] };
    } catch (e) { return null; }
  }
  return null;
}
let ingesting = null;
async function ingest() {
  if (ingesting) return ingesting;
  ingesting = (async () => {
    const claim = await db()`INSERT INTO tm_cache (k, v, at) VALUES ('ingest', '{}'::jsonb, now()) ON CONFLICT (k) DO UPDATE SET at=now() WHERE tm_cache.at < now() - interval '25 seconds' RETURNING v`;
    if (!claim.length) return 0;
    const st = claim[0].v || {}, opt = { limit: 90, commitment: 'confirmed' }; if (st.last) opt.until = st.last;
    const sigs = (await rpc('getSignaturesForAddress', [MINT_AUTH, opt], x => Array.isArray(x))).filter(s => !s.err);
    if (!sigs.length) return 0;
    const out = []; let missed = 0; const deadline = Date.now() + 14000;
    for (let i = 0; i < sigs.length; i += 30) {
      const chunk = sigs.slice(i, i + 30);
      if (Date.now() > deadline) { missed += chunk.length; continue; }
      const txs = await rpcBatch(chunk.map(s => ['getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]]), deadline);
      missed += txs.missed || 0;
      txs.forEach((tx, k) => { const c = parseCreate(tx); if (c) { if (!c.t && chunk[k].blockTime) c.t = chunk[k].blockTime * 1000; if (c.t) out.push(c); } });
    }
    for (let i = 0; i < out.length; i += 50) {
      const part = out.slice(i, i + 50);
      await db()`INSERT INTO tm_creates (mint, sig, name, symbol, ns, nn, creator, uri, t)
        SELECT * FROM unnest(${part.map(c => c.mint)}::text[], ${part.map(c => c.sig || '')}::text[], ${part.map(c => c.name)}::text[], ${part.map(c => c.symbol)}::text[], ${part.map(c => norm(c.symbol))}::text[], ${part.map(c => norm(c.name))}::text[], ${part.map(c => c.creator)}::text[], ${part.map(c => c.uri)}::text[], ${part.map(c => new Date(c.t).toISOString())}::timestamptz[])
        ON CONFLICT (mint) DO NOTHING`;
    }
    const keep = missed > Math.max(3, sigs.length * .25);
    await db()`UPDATE tm_cache SET v=${JSON.stringify({ last: keep ? st.last : sigs[0].signature, read: (st.read || 0) + out.length, missed, since: st.since || Date.now() })} WHERE k='ingest'`;
    if (Math.random() < .03) db()`DELETE FROM tm_creates WHERE t < now() - interval '3 days'`.catch(() => { });
    return out.length;
  })();
  try { return await ingesting; } finally { ingesting = null; }
}
async function imgFill(rows, cap = 8) {
  const need = rows.filter(r => !r.image && !r.img && /^https?:\/\//.test(r.uri || '')).slice(0, cap);
  await Promise.all(need.map(async r => {
    try { const j = await getJson(r.uri.replace('https://ipfs.io/ipfs/', 'https://pump.mypinata.cloud/ipfs/'), {}, 3500); const im = typeof j.image === 'string' && /^https?:\/\//.test(j.image) ? j.image.slice(0, 300) : ''; r.img = im || '-'; await db()`UPDATE tm_creates SET img=${r.img} WHERE mint=${r.mint}`; }
    catch (e) { r.img = '-'; await db()`UPDATE tm_creates SET img='-' WHERE mint=${r.mint}`.catch(() => { }); }
  }));
}

/* ---------------- mains and their betas ---------------- */
const STOP = new Set(['the', 'coin', 'token', 'inu', 'sol', 'solana', 'pump', 'fun', 'official', 'meme', 'dog', 'cat', 'and', 'for', 'with', 'from', 'this', 'that', 'new', 'baby', 'mini', 'super', 'real', 'first', 'just', 'your', 'our', 'like', 'big', 'little']);
function keysOf(c) {
  const out = []; const s = norm(c.symbol);
  if (s.length >= 2 && !STOP.has(s)) out.push(s);
  for (const w of clean(c.name).toLowerCase().split(/[^a-z0-9]+/)) { const n = norm(w); if (n.length >= 4 && !STOP.has(n) && !out.includes(n)) out.push(n); if (out.length >= 3) break; }
  return out.slice(0, 3);
}
function hitKey(c, keys) {
  const s = norm(c.symbol), n = norm(c.name), words = clean(c.name).toLowerCase().split(/[^a-z0-9]+/).map(norm);
  for (const k of keys) {
    if (k.length <= 3) { if (s === k || s.startsWith(k) || s.endsWith(k) || words.includes(k)) return k; }
    else if (s.includes(k) || n.includes(k)) return k;
  }
  return null;
}
const MAINS = { trending: '/tokens/v2/toptrending/1h?limit=100', traded: '/tokens/v2/toptraded/1h?limit=100', organic: '/tokens/v2/toporganicscore/1h?limit=100' };
async function mainsOf(tab) {
  return cached('mains:' + tab, 55, async () => {
    const j = await getJson(JUP + MAINS[tab], {}, 9000); const out = [];
    for (const t of (Array.isArray(j) ? j : [])) {
      if (!t || !t.id || STABLE.test(t.symbol || '') || !(t.launchpad === 'pump.fun' || /pump$/.test(t.id))) continue;
      const v = jupShape(t); if (v.mc < 150000 || v.liq < 10000) continue;
      out.push(v); if (out.length >= 30) break;
    }
    return { at: Date.now(), tab, list: out };
  });
}
async function betasOf(q) {
  q = clean(q).trim().slice(0, 60); if (!q) throw http(400, 'Paste the main\'s ticker or contract address.');
  let main;
  if (B58.test(q)) main = await coin(q);
  else {
    const k = norm(q); if (!k) throw http(400, 'Nothing to search for.');
    const found = await getJson(JUP + '/tokens/v2/search?query=' + encodeURIComponent(q.replace(/^\$/, '')), {}, 8000).catch(() => []);
    const cand = (Array.isArray(found) ? found : []).map(jupShape).filter(c => norm(c.symbol) === k && !STABLE.test(c.symbol)).sort((a, b) => b.mc - a.mc)[0];
    if (!cand) throw http(404, `No coin with the ticker $${q.replace(/^\$/, '').toUpperCase()} found. Paste its contract address instead.`);
    main = await coin(cand.mint).catch(() => cand);
  }
  ingest().catch(e => console.error('ingest', e.message));
  return cached('betas:' + main.mint, 120, async () => {
    const keys = keysOf(main); if (!keys.length) throw http(404, 'That name is too generic to find betas for.');
    const by = new Map(), add = (c, src) => {
      if (!c || !c.mint || c.mint === main.mint || STABLE.test(c.symbol || '')) return;
      const k = hitKey(c, keys); if (!k) return;
      const prev = by.get(c.mint); if (prev) { prev.src = [...new Set([...prev.src, src])]; for (const f of ['mc', 'liq', 'image', 'ch1h', 'ch24', 'holders', 'created', 'vol24']) if (prev[f] == null || prev[f] === 0) prev[f] = c[f]; return; }
      by.set(c.mint, { ...c, key: k, copy: norm(c.symbol) === norm(main.symbol), src: [src] });
    };
    // 1. Jupiter: every indexed token whose name or ticker carries the main's words
    for (const k of keys.slice(0, 2)) { const j = await getJson(JUP + '/tokens/v2/search?query=' + encodeURIComponent(k), {}, 8000).catch(() => []); (Array.isArray(j) ? j : []).forEach(t => add(jupShape(t), 'jupiter')); }
    // 2. Dexscreener pairs for the same words
    for (const k of keys.slice(0, 2)) { const d = await getJson(DEX + '/latest/dex/search?q=' + encodeURIComponent(k), {}, 8000).catch(() => ({})); for (const p of (d.pairs || [])) if (p.chainId === 'solana') add(shape(p), 'dexscreener'); }
    // 3. launches read from Solana in the last three days, before anyone else has indexed them
    let chainN = 0;
    try {
      const pats = keys.map(k => '%' + k + '%');
      const rows = await db()`SELECT mint, name, symbol, uri, img, t FROM tm_creates WHERE (ns LIKE ANY(${pats}) OR nn LIKE ANY(${pats})) AND t > now() - interval '3 days' ORDER BY t DESC LIMIT 120`;
      const info = await jupInfo(rows.map(r => r.mint));
      for (const r of rows) { const j = info[r.mint]; const c = j ? { ...j } : { mint: r.mint, symbol: r.symbol, name: r.name, image: r.img && r.img !== '-' ? r.img : null, mc: 0, liq: 0, price: 0, created: new Date(r.t).toISOString() }; if (!c.created) c.created = new Date(r.t).toISOString(); const before = by.size; add(c, 'solana'); if (by.size > before) chainN++; }
    } catch (e) { }
    const mainT = main.created ? new Date(main.created).getTime() : null;
    let list = [...by.values()].filter(c => (c.liq || 0) >= 300 || (c.mc || 0) >= 4000 || c.src.includes('solana'));
    list.forEach(c => { const t = c.created ? new Date(c.created).getTime() : null; c.after = mainT && t ? Math.round((t - mainT) / 60000) : null; c.rel24 = c.ch24 != null && main.chg != null ? +(c.ch24 - main.chg).toFixed(1) : null; });
    list.sort((a, b) => (b.mc || 0) - (a.mc || 0)); list = list.slice(0, 40);
    // how closely the biggest betas actually follow the main (15m candles, correlation of returns)
    try {
      const mc = await candles(main.mint, '15m');
      const top = list.filter(c => (c.liq || 0) >= MIN_LIQ).slice(0, 7);
      for (const c of top) { try { const rows = alignMany(mc, [await candles(c.mint, '15m')]); const r = corrCols(rows, 1, 2); if (r != null) { c.follow = +r.toFixed(3); c.n = rows.length; } } catch (e) { } }
    } catch (e) { }
    return { at: Date.now(), main, keys, list, chain: chainN };
  });
}
async function freshBetas() {
  await ingest().catch(e => console.error('ingest', e.message));
  return cached('fresh', 20, async () => {
    const mains = (await mainsOf('trending').catch(() => ({ list: [] }))).list.slice(0, 20);
    const keyed = mains.map(m => ({ m, keys: keysOf(m) })).filter(x => x.keys.length);
    const pats = [...new Set(keyed.flatMap(x => x.keys.filter(k => k.length >= 3)))].map(k => '%' + k + '%');
    const st = (await db()`SELECT count(*) FILTER (WHERE t > now() - interval '1 hour')::int AS h1, count(*)::int AS n, max(t) AS newest FROM tm_creates`)[0];
    if (!pats.length) return { at: Date.now(), feed: [], stats: st };
    const rows = await db()`SELECT mint, name, symbol, uri, img, creator, t FROM tm_creates WHERE (ns LIKE ANY(${pats}) OR nn LIKE ANY(${pats})) AND t > now() - interval '6 hours' ORDER BY t DESC LIMIT 60`;
    const feed = [];
    for (const r of rows) { const hit = keyed.find(x => x.m.mint !== r.mint && hitKey(r, x.keys)); if (hit) feed.push({ ...r, main: { mint: hit.m.mint, symbol: hit.m.symbol, image: hit.m.image, mc: hit.m.mc } }); if (feed.length >= 30) break; }
    const info = await jupInfo(feed.map(r => r.mint));
    for (const r of feed) { const j = info[r.mint]; r.image = j && j.image || (r.img && r.img !== '-' ? r.img : null); r.mc = j ? j.mc : null; r.holders = j ? j.holders : null; }
    await imgFill(feed).catch(() => { });
    for (const r of feed) if (!r.image && r.img && r.img !== '-') r.image = r.img;
    return { at: Date.now(), stats: st, feed: feed.map(r => ({ mint: r.mint, name: r.name, symbol: r.symbol, creator: r.creator, t: r.t, image: r.image, mc: r.mc, holders: r.holders, main: r.main })) };
  });
}

/* ---------------- the scanner: every minute, every pump.fun runner and the betas riding it ----------------
 * Mains come from Jupiter's live boards (pump.fun launches only). For each main TEAM looks up every coin carrying its
 * name on Jupiter and Dexscreener, plus every launch read straight from Solana in the last day, and measures where each
 * beta sits against the main right now: the gap = ln((1 + beta move) / (1 + main move)) over 5m, 1h and 24h.
 * A beta a band behind the main this hour is one the maker would buy; a band ahead, one it would trim. */
const SCAN_SECS = 60, SCAN_MAINS = 20;
const BOARDS = { trending: '/tokens/v2/toptrending/1h?limit=100', traded: '/tokens/v2/toptraded/1h?limit=100', organic: '/tokens/v2/toporganicscore/1h?limit=100', hot: '/tokens/v2/toptrending/5m?limit=100' };
async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } } })); return out; }
const moveGap = (b, m) => b == null || m == null || b <= -100 || m <= -100 ? null : +(Math.log((1 + b / 100) / (1 + m / 100)) * 100).toFixed(1);
const isPump = t => t && (t.launchpad === 'pump.fun' || /pump$/.test(t.id || ''));
async function buildScan(prev) {
  const t0 = Date.now(), src = { jupiter: { ok: 0, fail: 0 }, dexscreener: { ok: 0, fail: 0 }, solana: { ok: 0, fail: 0 } };
  const tick = (k, ok) => { src[k][ok ? 'ok' : 'fail']++; };
  const chain = ingest().catch(e => { tick('solana', 0); console.error('ingest', e.message); });
  // 1. the mains: every pump.fun runner on Jupiter's boards right now
  const by = new Map();
  await Promise.all(Object.entries(BOARDS).map(async ([board, path]) => {
    try {
      const j = await getJson(JUP + path, {}, 9000); tick('jupiter', 1);
      for (const t of (Array.isArray(j) ? j : [])) {
        if (!t || !t.id || STABLE.test(t.symbol || '') || !isPump(t)) continue;
        const v = jupShape(t); if (v.mc < 100000 || v.liq < 10000) continue;
        const have = by.get(v.mint); if (have) { have.boards.push(board); continue; }
        by.set(v.mint, { ...v, boards: [board] });
      }
    } catch (e) { tick('jupiter', 0); }
  }));
  if (!by.size) throw http(502, 'Jupiter\'s boards did not answer. The scanner retries in a minute.');
  const mains = [...by.values()].sort((a, b) => (b.boards.length - a.boards.length) || ((b.vol1h || 0) - (a.vol1h || 0))).slice(0, SCAN_MAINS);
  const mainSet = new Set(mains.map(m => m.mint));
  // 2. every coin carrying each main's name, from Jupiter and Dexscreener
  const crowds = mains.map(m => ({ m, keys: keysOf(m), by: new Map() }));
  const add = (cr, c, from) => {
    if (!c || !c.mint || c.mint === cr.m.mint || mainSet.has(c.mint) || STABLE.test(c.symbol || '') || c.mint === SOL) return;
    if (!hitKey(c, cr.keys)) return;
    const prevC = cr.by.get(c.mint);
    if (prevC) { prevC.src = [...new Set([...prevC.src, from])]; for (const f of ['mc', 'liq', 'image', 'ch5m', 'ch1h', 'ch24', 'created', 'vol1h', 'holders']) if (prevC[f] == null || prevC[f] === 0) prevC[f] = c[f]; return; }
    cr.by.set(c.mint, { ...c, src: [from] });
  };
  await pool(crowds.filter(c => c.keys.length), 6, async cr => {
    const k = cr.keys[0];
    await Promise.all([
      getJson(JUP + '/tokens/v2/search?query=' + encodeURIComponent(k), {}, 7000).then(j => { tick('jupiter', 1); (Array.isArray(j) ? j : []).forEach(t => add(cr, jupShape(t), 'jupiter')); }).catch(() => tick('jupiter', 0)),
      getJson(DEX + '/latest/dex/search?q=' + encodeURIComponent(k), {}, 7000).then(d => { tick('dexscreener', 1); for (const p of (d.pairs || [])) if (p.chainId === 'solana') add(cr, shape(p), 'dexscreener'); }).catch(() => tick('dexscreener', 0)),
    ]);
  });
  // 3. launches read from Solana in the last day, before anyone has indexed them
  let creates1h = null;
  try {
    await Promise.race([chain, new Promise(r => setTimeout(r, 9000))]);
    const pats = [...new Set(crowds.flatMap(c => c.keys.filter(k => k.length >= 3)))].map(k => '%' + k + '%');
    const st = (await db()`SELECT count(*) FILTER (WHERE t > now() - interval '1 hour')::int AS h1 FROM tm_creates`)[0]; creates1h = st ? st.h1 : null;
    if (pats.length) {
      const rows = await db()`SELECT mint, name, symbol, uri, img, t FROM tm_creates WHERE (ns LIKE ANY(${pats}) OR nn LIKE ANY(${pats})) AND t > now() - interval '24 hours' ORDER BY t DESC LIMIT 300`;
      const info = await jupInfo(rows.map(r => r.mint));
      for (const r of rows) {
        const j = info[r.mint]; const c = j ? { ...j } : { mint: r.mint, symbol: r.symbol, name: r.name, image: r.img && r.img !== '-' ? r.img : null, mc: 0, liq: 0, price: 0 };
        c.created = c.created || new Date(r.t).toISOString();
        for (const cr of crowds) add(cr, c, 'solana');
      }
    }
    tick('solana', 1);
  } catch (e) { tick('solana', 0); }
  // 4. where every beta sits against its main right now
  const prevMains = new Map(((prev && prev.mains) || []).map(m => [m.mint, new Set((m.all || []).concat((m.betas || []).map(b => b.mint)))]));
  let totB = 0, totT = 0, totBehind = 0, totAhead = 0;
  const out = crowds.map(({ m, keys, by: crowd }) => {
    const mt = m.created ? new Date(m.created).getTime() : null, pm = prevMains.get(m.mint);
    let list = [...crowd.values()].filter(c => ((c.liq || 0) >= 300 || (c.mc || 0) >= 4000 || c.src.includes('solana')) && !((c.mc || 0) > (m.mc || 0)));
    list.forEach(c => {
      c.g5m = moveGap(c.ch5m, m.ch5m); c.g1h = moveGap(c.ch1h, m.ch1h); c.g24 = moveGap(c.ch24, m.ch24);
      c.tradeable = (c.liq || 0) >= MIN_LIQ; c.copy = norm(c.symbol) === norm(m.symbol);
      c.state = c.g1h == null ? null : c.g1h <= -DEFAULTS.band ? 'behind' : c.g1h >= DEFAULTS.band ? 'ahead' : 'step';
      const t = c.created ? new Date(c.created).getTime() : null; c.after = mt && t ? Math.round((t - mt) / 60000) : null; c.age = t ? Math.round((Date.now() - t) / 60000) : null;
      c.isNew = !!(pm && !pm.has(c.mint));
    });
    list.sort((a, b) => (b.tradeable - a.tradeable) || ((b.liq || 0) - (a.liq || 0)) || ((b.mc || 0) - (a.mc || 0)));
    const tr = list.filter(c => c.tradeable), behind = tr.filter(c => c.state === 'behind').length, ahead = tr.filter(c => c.state === 'ahead').length;
    totB += list.length; totT += tr.length; totBehind += behind; totAhead += ahead;
    const ages = list.map(c => c.age).filter(a => a != null);
    return {
      mint: m.mint, symbol: m.symbol, name: m.name, image: m.image, mc: m.mc, liq: m.liq, price: m.price, ch5m: m.ch5m, ch1h: m.ch1h, ch24: m.ch24, vol1h: m.vol1h, vol24: m.vol24, holders: m.holders, organic: m.organic, created: m.created, bonded: m.bonded, boards: m.boards, keys,
      isNew: !!(prev && prev.mains && !prevMains.has(m.mint)),
      n: list.length, tradeable: tr.length, behind, ahead, step: tr.length - behind - ahead, fresh: ages.filter(a => a <= 360).length, newest: ages.length ? Math.min(...ages) : null,
      depth: tr.reduce((x, c) => x + (c.liq || 0), 0), pick: tr.slice(0, MAX_BETAS).map(c => c.mint),
      betas: list.slice(0, 24).map(c => ({ mint: c.mint, symbol: c.symbol, name: c.name, image: c.image, mc: c.mc, liq: c.liq, ch5m: c.ch5m, ch1h: c.ch1h, ch24: c.ch24, g5m: c.g5m, g1h: c.g1h, g24: c.g24, state: c.state, tradeable: c.tradeable, copy: c.copy, after: c.after, age: c.age, src: c.src, isNew: c.isNew })),
      all: list.map(c => c.mint).slice(0, 200),
    };
  });
  const n = ((prev && prev.n) || 0) + 1;
  return { at: Date.now(), n, took: Date.now() - t0, every: SCAN_SECS, band: DEFAULTS.band, minLiq: MIN_LIQ, mains: out, totals: { mains: out.length, betas: totB, tradeable: totT, behind: totBehind, ahead: totAhead, creates1h }, src };
}
async function scan() {
  const row = (await db()`SELECT v, extract(epoch FROM now() - at) AS age FROM tm_cache WHERE k='scan'`)[0];
  if (row && row.age < SCAN_SECS) return row.v;
  const claim = await db()`INSERT INTO tm_cache (k, v, at) VALUES ('scanlock', '{}'::jsonb, now()) ON CONFLICT (k) DO UPDATE SET at=now() WHERE tm_cache.at < now() - interval '40 seconds' RETURNING k`;
  if (!claim.length && row) return row.v;   // another request is building the next scan; the last one is still fresh enough
  try {
    const v = await buildScan(row && row.v);
    await db()`INSERT INTO tm_cache (k, v, at) VALUES ('scan', ${JSON.stringify(v)}, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`;
    db()`UPDATE tm_cache SET at = now() - interval '1 hour' WHERE k='scanlock'`.catch(() => { });
    return v;
  } catch (e) { if (row) return row.v; throw e; }
}

/* ---------------- swaps (Jupiter), signed by the maker ---------------- */
async function quote(input, output, amountRaw, bps) {
  const p = new URLSearchParams({ inputMint: input, outputMint: output, amount: String(amountRaw), slippageBps: String(bps), restrictIntermediateTokens: 'true' });
  const r = await timed(10000)(JUP + '/swap/v1/quote?' + p); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw http(400, j.error || 'No route.'); return j;
}
async function swapAs(kp, q) {
  const r = await timed(12000)(JUP + '/swap/v1/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: 'high' } } }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.swapTransaction) throw http(400, j.error || 'Could not build the swap.');
  const tx = VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, 'base64')); tx.sign([kp]);
  return sendSigned(tx);
}
async function latestHash() { return (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }], x => x && x.value)).value.blockhash; }
async function transferSol(kp, to, lamports) {
  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: await latestHash() }).add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(to), lamports }));
  tx.sign(kp); return sendSigned(tx);
}
async function closeEmpty(kp, accounts) {   // empty token accounts give their rent back to the maker
  if (!accounts.length) return null;
  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: await latestHash() });
  for (const a of accounts.slice(0, 8)) tx.add(new TransactionInstruction({ programId: new PublicKey(a.program), keys: [{ pubkey: new PublicKey(a.pubkey), isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: true, isWritable: false }], data: Buffer.from([9]) }));
  tx.sign(kp); return sendSigned(tx);
}

/* ---------------- the engine: one pass for one team ---------------- */
function settingsOf(s) {
  const o = { ...DEFAULTS };
  for (const k in LIMITS) if (s && s[k] != null && isFinite(Number(s[k]))) o[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], Number(s[k])));
  return o;
}
async function trade(t, kp, side, mint, amountRaw, sym, reason, s, px, dec) {
  const input = side === 'buy' ? SOL : mint, output = side === 'buy' ? mint : SOL;
  let q; try { q = await quote(input, output, amountRaw, Math.round(s.slippage)); } catch (e) { await event(t.id, 'skip', `No route to ${side} $${sym}: ${e.message}`); return null; }
  const impact = Number(q.priceImpactPct || 0) * 100;
  if (impact > s.impact) { await event(t.id, 'skip', `Skipped ${side} $${sym}: price impact ${impact.toFixed(2)}% is above the ${s.impact}% limit.`); return null; }
  const r = await swapAs(kp, q);
  const sol = (side === 'buy' ? Number(q.inAmount) : Number(q.outAmount)) / 1e9, tokens = (side === 'buy' ? Number(q.outAmount) : Number(q.inAmount)) / 10 ** dec;
  await db()`INSERT INTO tm_trades (team, side, mint, sym, sol, tokens, usd, sig, status, reason) VALUES (${t.id}, ${side}, ${mint}, ${sym}, ${sol}, ${tokens}, ${tokens * (px || 0)}, ${r.sig}, ${r.status}, ${reason})`;
  return r;
}
// the gap of each beta: how far it is from the main since the team went live (log of the two moves)
const gapOf = (pb, ab, pm, am) => (pb && ab && pm && am) ? Math.log((pb / ab) / (pm / am)) : 0;
async function pass(t) {
  const s = settingsOf(t.settings), kp = unseal(t.enc), me = kp.publicKey.toBase58(), betas = t.betas || [], an = t.anchors || {}, t0 = Date.now();
  const px = await prices([t.main_mint, ...betas.map(b => b.mint), SOL]); const pm = px[t.main_mint], psol = px[SOL] || 0;
  if (!pm && t.status !== 'closing') { await event(t.id, 'skip', `No price for the main $${t.main.symbol} this pass.`); await db()`UPDATE tm_teams SET next_pass=now() + interval '60 seconds' WHERE id=${t.id}`; return { ok: false }; }
  const h = await holdings(me), bag = m => h.tokens[m] || { ui: 0, raw: 0n, dec: 6, accounts: [] };
  const gaps = {}; let value = h.sol * psol;
  for (const b of betas) { const g = bag(b.mint); value += g.ui * (px[b.mint] || 0); gaps[b.mint] = +gapOf(px[b.mint], (an.betas || {})[b.mint], pm, an.main).toFixed(5); if (!isFinite(gaps[b.mint])) gaps[b.mint] = 0; }
  const pxs = {}; for (const b of betas) pxs[b.mint] = px[b.mint] || null;
  await db()`INSERT INTO tm_samples (team, pm, gaps, px, sol, value) VALUES (${t.id}, ${pm || null}, ${JSON.stringify(gaps)}, ${JSON.stringify(pxs)}, ${h.sol}, ${value})`;
  const holds = {}; for (const b of betas) holds[b.mint] = bag(b.mint).ui;
  const last = { pm, psol, gaps, px: pxs, sol: h.sol, holds, value, at: Date.now() };

  if (t.status === 'closing') {   // withdraw: sell every beta, give empty accounts back, send every lamport home
    const left = betas.find(b => bag(b.mint).raw > 0n);
    if (left) { const g = bag(left.mint); await trade(t, kp, 'sell', left.mint, g.raw, left.symbol, 'withdraw', { ...s, impact: 25, slippage: 1500 }, px[left.mint], g.dec); }
    else {
      const empty = Object.values(h.tokens).filter(x => x.raw === 0n).flatMap(x => x.accounts.map(p => ({ pubkey: p, program: x.program })));
      if (empty.length) { await closeEmpty(kp, empty).catch(() => { }); }
      else {
        const lamports = h.lamports - 5000;
        if (lamports > 0) { const r = await transferSol(kp, t.owner, lamports); await event(t.id, 'withdraw', `Sent ${(lamports / 1e9).toFixed(4)} SOL to the owner. ${r.sig}`); }
        await db()`UPDATE tm_teams SET status='closed', last=${JSON.stringify(last)} WHERE id=${t.id}`; return { ok: true, closed: true };
      }
    }
    await db()`UPDATE tm_teams SET last=${JSON.stringify(last)}, next_pass=now() + interval '20 seconds' WHERE id=${t.id}`;
    return { ok: true, closing: true };
  }

  const ladders = { ...(t.ladders || {}) }, did = [], band = s.band / 100;
  if (!t.paused) {
    // the beta furthest from the main goes first
    const order = betas.filter(b => px[b.mint]).sort((a, b) => Math.abs(gaps[b.mint]) - Math.abs(gaps[a.mint]));
    for (const b of order) {
      // ladders are signed: -3 means three steps traded while behind, +2 two steps traded while ahead
      const gap = gaps[b.mint], level = Math.floor(Math.abs(gap) / band), sg = gap < 0 ? -1 : 1;
      let lad = ladders[b.mint] || 0; if (lad && Math.sign(lad) !== sg) lad = 0; lad = Math.abs(lad);
      if (level === 0) { ladders[b.mint] = 0; continue; }
      if (level < lad - 1) { ladders[b.mint] = sg * (level + 1); continue; }
      if (level <= lad) { ladders[b.mint] = sg * lad; continue; }
      if (did.length >= MAX_TRADES_PER_PASS || Date.now() - t0 > 12000) break;   // the rest wait for the next pass
      const why = `$${b.symbol} is ${(Math.abs(gap) * 100).toFixed(1)}% ${gap < 0 ? 'behind' : 'ahead of'} $${t.main.symbol}`;
      if (gap < 0) {
        // behind the main: buy it
        const hh = did.length ? await holdings(me) : h, working = Math.min(hh.sol, MAX_SOL) - RESERVE, solIn = Math.min(s.maxTrade, working * s.buy / 100);
        if (solIn >= 0.004) { const r = await trade(t, kp, 'buy', b.mint, Math.floor(solIn * 1e9), b.symbol, `buy the beta · ${why}`, s, px[b.mint], bag(b.mint).dec || b.decimals || 6); if (r) did.push(r); }
        else await event(t.id, 'skip', `Wanted to buy $${b.symbol} but the maker is out of free SOL.`);
      } else {
        // ahead of the main: trim it
        const g = bag(b.mint);
        if (s.trim > 0 && g.raw > 0n && g.ui * (px[b.mint] || 0) > 0.5) { const raw = g.raw * BigInt(Math.round(s.trim)) / 100n; if (raw > 0n) { const r = await trade(t, kp, 'sell', b.mint, raw, b.symbol, `trim the beta · ${why}`, s, px[b.mint], g.dec); if (r) did.push(r); } }
      }
      ladders[b.mint] = sg * level;
    }
  }
  await db()`UPDATE tm_teams SET ladders=${JSON.stringify(ladders)}, last=${JSON.stringify(last)}, last_pass=now(), next_pass=now() + make_interval(secs => ${Math.round(s.cooldown * 60)}) WHERE id=${t.id}`;
  return { ok: true, trades: did.length, gaps };
}
async function runDue(max = 2, budget = 20000) {
  const t0 = Date.now(), done = [];
  for (let i = 0; i < max && Date.now() - t0 < budget; i++) {
    const t = (await db()`UPDATE tm_teams SET next_pass = now() + interval '75 seconds' WHERE id = (SELECT id FROM tm_teams WHERE status IN ('live','closing') AND next_pass <= now() ORDER BY next_pass ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)[0];
    if (!t) break;
    try { done.push({ id: Number(t.id), ...(await pass(t)) }); } catch (e) { console.error('pass', t.id, e.message); await event(t.id, 'error', 'Engine pass failed: ' + e.message); done.push({ id: Number(t.id), error: e.message }); }
  }
  return done;
}
async function runSafe() { try { return await runDue(1, 15000); } catch (e) { console.error('engine', e.message); return []; } }

/* ---------------- what the page sees ---------------- */
const pub = t => ({
  id: Number(t.id), owner: short(t.owner), ownerFull: t.owner, main: t.main, betas: t.betas, treasury: t.treasury, settings: settingsOf(t.settings),
  status: t.status, paused: t.paused, anchors: t.anchors, ladders: t.ladders, next: t.next_pass, lastPass: t.last_pass, last: t.last, created: t.created,
});
const R = {};
R['GET config'] = async () => ({ defaults: DEFAULTS, limits: LIMITS, maxSol: MAX_SOL, minFund: MIN_FUND, reserve: RESERVE, minLiq: MIN_LIQ, maxBetas: MAX_BETAS });
R['GET nonce'] = async ({ q, req }) => {
  const wallet = String(q.wallet || ''); if (!B58.test(wallet)) throw http(400, 'Bad wallet.');
  limit('n:' + wallet, 8, 60e3);
  const nonce = b64u(crypto.randomBytes(12)), host = String(req.headers['x-forwarded-host'] || req.headers.host || 'team').replace(/[^\w.:-]/g, '').slice(0, 80);
  const text = `${host} wants you to sign in with your Solana account:\n${wallet}\n\nSign in to TEAM. This is a free signature, not a transaction. It cannot move anything.\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
  await db()`INSERT INTO tm_nonces (nonce, wallet, text) VALUES (${nonce}, ${wallet}, ${text})`;
  db()`DELETE FROM tm_nonces WHERE at < now() - interval '1 day'`.catch(() => { });
  return { nonce, message: text };
};
R['POST login'] = async ({ b }) => {
  const wallet = String(b.wallet || ''); if (!B58.test(wallet)) throw http(400, 'Bad wallet.');
  const row = (await db()`SELECT * FROM tm_nonces WHERE nonce=${String(b.nonce || '')} AND wallet=${wallet} AND used=false AND at > now() - interval '10 minutes'`)[0];
  if (!row) throw http(401, 'That sign-in expired. Try again.');
  let sig; try { sig = /^[1-9A-HJ-NP-Za-km-z]+$/.test(b.sig || '') ? b58dec(b.sig) : Buffer.from(String(b.sig || ''), 'base64'); } catch (e) { throw http(400, 'Bad signature.'); }
  const msg = b.msg ? Buffer.from(String(b.msg), 'base64') : Buffer.from(row.text, 'utf8');
  if (!msg.toString('utf8').includes(row.text)) throw http(401, 'The signed message does not match.');
  if (!verifySig(wallet, msg, sig)) throw http(401, 'The signature does not match this wallet.');
  if (!(await db()`UPDATE tm_nonces SET used=true WHERE nonce=${row.nonce} AND used=false RETURNING nonce`).length) throw http(401, 'That sign-in was already used.');
  return { token: issue(wallet), wallet };
};
R['GET coin'] = async ({ q }) => coin(String(q.ca || '').trim());
R['GET mains'] = async ({ q }) => mainsOf(MAINS[q.tab] ? q.tab : 'trending');
R['GET betas'] = async ({ q }) => betasOf(q.q || q.main);
R['GET fresh'] = async () => freshBetas();
R['GET scan'] = async () => { const v = await scan(); const lite = { ...v, mains: v.mains.map(m => { const { all, ...rest } = m; return rest; }) }; return lite; };
// the lab: the main and its betas on the same real candles
R['GET lab'] = async ({ q }) => {
  const main = String(q.main || '').trim(), tf = TF[q.tf] ? q.tf : '15m';
  const bs = [...new Set(String(q.betas || '').split(',').map(x => x.trim()).filter(x => B58.test(x) && x !== main))].slice(0, MAX_BETAS);
  if (!B58.test(main) || !bs.length) throw http(400, 'Pick a main and at least one beta.');
  const infos = await Promise.all([main, ...bs].map(m => coin(m).catch(() => null)));
  if (!infos[0]) throw http(404, 'No market for that main.');
  const mc = await candles(main, tf); if (mc.length < 10) throw http(404, 'Not enough candles for the main yet.');
  const ok = [], series = [];
  for (let i = 0; i < bs.length; i++) { try { const c = await candles(bs[i], tf); if (c.length >= 6 && infos[i + 1]) { ok.push(infos[i + 1]); series.push(c); } } catch (e) { } }
  if (!ok.length) throw http(404, 'None of those betas has candles yet.');
  const rows = alignMany(mc, series); if (rows.length < 10) throw http(404, 'Not enough shared history yet.');
  return { main: infos[0], betas: ok, tf, rows, follow: ok.map((_, k) => corrCols(rows, 1, k + 2)) };
};
R['POST create'] = async ({ b, me }) => {
  if (!me) throw http(401, 'Connect a wallet first.');
  limit('c:' + me, 4, 3600e3, 'Four new teams an hour is the limit.');
  const main = String(b.main || '').trim(), bs = [...new Set((Array.isArray(b.betas) ? b.betas : []).map(x => String(x).trim()))].filter(x => B58.test(x) && x !== main);
  if (!B58.test(main)) throw http(400, 'Pick the main.');
  if (!bs.length || bs.length > MAX_BETAS) throw http(400, `Pick between 1 and ${MAX_BETAS} betas.`);
  const M = await coin(main), B = [];
  for (const m of bs) { const c = await coin(m); if ((c.liq || 0) < MIN_LIQ) throw http(400, `$${c.symbol} has only $${c.liq} of liquidity. A beta needs at least $${MIN_LIQ} to be traded.`); B.push({ mint: c.mint, symbol: c.symbol, name: c.name, image: c.image, decimals: c.decimals, program: c.program }); }
  const kp = Keypair.generate(), s = settingsOf(b.settings);
  const mainLite = { mint: M.mint, symbol: M.symbol, name: M.name, image: M.image, decimals: M.decimals };
  const r = await db()`INSERT INTO tm_teams (owner, main_mint, main, betas, treasury, enc, settings) VALUES (${me}, ${main}, ${JSON.stringify(mainLite)}, ${JSON.stringify(B)}, ${kp.publicKey.toBase58()}, ${JSON.stringify(seal(kp.secretKey))}, ${JSON.stringify(s)}) RETURNING id, treasury`;
  await event(r[0].id, 'create', `Team created: $${M.symbol} with ${B.map(x => '$' + x.symbol).join(', ')}, by ${short(me)}.`);
  return { id: Number(r[0].id), treasury: r[0].treasury, settings: s };
};
R['POST funded'] = async ({ b, me }) => {
  if (!me) throw http(401, 'Connect a wallet first.');
  const t = (await db()`SELECT * FROM tm_teams WHERE id=${parseInt(b.id, 10)} AND owner=${me}`)[0]; if (!t) throw http(404, 'No such team.');
  if (t.status !== 'pending') return { ok: true, status: t.status };
  const h = await holdings(t.treasury); if (h.sol < MIN_FUND) throw http(409, `The maker holds ${h.sol.toFixed(4)} SOL. Send at least ${MIN_FUND} SOL to start it.`);
  const px = await prices([t.main_mint, ...t.betas.map(x => x.mint)]); if (!px[t.main_mint]) throw http(502, 'No live price for the main. Try again in a moment.');
  const an = { main: px[t.main_mint], betas: {} }; for (const x of t.betas) if (px[x.mint]) an.betas[x.mint] = px[x.mint];
  await db()`UPDATE tm_teams SET status='live', anchors=${JSON.stringify(an)}, ladders='{}'::jsonb, next_pass=now() + interval '20 seconds' WHERE id=${t.id}`;
  await event(t.id, 'live', `Funded with ${h.sol.toFixed(4)} SOL. The team is live.`);
  return { ok: true, status: 'live', sol: h.sol };
};
R['GET teams'] = async ({ q }) => {
  await runSafe();
  const mine = B58.test(String(q.owner || '')) ? q.owner : null;
  const rows = mine ? await db()`SELECT * FROM tm_teams WHERE owner=${mine} ORDER BY id DESC LIMIT 60` : await db()`SELECT * FROM tm_teams WHERE status IN ('live','closing') ORDER BY id DESC LIMIT 60`;
  const ids = rows.map(r => r.id), tr = ids.length ? await db()`SELECT team, count(*)::int AS n, coalesce(sum(sol), 0) AS vol FROM tm_trades WHERE team = ANY(${ids}) GROUP BY team` : [];
  const vs = ids.length ? await db()`SELECT team, array_agg(value ORDER BY at) AS v FROM (SELECT team, value, at, row_number() OVER (PARTITION BY team ORDER BY at DESC) AS rn FROM tm_samples WHERE team = ANY(${ids})) x WHERE rn <= 40 GROUP BY team` : [];
  return { teams: rows.map(t => { const x = tr.find(y => String(y.team) === String(t.id)) || {}; return { ...pub(t), trades: x.n || 0, volume: Number(x.vol || 0), spark: ((vs.find(y => String(y.team) === String(t.id)) || {}).v || []).map(Number) }; }) };
};
R['GET team'] = async ({ q }) => {
  await runSafe();
  const id = parseInt(q.id, 10), t = (await db()`SELECT * FROM tm_teams WHERE id=${id}`)[0]; if (!t) throw http(404, 'No such team.');
  const [samples, trades, events] = await Promise.all([
    db()`SELECT extract(epoch FROM at)*1000 AS t, pm, gaps, px, sol, value FROM tm_samples WHERE team=${id} ORDER BY at DESC LIMIT 400`,
    db()`SELECT side, mint, sym, sol, tokens, usd, sig, status, reason, at FROM tm_trades WHERE team=${id} ORDER BY at DESC LIMIT 80`,
    db()`SELECT kind, note, at FROM tm_events WHERE team=${id} ORDER BY at DESC LIMIT 60`,
  ]);
  let live = null; try { live = await cached('hold:' + t.treasury, 15, async () => { const h = await holdings(t.treasury); const o = { sol: h.sol, bags: {} }; for (const b of t.betas) o.bags[b.mint] = (h.tokens[b.mint] || {}).ui || 0; return o; }); } catch (e) { }
  return { team: pub(t), live, samples: samples.reverse().map(s => ({ t: Number(s.t), pm: s.pm, gaps: s.gaps, px: s.px, sol: s.sol, value: s.value })), trades, events };
};
async function mine(b, me) {
  if (!me) throw http(401, 'Connect a wallet first.');
  const t = (await db()`SELECT * FROM tm_teams WHERE id=${parseInt(b.id, 10)}`)[0]; if (!t) throw http(404, 'No such team.');
  if (t.owner !== me) throw http(403, 'Only the owner can steer this team.'); return t;
}
R['POST settings'] = async ({ b, me }) => {
  const t = await mine(b, me); const s = settingsOf({ ...t.settings, ...(b.settings || {}) });
  await db()`UPDATE tm_teams SET settings=${JSON.stringify(s)} WHERE id=${t.id}`;
  await event(t.id, 'settings', `Rules: band ${s.band}% · buy ${s.buy}% · trim ${s.trim}% · every ${s.cooldown}m · max ${s.maxTrade} SOL · impact ≤ ${s.impact}%`);
  return { ok: true, settings: s };
};
R['POST pause'] = async ({ b, me }) => {
  const t = await mine(b, me); const p = !!b.paused;
  await db()`UPDATE tm_teams SET paused=${p} WHERE id=${t.id}`; await event(t.id, p ? 'pause' : 'resume', p ? 'Paused by the owner.' : 'Resumed by the owner.');
  return { ok: true, paused: p };
};
R['POST reanchor'] = async ({ b, me }) => {
  const t = await mine(b, me); const px = await prices([t.main_mint, ...t.betas.map(x => x.mint)]); if (!px[t.main_mint]) throw http(502, 'No live price right now.');
  const an = { main: px[t.main_mint], betas: {} }; for (const x of t.betas) if (px[x.mint]) an.betas[x.mint] = px[x.mint];
  await db()`UPDATE tm_teams SET anchors=${JSON.stringify(an)}, ladders='{}'::jsonb WHERE id=${t.id}`; await event(t.id, 'anchor', 'The owner reset the kickoff to today\'s prices.');
  return { ok: true };
};
R['POST withdraw'] = async ({ b, me }) => {
  const t = await mine(b, me); if (t.status === 'closed') throw http(409, 'Already closed.');
  await db()`UPDATE tm_teams SET status='closing', next_pass=now() WHERE id=${t.id}`;
  await event(t.id, 'closing', 'The owner asked for everything back: selling every beta, then sending all SOL home.');
  const done = await runDue(1, 18000).catch(() => []);
  return { ok: true, status: 'closing', done };
};
R['GET tick'] = async () => { const [sc, done] = await Promise.all([scan().then(v => ({ n: v.n, mains: v.mains.length })).catch(e => ({ error: e.message })), runDue(3, 20000)]); return { at: Date.now(), done, scan: sc }; };
R['GET stats'] = async () => cached('stats', 20, async () => {
  const s = db();
  const t = (await s`SELECT count(*) FILTER (WHERE status='live')::int AS live, count(*)::int AS all FROM tm_teams`)[0];
  const tr = (await s`SELECT count(*)::int AS n, coalesce(sum(sol), 0) AS vol, count(*) FILTER (WHERE at > now() - interval '24 hours')::int AS d FROM tm_trades`)[0];
  const v = (await s`SELECT coalesce(sum((last->>'value')::float), 0) AS v, coalesce(sum(jsonb_array_length(betas)), 0)::int AS b FROM tm_teams WHERE status IN ('live','closing')`)[0];
  const feed = await s`SELECT t.side, t.sym, t.sol, t.sig, t.at, w.main->>'symbol' AS main, w.id FROM tm_trades t JOIN tm_teams w ON w.id = t.team ORDER BY t.at DESC LIMIT 20`;
  return { live: t.live, all: t.all, betas: v.b, trades: tr.n, trades24: tr.d, volume: Number(tr.vol), managed: Number(v.v), feed };
});
R['POST rpc'] = async ({ b }) => {
  const ok = ['getSignatureStatuses', 'sendTransaction', 'getBalance', 'getLatestBlockhash', 'getTokenAccountsByOwner'];
  if (!ok.includes(b.method)) throw http(400, 'Not allowed.');
  return { result: await rpc(b.method, Array.isArray(b.params) ? b.params : []) };
};

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = String((req.query && req.query.__p) || url.searchParams.get('__p') || url.pathname.replace(/^\/api\/?/, '')).replace(/^\/+|\/+$/g, '');
  const q = Object.fromEntries(url.searchParams);
  const key = `${req.method} ${path}`, fn = R[key];
  if (!fn) return send(res, 404, { ok: false, error: 'No such endpoint.' });
  try {
    if (!['GET config', 'POST rpc'].includes(key)) await ensure();
    const b = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await fn({ q, b, req, me: who(req) }));
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) console.error(key, e);
    send(res, code, Object.assign({ ok: false, error: code === 500 ? 'Something broke on our side. Try again.' : e.message }, e.extra || {}));
  }
};
module.exports._t = { corrCols, alignMany, settingsOf, seal, unseal, keysOf, hitKey, gapOf, parseCreate };
