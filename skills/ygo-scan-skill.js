// skills/ygo-scan-skill.js
// Yu-Gi-Oh! OCG scanning skill. Encodes the 3-step workflow from Skill2-YGO.png
// plus the full rarity ladder from SwibScan_Rarity_Reference_v6.xlsx (YGO_JP +
// YGO_AE sheets) and the YGO-OCG_Database sheet's zone/type map.
//
// Exports:
//   buildPrompt({ lang }) — returns the instructions for Haiku
//   RARITIES                — flat lookup table
//   FRAMES                  — frame colour → card type mapping
//   parseHaikuJson(text)    — extracts the JSON block + applies guardrails

export const TCG = 'ygo';

// ------------------------------------------------------------
// YGO rarities — distilled from YGO_JP / YGO_AE sheets of v6 workbook.
// ------------------------------------------------------------
export const RARITIES = {
  N:      { jp: 'ノーマル',                    en: 'Common',                            cue: 'No foil, plain print' },
  R:      { jp: 'レア',                        en: 'Rare',                              cue: 'Silver foil on card name only' },
  SR:     { jp: 'スーパーレア',                en: 'Super Rare',                        cue: 'Foil on artwork only, name plain' },
  UR:     { jp: 'ウルトラレア',                en: 'Ultra Rare',                        cue: 'Gold foil on name + foil on artwork' },
  UL:     { jp: 'アルティメットレア',          en: 'Ultimate Rare',                     cue: 'Embossed / 3D relief texture on artwork' },
  SE:     { jp: 'シークレットレア',            en: 'Secret Rare',                       cue: 'Vertical/horizontal rainbow foil pattern across name + art' },
  HR:     { jp: 'ホログラフィックレア',        en: 'Holographic / Ghost Rare',          cue: 'Full-art holographic, very rare pull' },
  PSE:    { jp: 'プリズマティックシークレットレア', en: 'Prismatic Secret Rare',         cue: 'Diamond foil on name + full-art rainbow pattern (silvery border)' },
  '20TH': { jp: '20thシークレットレア',          en: '20th Secret Rare',                cue: 'Red-tinted Secret Rare + 20th anniv stamp (silvery border)' },
  QCSE:   { jp: 'クォーターセンチュリーシークレットレア', en: 'Quarter Century Secret Rare', cue: '25th anniv stamp + silver/rainbow foil (silvery border)' },
  QCUR:   { jp: 'クォーターセンチュリーウルトラレア',   en: 'Quarter Century Ultra Rare',  cue: '25th anniv stamp + Ultra Rare foil (silvery border)' },
  CR:     { jp: 'プリズマティックコレクターズレア', en: "Collector's Rare",              cue: 'Heavy texture + prismatic effect + half embossed relief from card center' },
  PGR:    { jp: 'プレミアムゴールドレア',       en: 'Premium Gold Rare',                cue: 'Gold border + foil' },
  'OF-PSE': { jp: 'オーバーフレームプリズマティックシークレット', en: 'Overframe Prismatic Secret', cue: 'Foil pattern extends past card frame · PSE foil' },
  'OF-UR':  { jp: 'オーバーフレームウルトラレア', en: 'Overframe Ultra Rare',            cue: 'Foil pattern extends past card frame · UR foil' },
  UPR:    { jp: 'ウルトラパラレルレア',         en: 'Ultra Parallel Rare',              cue: 'Ultra Rare + parallel foil overlay' },
  EXSE:   { jp: 'エクストラシークレットレア',   en: 'Extra Secret Rare',                cue: 'Diagonal foil pattern (thick lines) · silver frame' },
  C:      { jp: 'コモン',                       en: 'Common (AE)',                      cue: 'AE Common - no special mark, no foil' },
};

// Frame colour → card type. Step in the YGO workflow.
export const FRAMES = {
  Yellow:    'Normal Monster',
  Orange:    'Effect Monster',
  Green:     'Spell',
  Pink:      'Trap',
  Blue:      'Ritual Monster',
  Purple:    'Fusion Monster',
  White:     'Synchro Monster',
  Black:     'XYZ Monster',
  HalfColor: 'Pendulum Monster',
  DarkBlue:  'Link Monster',
};

const CARD_TYPES = Object.values(FRAMES);

function rarityTableForPrompt() {
  return Object.entries(RARITIES)
    .map(([acronym, r]) => `  ${acronym.padEnd(8)} | ${r.en} (${r.jp}) — ${r.cue}`)
    .join('\n');
}

function frameTableForPrompt() {
  return Object.entries(FRAMES)
    .map(([color, type]) => `  ${color.padEnd(10)} → ${type}`)
    .join('\n');
}

