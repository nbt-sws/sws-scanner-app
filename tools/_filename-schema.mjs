// tools/_filename-schema.mjs — SCN95
// Shared filename schema for SwibSwap sample images.
//
// Canonical filename: {lang}_{set-code}_{rarity-slug}_{name}_{type-slug}.jpeg
//   examples:
//     en_op07-051_sr-star_boa-hancock_char.jpeg
//     jp_eb03-001_don-gold_donquixote-doflamingo_don.jpeg
//     cn_st03-013_sec_roronoa-zoro_char.jpeg
//     jp_prb-02-017_l_monkey-d-luffy_leader.jpeg
//     cn_cn-1anv-001_anniv-promo_luffy_char.jpeg
//
// This module is the single source of truth used by:
//   - tools/rename-don-files-v2.mjs
//   - tools/rename-cn-anniv-files.mjs
//   - tools/backfill-rewatermark-rename.mjs (Firebase)
//   - api/prices.js (eBay query keyword derivation)
//   - api/lookup-by-filename.js (filename-based DB lookup)

export function slugifyPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[★★]/g, '-star')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function shortType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('leader')) return 'leader';
  if (t.includes('character')) return 'char';
  if (t.includes('event')) return 'event';
  if (t.includes('stage')) return 'stage';
  if (t.includes('don')) return 'don';
  return slugifyPart(t) || 'card';
}

// Full card code lowercased with dashes preserved:
//   OP07-051   → op07-051
//   ST03-013   → st03-013
//   PRB-02-017 → prb-02-017
//   CN-1ANV-001 → cn-1anv-001
export function setCodeSlug(code) {
  return slugifyPart(code) || 'unknown';
}

export function buildFilename({ lang, code, rarity, nameEn, type }) {
  const langPart   = slugifyPart(lang) || 'unknown';
  const setPart    = setCodeSlug(code);
  const rarityPart = slugifyPart(rarity) || 'unknown';
  const namePart   = slugifyPart(nameEn).slice(0, 32) || 'unknown';
  const typePart   = shortType(type);
  return `${langPart}_${setPart}_${rarityPart}_${namePart}_${typePart}.jpeg`;
}

export function parseFilename(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '');
  const segs = base.split('_');
  if (segs.length < 5) return null;
  return {
    lang:       segs[0],
    setCode:    segs[1],
    raritySlug: segs[2],
    name:       segs[3],
    typeSlug:   segs[4],
  };
}

// ─── eBay keyword mapping ─────────────────────────────────────────────────
// Given a rarity slug (as it appears in the filename), return the keyword
// that gets concatenated into the eBay search query. The slug is the
// authoritative source — both prices.js and the rename scripts read from
// this single map so they never disagree.
//
// User-spec'd in SCN95:
//   sr-star → "Super Rare Alt Art"
//   sr      → "Super Rare"
//   manga   → "Manga Alt Art"
//   r-star  → "Rare Alt Art"
//   sp      → "Special SP"
//   p       → "Promo"
//   …and others matching the flow.
export const RARITY_SLUG_TO_EBAY = {
  // Base + ★ parallel pairs
  'c':           'Common',
  'c-star':      'Common Alt Art',
  'uc':          'Uncommon',
  'uc-star':     'Uncommon Alt Art',
  'r':           'Rare',
  'r-star':      'Rare Alt Art',
  'sr':          'Super Rare',
  'sr-star':     'Super Rare Alt Art',
  'sec':         'Secret Rare',
  'sec-star':    'Secret Rare Alt Art',
  'l':           'Leader',
  'l-star':      'Leader Alt Art',
  // Specials
  'tr':          'Treasure Rare',
  'sp':          'Special SP',
  'p':           'Promo',
  'mr':          'Manga Alt Art',   // legacy slug
  'manga':       'Manga Alt Art',
  'manga-alt-art': 'Manga Alt Art',
  // DON variants
  'don':         'DON',
  'don-gold':    'Don Gold Parallel',
  'don-foil':    'Don Foil',
  'don-regular': 'Don',
  'don-r':       'Don Foil',
  // CN Anniversary
  'anniv-promo': 'Anniversary',
  'anniv':       'Anniversary',
};

// Reverse: canonical rarity tag (R★, SR★, DON!!, etc.) → eBay keyword.
// Useful when we have the raw rarity string and want the eBay term directly
// without going through the filename. Mirrors the slug map above.
export const RARITY_CANONICAL_TO_EBAY = {
  C:        'Common',
  UC:       'Uncommon',
  R:        'Rare',
  SR:       'Super Rare',
  SEC:      'Secret Rare',
  L:        'Leader',
  TR:       'Treasure Rare',
  SP:       'Special SP',
  P:        'Promo',
  MR:       'Manga Alt Art',
  'C★':     'Common Alt Art',
  'UC★':    'Uncommon Alt Art',
  'R★':     'Rare Alt Art',
  'SR★':    'Super Rare Alt Art',
  'SEC★':   'Secret Rare Alt Art',
  'L★':     'Leader Alt Art',
  'DON!!':       'DON',
  'DON!! Gold':  'Don Gold Parallel',
  'DON!! R':     'Don Foil',
  'Anniversary Promo': 'Anniversary',
};

export function raritySlugToEbay(slug) {
  return RARITY_SLUG_TO_EBAY[String(slug || '').toLowerCase()] || slug || '';
}

export function rarityCanonicalToEbay(canonical) {
  if (!canonical) return '';
  return RARITY_CANONICAL_TO_EBAY[canonical]
      || RARITY_CANONICAL_TO_EBAY[String(canonical).replace('★', '').trim()]
      || canonical;
}

// Build the eBay query keyword from a filename. Returns the rarity portion
// of the query (e.g. "Super Rare Alt Art") — the caller still concatenates
// the name + code + language.
export function ebayKeywordFromFilename(name) {
  const parsed = parseFilename(name);
  if (!parsed) return '';
  return raritySlugToEbay(parsed.raritySlug);
}

// DON variant identifier from a Bandai-style label. The DON PDF labels each
// card "DON!!", "DON!! Gold", "DON!! R" — we map those to slug forms so the
// rename scripts emit `don`, `don-gold`, `don-r`.
export function donVariantToSlug(variant, rarity) {
  const v = String(variant || '').toLowerCase();
  const r = String(rarity || '').toLowerCase();
  if (v.includes('gold') || r.includes('gold')) return 'don-gold';
  if (v.includes('foil') || r.includes('foil') || r === 'don!! r') return 'don-foil';
  if (v.includes('regular') || v === '' || r === 'don!!') return 'don';
  return slugifyPart(`don-${v || r}`) || 'don';
}
