#!/usr/bin/env node
/**
 * SCN97 — One-shot correction for the EB03 DON set.
 *
 * Issue: public/don-pdf-wm/ contains several `eb03_don_*.jpeg` files left
 * over from the SCN84 rename but never properly catalogued. Three are
 * mislabelled — Donquixote Doflamingo and Jewelry Bonney are NOT in the
 * EB03 DON pool. The actual EB03 DON set is:
 *   • Nico Robin
 *   • Boa Hancock
 *   • Nami
 *   • Uta
 *   • All 4 Girls
 * (× regular + gold parallel = 10 cards)
 *
 * What this script does:
 *   1. Delete the 3 mislabelled files (doflamingo + jewelry-bonney)
 *   2. Rename the 4 correctly-labelled files to the SCN95 schema
 *        eb03_don_gold_boa-hancock.jpeg → jp_eb03_don-gold_boa-hancock_don.jpeg
 *   3. Add catalog entries so DonVisualLookup surfaces them
 *   4. Print a list of MISSING files the user still needs to source
 *
 * USAGE:
 *   node tools/fix-eb03-don.mjs --dry-run
 *   node tools/fix-eb03-don.mjs
 */

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CAT_PATH = join(ROOT, 'api', '_don-pdf-catalog.json');
const FILES_DIR = join(ROOT, 'public', 'don-pdf-wm');
const DRY_RUN = process.argv.includes('--dry-run');

// Canonical EB03 DON pool (per user spec).
const EB03_CHARACTERS = ['nico-robin', 'boa-hancock', 'nami', 'uta', 'all-4-girls'];
const SET_NAME_JP = 'EXTRA BOOSTER｜MEMORIAL COLLECTION 【EB-03】';
const SET_NAME_EN = 'Memorial Collection';

// Files we want gone — wrong characters mis-mapped to EB03.
const MISLABELLED = [
  'eb03_don_donquixote-doflamingo.jpeg',
  'eb03_don_gold_donquixote-doflamingo.jpeg',
  'eb03_don_gold_jewelry-bonney.jpeg',
];

// Files we want renamed to the new schema. Maps oldname → { variant, character }.
const TO_RENAME = {
  'eb03_don_nami.jpeg':           { variant: 'regular', char: 'nami' },
  'eb03_don_nico-robin.jpeg':     { variant: 'regular', char: 'nico-robin' },
  'eb03_don_gold_boa-hancock.jpeg': { variant: 'gold', char: 'boa-hancock' },
  'eb03_don_gold_nico-robin.jpeg':  { variant: 'gold', char: 'nico-robin' },
};

console.log(`SCN97 — fix EB03 DON catalog + filenames`);
console.log(`  dry-run: ${DRY_RUN}`);
console.log();

// 1. Delete mislabelled files
console.log('── Deleting mislabelled files ──');
for (const f of MISLABELLED) {
  const path = join(FILES_DIR, f);
  if (!existsSync(path)) {
    console.log(`  (missing — skip)  ${f}`);
    continue;
  }
  console.log(`  ${DRY_RUN ? '[dry]' : '✗'} delete  ${f}`);
  if (!DRY_RUN) unlinkSync(path);
}

// 2. Rename correct files to new schema + collect new catalog entries
console.log('\n── Renaming correct files ──');
const newCatalogEntries = [];
let renameCount = 0;
for (const [oldName, meta] of Object.entries(TO_RENAME)) {
  const oldPath = join(FILES_DIR, oldName);
  if (!existsSync(oldPath)) {
    console.log(`  (missing — skip)  ${oldName}`);
    continue;
  }
  const raritySlug = meta.variant === 'gold' ? 'don-gold' : 'don';
  const newName = `jp_eb03_${raritySlug}_${meta.char}_don.jpeg`;
  const newPath = join(FILES_DIR, newName);
  console.log(`  ${DRY_RUN ? '[dry]' : '→'}  ${oldName}  →  ${newName}`);
  if (!DRY_RUN && oldPath !== newPath) renameSync(oldPath, newPath);
  renameCount += 1;

  newCatalogEntries.push({
    id: `eb03_${meta.variant}_${meta.char.replace(/-/g, '_')}`,
    imageUrl: `/don-pdf-wm/${newName}`,
    page: null,
    cell: null,
    setCode: 'EB-03',
    setName: SET_NAME_EN,
    setLabelJp: SET_NAME_JP,
    variant: meta.variant,
    rarity: meta.variant === 'gold' ? 'DON!! Gold' : 'DON!!',
    character: meta.char.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '),
    isCharacterArt: true,
    scene: `${meta.char.replace(/-/g, ' ')} ${meta.variant === 'gold' ? 'gold parallel' : 'regular'} DON card`,
    _originalImageUrl: `/don-pdf/${oldName}`,
    _renamedFrom: `/don-pdf-wm/${oldName}`,
    sourceCorrection: 'SCN97',
  });
}

// 3. Append catalog entries for the correctly-named files
console.log('\n── Updating catalog ──');
const cat = JSON.parse(readFileSync(CAT_PATH, 'utf-8'));
const existingIds = new Set(cat.items.map(it => it.id));
for (const entry of newCatalogEntries) {
  if (existingIds.has(entry.id)) {
    console.log(`  (already in catalog)  ${entry.id}`);
    continue;
  }
  console.log(`  ${DRY_RUN ? '[dry]' : '+'} add  ${entry.id}  (${entry.character})`);
  if (!DRY_RUN) cat.items.push(entry);
}
if (!DRY_RUN) {
  cat.count = cat.items.length;
  writeFileSync(CAT_PATH, JSON.stringify(cat, null, 2) + '\n');
  console.log(`✓ Catalog: ${cat.items.length} items total`);
}

// 4. Report what's still missing
console.log('\n── Still missing for full EB03 DON set ──');
const havePairs = new Set();
for (const meta of Object.values(TO_RENAME)) {
  havePairs.add(`${meta.char}|${meta.variant}`);
}
let missingCount = 0;
for (const char of EB03_CHARACTERS) {
  for (const variant of ['regular', 'gold']) {
    if (!havePairs.has(`${char}|${variant}`)) {
      console.log(`  • ${variant.padEnd(7)}  ${char}`);
      missingCount += 1;
    }
  }
}
console.log(`\n${missingCount} files still missing. Source them, watermark with logos/SAMPLE_WTM.png, and drop into public/don-pdf-wm/ with filenames:`);
console.log(`  jp_eb03_don_<character>_don.jpeg          (for regular)`);
console.log(`  jp_eb03_don-gold_<character>_don.jpeg     (for gold parallel)`);
console.log(`\nThen rerun this script with the same canonical list to add them to the catalog.`);
console.log(`\nrenamed=${renameCount} mislabelled-deleted=${MISLABELLED.length} new-catalog-entries=${newCatalogEntries.length}`);
