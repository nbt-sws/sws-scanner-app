#!/usr/bin/env node
/**
 * SCN95 — Rename DON card files to the lang-aware schema.
 *
 * Existing files in public/don-pdf-wm/ use the SCN84 pattern:
 *   eb03_don_gold_boa-hancock.jpeg
 *
 * Target schema (matches Firebase + the eBay-search flow):
 *   {lang}_{set-code}_{rarity-slug}_{name}_{type}.jpeg
 *   e.g.  jp_eb03-001_don-gold_boa-hancock_don.jpeg
 *
 * All DON cards are Japanese (DON!! pool is JP-only at the Bandai level),
 * so the lang prefix is hardcoded to `jp` for this catalog.
 *
 * USAGE:
 *   node tools/rename-don-files-v2.mjs --dry-run
 *   node tools/rename-don-files-v2.mjs           # copy old → new, keep both
 *   node tools/rename-don-files-v2.mjs --delete-old   # remove legacy files
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFilename, slugifyPart, donVariantToSlug,
} from './_filename-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'api', '_don-pdf-catalog.json');
const FILES_DIR    = join(ROOT, 'public', 'don-pdf-wm');

const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const DELETE_OLD = args.includes('--delete-old');

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));
const items = catalog.items || [];

console.log(`SCN95 — rename DON files`);
console.log(`  catalog: ${CATALOG_PATH}`);
console.log(`  files:   ${FILES_DIR}`);
console.log(`  dry-run: ${DRY_RUN}`);
console.log(`  delete-old: ${DELETE_OLD}`);
console.log();

let renamed = 0;
let skipped = 0;
let missing = 0;
const usedNames = new Map(); // newName → count, to disambiguate collisions

for (const item of items) {
  const oldUrl = item.imageUrl;
  if (!oldUrl) { skipped += 1; continue; }
  const oldBasename = oldUrl.split('/').pop();
  const oldPath = join(FILES_DIR, oldBasename);
  if (!existsSync(oldPath)) {
    missing += 1;
    continue;
  }

  // Derive the new filename. DON cards always have lang=JP.
  // Some DON entries have a real setCode (PRB-02, EB03 etc.); fall back to
  // `unknown` only when truly missing.
  const lang = 'JP';
  const setCode = item.setCode || 'don-unknown';
  // Card "code" is synthetic for DON — use setCode + page+cell suffix to
  // get a stable per-file identifier within the set.
  const code = `${setCode}-${String(item.cell || item.id || '').padStart(3, '0')}`.replace(/[^A-Za-z0-9-]/g, '');
  const raritySlug = donVariantToSlug(item.variant, item.rarity);
  const name = item.character || item.characterName || item.scene || 'don';
  const type = 'DON!!';

  // buildFilename wants the canonical rarity; we want the DON slug directly,
  // so construct the name manually using the same parts the schema expects.
  let newName = [
    slugifyPart(lang) || 'jp',
    slugifyPart(code),
    raritySlug,
    slugifyPart(name).slice(0, 32) || 'don',
    'don',
  ].join('_') + '.jpeg';

  // Disambiguate collisions (e.g. multiple "regular" DON cards in same set).
  const collisionKey = newName;
  const collisions = usedNames.get(collisionKey) || 0;
  if (collisions > 0) {
    const stem = newName.replace(/\.jpeg$/, '');
    newName = `${stem}-${collisions + 1}.jpeg`;
  }
  usedNames.set(collisionKey, collisions + 1);

  // SCN97 — skip files that are already in the new schema (jp_/en_/cn_
  // prefix + 5 underscore-separated segments). Otherwise this script would
  // re-mangle filenames like `jp_eb03_don_nami_don.jpeg` into
  // `jp_eb-03-eb03regularnami_don_nami_don.jpeg` because it rebuilds the
  // schema parts from the catalog without recognising the input is already
  // canonical.
  const alreadyRenamed = /^(jp|en|cn|ae)_[^_]+_[^_]+_[^_]+_[^_]+\.(jpe?g|png|webp)$/i.test(oldBasename);
  if (alreadyRenamed || item.sourceCorrection === 'SCN97') {
    skipped += 1;
    continue;
  }
  if (oldBasename === newName) {
    skipped += 1;
    continue;
  }

  const newPath = join(FILES_DIR, newName);
  console.log(`${oldBasename}  →  ${newName}`);
  if (!DRY_RUN) {
    copyFileSync(oldPath, newPath);
    item.imageUrl = `/don-pdf-wm/${newName}`;
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
