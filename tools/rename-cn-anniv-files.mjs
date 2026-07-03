#!/usr/bin/env node
/**
 * SCN95 — Rename CN Anniversary card files to the lang-aware schema.
 *
 * Existing files in public/cn-anniv/ use a pageless pattern:
 *   anniv1_01.jpeg → 1st-anniversary card 01
 *   anniv2_15.jpeg → 2nd-anniversary card 15
 *   anniv3_08.jpeg → 3rd-anniversary card 08
 *
 * Target schema:
 *   cn_cn-1anv-001_anniv-promo_<name>_char.jpeg
 *
 * Without per-card name metadata in the catalog yet, we use the synthCode
 * suffix as the name part. Once the catalog gets character-labeled (via the
 * same Haiku-vision pass that labelled the DON catalog), re-run this script
 * and the names will populate automatically.
 *
 * USAGE:
 *   node tools/rename-cn-anniv-files.mjs --dry-run
 *   node tools/rename-cn-anniv-files.mjs
 *   node tools/rename-cn-anniv-files.mjs --delete-old
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugifyPart } from './_filename-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'api', '_cn-anniv-catalog.json');
const FILES_DIR    = join(ROOT, 'public', 'cn-anniv');

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const DELETE_OLD = args.includes('--delete-old');

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
const items = catalog.items || [];

console.log(`SCN95 — rename CN-anniv files`);
console.log(`  catalog: ${CATALOG_PATH}`);
console.log(`  files:   ${FILES_DIR}`);
console.log(`  dry-run: ${DRY_RUN}`);
console.log(`  delete-old: ${DELETE_OLD}`);
console.log();

let renamed = 0;
let skipped = 0;
let missing = 0;

for (const item of items) {
  const oldUrl = item.imageUrl;
  if (!oldUrl) { skipped += 1; continue; }
  const oldBasename = oldUrl.split('/').pop();
  const oldPath = join(FILES_DIR, oldBasename);
  if (!existsSync(oldPath)) {
    missing += 1;
    continue;
  }

  const lang = 'cn';
  // synthCode like "CN-1ANV-001" — lowercase + keep dashes.
  const code = slugifyPart(item.synthCode || item.setCode || `cn-${item.anniv || 'anv'}-${String(item.idx || 0).padStart(3, '0')}`);
  const rarity = 'anniv-promo';
  // Name: the catalog doesn't have it yet — use either the synthCode tail
  // or the character if a labelling pass has filled it in.
  const name = item.character
    ? slugifyPart(item.character).slice(0, 32)
    : (item.synthCode || `card-${item.idx || 0}`).split('-').pop().toLowerCase();
  const type = 'char';

  const newName = `${lang}_${code}_${rarity}_${name}_${type}.jpeg`;

  if (oldBasename === newName) {
    skipped += 1;
    continue;
  }

  const newPath = join(FILES_DIR, newName);
  console.log(`${oldBasename}  →  ${newName}`);
  if (!DRY_RUN) {
    copyFileSync(oldPath, newPath);
    item.imageUrl = `/cn-anniv/${newName}`;
    item._renamedFrom = oldUrl;
    if (DELETE_OLD) unlinkSync(oldPath);
  }
  renamed += 1;
}

if (!DRY_RUN) {
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`\n✓ catalog updated`);
}

console.log(`\nrenamed=${renamed} skipped=${skipped} missing=${missing}`);
