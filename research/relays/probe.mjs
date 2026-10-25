// C-22 relay probe: does a Nostr relay do what Trystero needs? For each
// relay: read its NIP-11 information document, subscribe on one
// connection, publish one ephemeral event (kind 20000–29999, an "x" topic
// tag, signed by a brand-new key, as Trystero does on every page load) on
// a second, and time the OK and the delivery. Writes results.json.
// Each relay is tried ROUNDS times (default 3), 15 s apart, with a
// payload the size of a Trystero offer (about 1.5 KB).
//   ROUNDS=3 node research/relays/probe.mjs [wss://relay …]

import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { schnorr } from '@noble/secp256k1';
import WebSocket from 'ws';

const CANDIDATES = process.argv.slice(2).length ? process.argv.slice(2) : [
  // the current list (REQUIREMENTS, Stack)
  'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol', 'wss://offchain.pub', 'wss://nostr.bitcoiner.social', 'wss://yabu.me/v2',
  // long-running public relays, and some from Trystero 0.26.0's own default list
  'wss://relay.snort.social', 'wss://nostr.mom', 'wss://relay.nostr.bg', 'wss://nostr.oxtr.dev', 'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net', 'wss://relay.nostr.net', 'wss://relay.nos.social', 'wss://relay.0xchat.com', 'wss://relay.coinos.io',
  'wss://nostr.einundzwanzig.space', 'wss://relay.nostr.dev.br', 'wss://nostr.robosats.org', 'wss://relay.layer.systems', 'wss://cdn.satellite.earth',
];

const hex = (b) => Buffer.from(b).toString('hex');
const sha256 = (s) => createHash('sha256').update(s).digest();

async function event(kind, topic) {
  const sk = randomBytes(32);
  const pubkey = hex(schnorr.getPublicKey(sk));
  const created_at = Math.floor(Date.now() / 1000);
  const tags = [['x', topic]];
  const content = JSON.stringify({ probe: 'roslambo C-22', offerSized: hex(randomBytes(750)) });
  const id = sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]));
  const sig = hex(await schnorr.signAsync(id, sk));
  return { id: hex(id), pubkey, created_at, kind, tags, content, sig };
}

async function nip11(url) {
  try {
    const res = await fetch(url.replace(/^wss:/, 'https:'), { headers: { Accept: 'application/nostr+json' }, signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    const l = j.limitation ?? {};
    return { name: j.name ?? null, software: j.software ?? null, auth_required: l.auth_required ?? null, payment_required: l.payment_required ?? null, restricted_writes: l.restricted_writes ?? null };
  } catch (e) {
    return { error: String(e.message ?? e).slice(0, 80) };
  }
}

function open(url, ms = 8000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ws = new WebSocket(url, { handshakeTimeout: ms });
    const done = (r) => { clearTimeout(timer); resolve(r); };
    const timer = setTimeout(() => { ws.terminate(); done({ error: 'connect timeout' }); }, ms);
    ws.on('open', () => done({ ws, ms: Date.now() - t0 }));
    ws.on('error', (e) => done({ error: String(e.message).slice(0, 80) }));
  });
}

async function probe(url) {
  const out = { url, info: await nip11(url) };
  const sub = await open(url);
  const pub = await open(url);
  if (sub.error || pub.error) {
    out.error = sub.error ?? pub.error;
    sub.ws?.terminate();
    pub.ws?.terminate();
    return out;
  }
  out.connectMs = sub.ms;
  const topic = hex(randomBytes(20));
  const kind = 20000 + (randomBytes(2).readUInt16BE() % 10000);
  const subId = hex(randomBytes(8));
  const notes = [];
  const got = new Promise((resolve) => {
    sub.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m[0] === 'EVENT' && m[1] === subId) resolve(Date.now());
      else if (m[0] === 'CLOSED' || m[0] === 'NOTICE') notes.push(`${m[0]} ${m[2] ?? m[1]}`.slice(0, 120));
    });
    setTimeout(() => resolve(null), 15000);
  });
  const eose = new Promise((resolve) => {
    sub.ws.on('message', (raw) => { if (JSON.parse(String(raw))[0] === 'EOSE') resolve(true); });
    setTimeout(() => resolve(false), 4000);
  });
  sub.ws.send(JSON.stringify(['REQ', subId, { kinds: [kind], since: Math.floor(Date.now() / 1000) - 5, '#x': [topic] }]));
  out.eose = await eose;
  const ev = await event(kind, topic);
  const ok = new Promise((resolve) => {
    pub.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m[0] === 'OK' && m[1] === ev.id) resolve({ accepted: m[2], reason: m[3] ?? '' });
      else if (m[0] === 'NOTICE' || m[0] === 'AUTH') notes.push(`${m[0]} ${String(m[1]).slice(0, 100)}`);
    });
    setTimeout(() => resolve(null), 15000);
  });
  const sent = Date.now();
  pub.ws.send(JSON.stringify(['EVENT', ev]));
  const [okMsg, at] = await Promise.all([ok, got]);
  out.ok = okMsg;
  out.delivered = at !== null;
  out.deliveryMs = at === null ? null : at - sent;
  out.notes = notes;
  sub.ws.terminate();
  pub.ws.terminate();
  return out;
}

const ROUNDS = Number(process.env.ROUNDS ?? '3');
const results = [];
for (let round = 1; round <= ROUNDS; round++) {
  if (round > 1) await new Promise((r) => setTimeout(r, 15000));
  const batch = await Promise.all(CANDIDATES.map(probe));
  for (const r of batch) {
    results.push({ round, at: new Date().toISOString(), ...r });
    const verdict = r.delivered && r.ok?.accepted ? 'WORKS' : 'FAILS';
    console.log(`${round} ${verdict.padEnd(5)} ${r.url.padEnd(34)} connect ${String(r.connectMs ?? '-').padStart(5)} ms  ok ${r.ok ? `${r.ok.accepted} ${r.ok.reason}`.slice(0, 50) : (r.error ?? 'none')}  delivered ${r.delivered ? `${r.deliveryMs} ms` : 'no'} ${r.notes?.length ? r.notes.join(' / ').slice(0, 120) : ''}`);
  }
}
const summary = {};
for (const r of results) {
  const s = (summary[r.url] ??= { works: 0, of: 0, info: r.info });
  s.of++;
  if (r.delivered && r.ok?.accepted) s.works++;
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([u, s]) => [u, `${s.works}/${s.of}`])), null, 1));
writeFileSync(new URL('./results.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
