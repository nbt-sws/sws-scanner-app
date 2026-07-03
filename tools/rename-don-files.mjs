// tools/rename-don-files.mjs — SCN84
// -------------------------------------------------------------------
// Copies the 60 DON-catalog jpegs from their original p##_c##.jpeg
// names to the new descriptive names per api/_don-pdf-catalog.json.
// COPIES (not moves) so the originals remain reachable if anything
// references them; once everything's verified, delete the p##_c##
// originals manually.
//
// Run from project root:
//   node tools/rename-don-files.mjs
//   node tools/rename-don-files.mjs --check   (report what would happen)
//
// Operates on BOTH dirs:
//   public/don-pdf/      (un-watermarked originals)
//   public/don-pdf-wm/   (watermarked, served to clients)

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PLAN = [
  { old: "p02_c8.jpeg", new: "op01_don_monkey-d-luffy.jpeg", id: "p02_c8" },
  { old: "p02_c9.jpeg", new: "noset_don_shanks.jpeg", id: "p02_c9" },
  { old: "p03_c2.jpeg", new: "op03_don_nico-robin.jpeg", id: "p03_c2" },
  { old: "p03_c3.jpeg", new: "noset_don_donquixote-doflamingo.jpeg", id: "p03_c3" },
  { old: "p03_c4.jpeg", new: "noset_don_eustass-kid.jpeg", id: "p03_c4" },
  { old: "p03_c5.jpeg", new: "op06_don_boa-hancock.jpeg", id: "p03_c5" },
  { old: "p03_c6.jpeg", new: "noset_don_edward-newgate.jpeg", id: "p03_c6" },
  { old: "p03_c7.jpeg", new: "noset_don_monkey-d-luffy.jpeg", id: "p03_c7" },
  { old: "p03_c8.jpeg", new: "noset_don_monkey-d-luffy__p03-c8.jpeg", id: "p03_c8" },
  { old: "p04_c2.jpeg", new: "noset_don_monkey-d-luffy__p04-c2.jpeg", id: "p04_c2" },
  { old: "p04_c3.jpeg", new: "noset_don_yamato.jpeg", id: "p04_c3" },
  { old: "p04_c4.jpeg", new: "noset_don_donquixote-doflamingo__p04-c4.jpeg", id: "p04_c4" },
  { old: "p04_c5.jpeg", new: "prb01_don_monkey-d-luffy.jpeg", id: "p04_c5" },
  { old: "p05_c5.jpeg", new: "prb01_don_konjiki-kagura.jpeg", id: "p05_c5" },
  { old: "p07_c3.jpeg", new: "prb01_don_bartholomew-kuma.jpeg", id: "p07_c3" },
  { old: "p07_c7.jpeg", new: "prb01_don_eustass-kid.jpeg", id: "p07_c7" },
  { old: "p07_c8.jpeg", new: "prb01_don_trafalgar-law.jpeg", id: "p07_c8" },
  { old: "p08_c8.jpeg", new: "prb01_don_kaido.jpeg", id: "p08_c8" },
  { old: "p09_c6.jpeg", new: "prb01_don_donquixote-doflamingo.jpeg", id: "p09_c6" },
  { old: "p13_c2.jpeg", new: "prb01_don_gold_donquixote-doflamingo.jpeg", id: "p13_c2" },
  { old: "p14_c9.jpeg", new: "op09_don_eustass-kid.jpeg", id: "p14_c9" },
  { old: "p15_c1.jpeg", new: "op10_don_charlotte-katakuri.jpeg", id: "p15_c1" },
  { old: "p15_c2.jpeg", new: "op10_don_monkey-d-luffy.jpeg", id: "p15_c2" },
  { old: "p15_c3.jpeg", new: "op11_don_donquixote-doflamingo.jpeg", id: "p15_c3" },
  { old: "p15_c4.jpeg", new: "noset_don_tony-tony-chopper.jpeg", id: "p15_c4" },
  { old: "p15_c5.jpeg", new: "op12_don_tony-tony-chopper.jpeg", id: "p15_c5" },
  { old: "p15_c6.jpeg", new: "noset_don_shanks__p15-c6.jpeg", id: "p15_c6" },
  { old: "p15_c9.jpeg", new: "noset_don_boa-hancock.jpeg", id: "p15_c9" },
  { old: "p16_c1.jpeg", new: "noset_don_portgas-d-ace.jpeg", id: "p16_c1" },
  { old: "p16_c2.jpeg", new: "noset_don_donquixote-doflamingo__p16-c2.jpeg", id: "p16_c2" },
  { old: "p16_c3.jpeg", new: "noset_don_eustass-kid__p16-c3.jpeg", id: "p16_c3" },
  { old: "p16_c4.jpeg", new: "prb02_don_monkey-d-luffy.jpeg", id: "p16_c4" },
  { old: "p16_c8.jpeg", new: "prb02_don_donquixote-doflamingo.jpeg", id: "p16_c8" },
  { old: "p17_c7.jpeg", new: "prb02_don_nami.jpeg", id: "p17_c7" },
  { old: "p19_c5.jpeg", new: "prb02_don_yamato.jpeg", id: "p19_c5" },
  { old: "p19_c7.jpeg", new: "prb02_don_donquixote-doflamingo__p19-c7.jpeg", id: "p19_c7" },
  { old: "p20_c2.jpeg", new: "prb02_don_donquixote-doflamingo__p20-c2.jpeg", id: "p20_c2" },
  { old: "p20_c6.jpeg", new: "prb02_don_donquixote-doflamingo__p20-c6.jpeg", id: "p20_c6" },
  { old: "p21_c1.jpeg", new: "prb02_don_nico-robin.jpeg", id: "p21_c1" },
  { old: "p22_c8.jpeg", new: "prb02_don_donquixote-doflamingo__p22-c8.jpeg", id: "p22_c8" },
  { old: "p23_c1.jpeg", new: "prb02_don_donquixote-doflamingo__p23-c1.jpeg", id: "p23_c1" },
  { old: "p23_c5.jpeg", new: "prb02_don_gold_donquixote-doflamingo.jpeg", id: "p23_c5" },
  { old: "p23_c9.jpeg", new: "prb02_don_gold_donquixote-doflamingo__p23-c9.jpeg", id: "p23_c9" },
  { old: "p24_c4.jpeg", new: "prb02_don_gold_jewelry-bonney.jpeg", id: "p24_c4" },
  { old: "p26_c2.jpeg", new: "prb02_don_gold_donquixote-doflamingo__p26-c2.jpeg", id: "p26_c2" },
  { old: "p26_c7.jpeg", new: "noset_don_eustass-kid__p26-c7.jpeg", id: "p26_c7" },
  { old: "p26_c8.jpeg", new: "op13_don_gold_donquixote-doflamingo.jpeg", id: "p26_c8" },
  { old: "p26_c9.jpeg", new: "noset_don_jewelry-bonney.jpeg", id: "p26_c9" },
  { old: "p27_c1.jpeg", new: "eb03_don_nami.jpeg", id: "p27_c1" },
  { old: "p27_c2.jpeg", new: "eb03_don_nico-robin.jpeg", id: "p27_c2" },
  { old: "p27_c3.jpeg", new: "eb03_don_donquixote-doflamingo.jpeg", id: "p27_c3" },
  { old: "p27_c4.jpeg", new: "eb03_don_gold_jewelry-bonney.jpeg", id: "p27_c4" },
  { old: "p27_c5.jpeg", new: "eb03_don_gold_nico-robin.jpeg", id: "p27_c5" },
  { old: "p27_c6.jpeg", new: "eb03_don_gold_boa-hancock.jpeg", id: "p27_c6" },
  { old: "p27_c7.jpeg", new: "eb03_don_gold_donquixote-doflamingo.jpeg", id: "p27_c7" },
  { old: "p27_c8.jpeg", new: "noset_don_donquixote-doflamingo__p27-c8.jpeg", id: "p27_c8" },
  { old: "p27_c9.jpeg", new: "noset_don_gold_donquixote-doflamingo.jpeg", id: "p27_c9" },
  { old: "p28_c1.jpeg", new: "noset_don_donquixote-doflamingo__p28-c1.jpeg", id: "p28_c1" },
  { old: "p28_c2.jpeg", new: "op14_don_donquixote-doflamingo.jpeg", id: "p28_c2" },
  { old: "p28_c3.jpeg", new: "noset_don_donquixote-doflamingo__p28-c3.jpeg", id: "p28_c3" },
];

