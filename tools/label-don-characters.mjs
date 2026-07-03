#!/usr/bin/env node
// tools/label-don-characters.mjs — SCN17b
// ----------------------------------------------------------------
// One-shot batch labeler: enriches api/_don-pdf-catalog.json with
// {character, isCharacterArt, scene} fields by sending each DON card
// image to Claude Haiku Vision.
//
// Run from project root:
//   node tools/label-don-characters.mjs
//
// Idempotent: skips entries that already have a character labeled.
// Saves a checkpoint after every 10 batches so it's safe to ctrl-C.
// Cost estimate: ~$0.30-1.00 one-time for ~247 cards (4 per batch).
// ----------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAT_PATH = join(ROOT, 'api', '_don-pdf-catalog.json');
const PUB_DIR  = join(ROOT, 'public');

// ─── Load API key (env or .env.local) ──────────────────────────────────────
let API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile)) {
    const env = readFileSync(envFile, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
      if (m) { API_KEY = m[1]; break; }
    }
  }
}
if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in env or .env.local');
  process.exit(1);
}

// ─── Load catalog ──────────────────────────────────────────────────────────
const catalog = JSON.parse(readFileSync(CAT_PATH, 'utf8'));
const items = catalog.items;
console.log(`loaded ${items.length} cards from catalog`);

const todo = items.filter((it) => !it.character && !it._labeledSkipped);
console.log(`${todo.length} cards need labeling (skipping ${items.length - todo.length} already done)`);
if (todo.length === 0) {
  console.log('nothing to do');
  process.exit(0);
}

// ─── Prompt builder ────────────────────────────────────────────────────────
function makePrompt(n) {
  return [
    `For each numbered DON!! card image, identify what is depicted.`,
    ``,
    `Two visual styles:`,
    `- "Symbol" DON: just the ドン symbol artwork (no character) — set character to null`,
    `- "Character art" DON: has a One Piece character drawn on it — fill in character`,
    ``,
    `Reply with a JSON array of EXACTLY ${n} objects, in image order, no markdown fences:`,
    `[{"character":"Donquixote Doflamingo","isCharacterArt":true,"scene":"3-5 word desc"},...]`,
    ``,
    `Use canonical English names (e.g. Gol D. Roger, Monkey D. Luffy, Donquixote Doflamingo, `,
    `Charlotte Linlin, Trafalgar Law, Eustass Kid, Boa Hancock, Roronoa Zoro, Vinsmoke Sanji, `,
    `Marshall D. Teach, Edward Newgate, Dracule Mihawk, Crocodile, Jinbe, Buggy, Smoker, `,
    `Portgas D. Ace, Sabo, Yamato, Kaido, Shanks, Charlotte Katakuri, Nico Robin, Nami, `,
    `Usopp, Tony Tony Chopper, Franky, Brook, Silvers Rayleigh, Kozuki Oden, Marco, `,
    `Rob Lucci, Trebol, Diamante, Pica, Donquixote Rosinante, X Drake, Jewelry Bonney, `,
    `Bartolomeo, Cavendish, Bartholomew Kuma). If unsure, character=null.`,
  ].join('\n');
}

// ─── Single Haiku call ─────────────────────────────────────────────────────
async function callHaiku(batch) {
  const content = [];
  batch.forEach((b, i) => {
    content.push({ type: 'text', text: `Card #${i + 1}:` });
    const mediaType = b.ext === 'jpeg' || b.ext === 'jpg' ? 'image/jpeg' : `image/${b.ext}`;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: b.base64 },
    });
  });
  content.push({ type: 'text', text: makePrompt(batch.length) });

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content }],
  });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  });
  if (!r.ok) {
    const errBody = (await r.text()).slice(0, 200);
    console.error(`  HTTP ${r.status}: ${errBody}`);
    return null;
  }
  const data = await r.json();
  let text = (data.content?.[0]?.text || '').trim();
  text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(text); }
  catch { console.error(`  parse failed: ${text.slice(0, 120)}`); return null; }
}

// ─── Batch loop ────────────────────────────────────────────────────────────
const BATCH = 4;
const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
console.log(`${batches.length} batches × ${BATCH} images, estimated cost $${(batches.length * 0.015).toFixed(2)}`);

function saveCatalog() {
  catalog.labeledAt = new Date().toISOString();
  writeFileSync(CAT_PATH, JSON.stringify(catalog, null, 2), 'utf8');
}

let labeled = 0;
let failed = 0;
const SAVE_EVERY = 10;
const startTs = Date.now();

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];
  const inputs = batch.map((entry) => {
    const path = join(PUB_DIR, entry.imageUrl.replace(/^\//, ''));
    const buf = readFileSync(path);
    const ext = entry.imageUrl.split('.').pop().toLowerCase();
    return { ext, base64: buf.toString('base64') };
  });
  const result = await callHaiku(inputs);
  if (Array.isArray(result) && result.length === batch.length) {
    batch.forEach((entry, i) => {
      const r = result[i] || {};
      entry.character      = (r.character || '').trim() || null;
      entry.isCharacterArt = !!r.isCharacterArt;
      entry.scene          = (r.scene || '').trim() || null;
      labeled++;
    });
  } else {
    batch.forEach((entry) => { entry._labeledSkipped = true; });
    failed += batch.length;
  }
  if ((bi + 1) % SAVE_EVERY === 0) {
    saveCatalog();
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
    console.log(`  batch ${bi + 1}/${batches.length}  labeled=${labeled} failed=${failed}  [${elapsed}s]`);
  }
  await new Promise((res) => setTimeout(res, 300));
}

saveCatalog();
console.log(`\nDONE  labeled=${labeled}/${todo.length}  failed=${failed}`);

// Top characters report
const counts = new Map();
for (const it of items) {
  const k = it.character || '<NONE>';
  counts.set(k, (counts.get(k) || 0) + 1);
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log('\nTop 25 characters:');
for (const [c, n] of top) console.log(`  ${String(n).padStart(3)}× ${c}`);