// ------------------------------------------------------------
// Prompt — implements the 3-step workflow from Skill2-YGO.png.
// ------------------------------------------------------------
export function buildPrompt({ lang = 'JP' } = {}) {
  // YGO ships in two formats for the markets we scan: OCG (Japanese) and AE (Asian-English).
  // We accept English as a synonym for AE if someone passes it through.
  const normalized = lang === 'EN' ? 'AE' : lang;
  const langLabel =
    normalized === 'JP' ? 'Japanese (OCG)' :
    normalized === 'AE' ? 'Asian-English (AE — English text, Asian distribution)' :
    'Japanese (OCG)';

  return `You are the YGO-Scan skill — a Yu-Gi-Oh! OCG card identification expert.
You will receive 5 images of the same card: one full view and four high-resolution corner zoom-ins.

==============================================================
WORKFLOW (do these three steps in order, do not skip)
==============================================================

STEP 1 — Inspect the corner zoom-ins for visual rarity cues.
  - Look at the FULL image and ALL FOUR corner zoom-ins.
  - Rarity in YGO is purely visual — there is no text stamp. Use these cues:
      • Holographic finish across name + art? → look at PSE / SE / OF-PSE family.
      • Gold-foil name + foil art? → UR (or QCUR if 25th-anniv stamp present).
      • Silver foil on name only? → R.
      • Foil on art only, name plain? → SR.
      • 3D embossed relief texture? → UL or CR.
      • Foil pattern that extends PAST the card frame? → OF-PSE or OF-UR (Overframe).
      • 25th-anniversary stamp on the card (small silver "25") → QCSE or QCUR family.
      • Diagonal thick-line foil with silver frame? → EXSE.
  - For ${langLabel} prints: AE often has slightly different stamps than JP — note this.

STEP 2 — Read the card code from the BOTTOM-RIGHT corner.
  - YGO code lives in the BOTTOM-RIGHT corner, BELOW the artwork frame, ABOVE the
    long text-description box. (Note: some older OCG prints place it differently —
    if not in bottom-right, fall back to anywhere on the lower half of the card.)
  - Format: SETCODE-LANG### with regex /^[A-Z0-9]{2,4}-(JP|EN|AE|KR|SP|FR|DE|IT|PT|TC|TW)\\d{3}$/.
    Examples: LOCH-JP003, LOCR-JP001, LOB-EN001, SDK-001.
  - The full card language is: ${langLabel}.

STEP 3 — Cross-check the card name.
  - Read the card name printed at the TOP of the full image, above the artwork.
  - Provide BOTH Japanese (if visible) AND English. If the print is JP, translate the
    Japanese name to its canonical English equivalent (e.g. 青眼の白龍 → Blue-Eyes White Dragon).
  - Sanity-check: does the name match the code's set prefix? (e.g. LOB-EN001 is
    Blue-Eyes White Dragon in LOB. If name and code conflict, lower confidence + flag.)

==============================================================
RARITY REFERENCE (the ONLY valid rarities — output one of these exact acronyms)
==============================================================
${rarityTableForPrompt()}

==============================================================
FRAME COLOUR → CARD TYPE (Step 1 helper)
==============================================================
${frameTableForPrompt()}

==============================================================
OUTPUT — respond with ONLY this JSON, no surrounding text:
==============================================================
{
  "code": "LOCR-JP001",
  "nameEn": "Blue-Eyes White Dragon",
  "nameJp": "青眼の白龍",
  "rarity": "UR",
  "type": "Normal Monster",
  "attribute": "LIGHT",
  "level": 8,
  "atk": 3000,
  "def": 2500,
  "promo": false,
  "confidence": 92,
  "lang": "${lang}",
  "reasoning": "Brief 1-line note on what visual cues confirmed code/rarity. <= 100 chars."
}

For non-Monster cards: omit attribute/level/atk/def or set them to null.
For Link Monsters: set def to null, level becomes linkRating (1-6).
NEVER make up a code or name — confidence under 60 with null fields is better than hallucinating.`;
}

// ------------------------------------------------------------
// Parse + sanity-check the Haiku response.
// ------------------------------------------------------------
export function parseHaikuJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('YGO scan: response was not valid JSON');
  const card = JSON.parse(match[0]);

  if (card.code && !/^[A-Z0-9]{2,4}-(JP|EN|AE|KR|SP|FR|DE|IT|PT|TC|TW)\d{3}$/.test(card.code)) {
    card.codeLooksWrong = true;
  }
  if (card.rarity && !(card.rarity in RARITIES)) {
    card.rarityLooksWrong = true;
  }
  if (card.type && !CARD_TYPES.includes(card.type)) {
    // Permissive — type can be a free-text Yu-Gi-Oh! sub-type the table doesn't enumerate
    // (e.g. "Effect Monster" sub-classes). Leave as-is.
  }
  return card;
}
