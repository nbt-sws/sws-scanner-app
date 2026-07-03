// src/lib/rarities.js — v14
// Platform-agnostic rarity acronym tables. Imported by both the web app
// (boboa-v13/src/) and the mobile app (swibswap-mobile/).
//
// Server-side skills (../../../skills/op-scan-skill.js and ygo-scan-skill.js)
// have the full lookup with English descriptions and cues — those are used to
// build Haiku prompts. THIS file is the *reference list* the UI uses to
// populate the rarity dropdown when the user edits a scan.

export const OP_RARITIES = {
  C:   'Common',
  UC:  'Uncommon',
  R:   'Rare',
  SR:  'Super Rare',
  SEC: 'Secret Rare',
  L:   'Leader',
  TR:  'Treasure Rare',
  SP:  'Special Card',
  MR:  'Manga Alternate Art',
  P:   'Promo',
  'DON!!':      'Don!! Card',
  'DON!! Gold': 'Don!! Gold Parallel',
  'DON!! R':    'Don!! Rare',
  // Parallel variants
  'L★':   'Leader Parallel Art',
  'SR★':  'Super Rare Parallel Art',
  'SEC★': 'Secret Rare Parallel Art',
  'R★':   'Rare Parallel Art',
  'UC★':  'Uncommon Parallel Art',
  'C★':   'Common Parallel Art',
};

export const YGO_RARITIES = {
  N:      'Common (N)',
  R:      'Rare',
  SR:     'Super Rare',
  UR:     'Ultra Rare',
  UL:     'Ultimate Rare',
  SE:     'Secret Rare',
  HR:     'Holographic / Ghost Rare',
  PSE:    'Prismatic Secret Rare',
  '20TH': '20th Secret Rare',
  QCSE:   'Quarter Century Secret Rare',
  QCUR:   'Quarter Century Ultra Rare',
  CR:     "Collector's Rare",
  PGR:    'Premium Gold Rare',
  'OF-PSE': 'Overframe Prismatic Secret',
  'OF-UR':  'Overframe Ultra Rare',
  UPR:    'Ultra Parallel Rare',
  EXSE:   'Extra Secret Rare',
  C:      'Common (AE)',
};