const dirs = [
  { name: 'don-pdf',    path: join(ROOT, 'public', 'don-pdf') },
  { name: 'don-pdf-wm', path: join(ROOT, 'public', 'don-pdf-wm') },
];

const check = process.argv.includes('--check');
const stats = { copied: 0, skippedExists: 0, missingSource: 0, error: 0 };

for (const dir of dirs) {
  if (!existsSync(dir.path)) {
    console.warn(`[skip] ${dir.name}: directory not found at ${dir.path}`);
    continue;
  }
  console.log(`\n=== ${dir.name} ===`);
  for (const entry of PLAN) {
    const src = join(dir.path, entry.old);
    const dst = join(dir.path, entry.new);
    if (!existsSync(src)) {
      console.log(`  MISS ${entry.old} → ${entry.new}`);
      stats.missingSource++;
      continue;
    }
    if (existsSync(dst)) {
      stats.skippedExists++;
      continue;
    }
    if (check) {
      console.log(`  COPY ${entry.old} → ${entry.new}`);
      stats.copied++;
      continue;
    }
    try {
      copyFileSync(src, dst);
      console.log(`  ok   ${entry.old} → ${entry.new}`);
      stats.copied++;
    } catch (e) {
      console.log(`  ERR  ${entry.old}: ${e.message}`);
      stats.error++;
    }
  }
}

console.log('\n— done —');
console.log('  copied:        ', stats.copied);
console.log('  skipped (exists):', stats.skippedExists);
console.log('  source missing:', stats.missingSource);
console.log('  errors:        ', stats.error);
