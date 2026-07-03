// skills/op-scan-skill.js
// One Piece TCG scanning skill. Encodes the 3-step workflow from Skill1-OP.png
// plus the full rarity ladder from SwibScan_Rarity_Reference_v6.xlsx (OP_JP +
// OP_EN sheets) and the OP-TCG_Database sheet's zone map.
//
// Exports:
//   buildPrompt({ lang }) — returns the system+user instructions for Haiku
//   RARITIES                — flat lookup table { acronym: { jp, en, cue, range } }
//   COLORS                  — left-hexagon palette
//   parseHaikuJson(text)     — extracts the JSON block + applies guardrails

export const TCG = 'op';

// ------------------------------------------------------------
// Rarities — distilled from OP_JP / OP_EN sheets of v6 workbook.
// Star (★) suffix indicates Parallel/Alt-Art variant.
// ------------------------------------------------------------
export const RARITIES = {
  C:        { jp: 'コモン',                en: 'Common',          cue: 'No foil, basic print',                                          stamp: 'C' },
  UC:       { jp: 'アンコモン',            en: 'Uncommon',        cue: 'Slight foil treatment',                                         stamp: 'UC' },
  R:        { jp: 'レア',                  en: 'Rare',            cue: 'Holographic name only',                                         stamp: 'R' },
  SR:       { jp: 'スーパーレア',          en: 'Super Rare',      cue: 'Holographic on artwork',                                        stamp: 'SR' },
  SEC:      { jp: 'シークレットレア',      en: 'Secret Rare',     cue: 'Gold border, full-art textured pattern',                        stamp: 'SEC' },
  L:        { jp: 'リーダー',              en: 'Leader',          cue: 'Distinct Leader frame · has Life value (no cost)',              stamp: 'L' },
  TR:       { jp: 'トレジャーレア',        en: 'Treasure Rare',   cue: 'Premium alternate-art treatment',                               stamp: 'TR' },
  SP:       { jp: 'スペシャルカード',      en: 'Special Card',    cue: 'Special promo or themed card',                                  stamp: 'SP' },
  MR:       { jp: 'マンガレア',            en: 'Manga Alternate Art', cue: 'Black-and-white manga panel art (often printed as SR★ or SEC★)', stamp: 'SR★/SEC★' },
  P:        { jp: 'プロモ',                en: 'Promo',           cue: 'Tournament prize / pack-in promo',                              stamp: 'P' },
  'DON!!':  { jp: 'ドン!!カード',          en: 'Don!! Card',      cue: 'White background, resource card (NO rarity stamp)',             stamp: '—' },
  'DON!! Gold': { jp: 'ドン!!ゴールド',    en: 'Don!! Gold Parallel', cue: 'Gold finish DON!! card',                                    stamp: 'gold parallel mark' },
  'DON!! R':{ jp: 'ドン!!レア',            en: 'Don!! Rare',      cue: 'Foiling pattern · no gold border',                              stamp: 'special variant' },
  // --- Parallel / star variants — append "-P" in app output for consistency with v12 ---
  'L★':     { jp: 'パラレル·リーダー',     en: 'Leader Parallel Art',     cue: 'Leader with a ★ printed above the L',  stamp: 'L ★' },
  'SR★':    { jp: 'パラレル·スーパーレア', en: 'Super Rare Parallel Art', cue: 'SR with a ★ above the SR',             stamp: 'SR ★' },
  'SEC★':   { jp: 'パラレル·シークレットレア', en: 'Secret Rare Parallel Art', cue: 'SEC with a ★ above the SEC',     stamp: 'SEC ★' },
  'R★':     { jp: 'パラレル·レア',         en: 'Rare Parallel Art',       cue: 'R with a ★ above the R',               stamp: 'R ★' },
  'UC★':    { jp: 'パラレル·アンコモン',   en: 'Uncommon Parallel Art',   cue: 'UC with a ★ above the UC',             stamp: 'UC ★' },
  'C★':     { jp: 'パラレル·コモン',       en: 'Common Parallel Art',     cue: 'C with a ★ above the C',               stamp: 'C ★' },
};

export const COLORS = {
  Red:    { jp: '赤', hex: '#E24B4A', archetype: 'Aggressive · attack-focused · rush' },
  Green:  { jp: '緑', hex: '#1D9E75', archetype: 'Rest/Active manipulation · midrange' },
  Blue:   { jp: '青', hex: '#3F7AC4', archetype: 'Hand control · disruption' },
  Purple: { jp: '紫', hex: '#7C4FA8', archetype: 'DON!! manipulation · ramp' },
  Black:  { jp: '黒', hex: '#1A1A1A', archetype: 'Cost reduction · removal' },
  Yellow: { jp: '黄', hex: '#E5B62F', archetype: 'Life manipulation · graveyard' },
};

const CARD_TYPES = ['Leader', 'Character', 'Event', 'Stage', 'DON!!'];

// ------------------------------------------------------------
// Rarity table rendered into the prompt as a compact reference.
// ------------------------------------------------------------
function rarityTableForPrompt() {
  return Object.entries(RARITIES)
    .map(([acronym, r]) => `  ${acronym.padEnd(10)} | stamp "${r.stamp}" | ${r.en} (${r.jp}) — ${r.cue}`)
    .join('\n');
}

// ------------------------------------------------------------
// Prompt — implements the 3-step workflow from Skill1-OP.png.
// ------------------------------------------------------------
export function buildPrompt({ lang = 'JP' } = {}) {
  const langLabel =
    lang === 'JP' ? 'Japanese (original OP-TCG print)' :
    lang === 'EN' ? 'English (Bandai EN release)' :
    lang === 'CN' ? 'Simplified Chinese (CN release)' :
    'Japanese';
  const langExtraNote =
    lang === 'CN'
      ? 'CN prints use Simplified Chinese for card text and use the same code format as JP. Treat 简体中文 text as the canonical name.'
      : lang === 'EN'
      ? 'EN prints use English card text and may have slightly different rarity stamps from JP — same code format.'
      : 'JP prints use Japanese text only. Most parallel/alt-art releases originate from JP.';

  return `You are the OP-Scan skill — a One Piece TCG card identification expert.
You will receive 5 images of the same card: one full view and four high-resolution corner zoom-ins.

==============================================================
WORKFLOW (do these three steps in order, do not skip)
==============================================================

STEP 1 — Inspect the corner zoom-ins for visual rarity cues.
  - Look at the BOTTOM-RIGHT corner image FIRST: the rarity stamp lives there.
  - **CRITICAL — STAR DETECTION**: Zoom in mentally on the area DIRECTLY ABOVE the rarity letter.
    There is OFTEN a small star (★) printed there, even when subtle. The star is a
    DISTINCT graphical mark — not part of the rarity letter itself.
    - If you see ANY star above the rarity stamp, record the rarity WITH the star suffix:
      "L★", "SR★", "SEC★", "R★", "UC★", "C★", etc.
    - A star means Parallel / Alt-Art — these are significantly more valuable than the base.
    - When in doubt, ASSUME the star IS present rather than not — false negatives cost the
      user real money (parallel cards are 5–20× the base price).
  - **SP / TR SIGN**: Look for an additional mark/icon printed on the LEFT side of the card
    code (bottom-right corner area). Special Card (SP) cards have an "SP" mark near the
    card code; Treasure Rare (TR) cards have a "TR" mark there too. These can appear on
    cards that visually look like SR — pay extra attention.
  - Look at the TOP-LEFT corner for the cost circle (Leaders have NO cost — that's a hint).
  - Look at the full image for the overall foil/texture:
    - Treasure Rare (TR) = full alt-art textured background, often with golden hue
    - Manga Rare (MR) = black-and-white panel art
    - DON!! Gold = full gold finish on a DON!! card
    - SP (Special Card) = special promo treatment, often event-themed

STEP 2 — Read the card code AND rarity stamp from the BOTTOM-RIGHT corner.
  - Card code formats accepted:
      • OP##-### (booster) — e.g. OP07-051
      • ST##-### (starter) — e.g. ST10-010
      • EB##-### (extra booster) — e.g. EB02-022
      • PRB##-### (premium booster)
      • **P-NNN (promo)** — e.g. P-066. These are very common on CN-exclusive
        anniversary cards. The "P-" prefix is what's printed on the card itself.
    Regex: /^(OP|ST|EB|PRB)\\d{2}-\\d{3}$|^P-\\d{2,4}$/. Reject anything else.
  - Rarity acronym: one of the values in the table below. Stamp shown is exactly the
    characters you see — don't invent rarities not in this list.
  - The full card language is: ${langLabel}.
    ${langExtraNote}

  - **CN-SPECIFIC CUES** (when lang === 'CN' — read this section VERY carefully):

      The Simplified Chinese release has its own distinct printing run and
      anniversary cycle. You MUST treat CN cards as a separate database from
      JP/EN — same character, same artwork, but a different code, different
      stamps, and the name printed in SIMPLIFIED Chinese (not Traditional, not Japanese).

      Visual cues to look for on EVERY CN card:
        1. **Card code at bottom-right is "P-NNN"** for promos (e.g. P-066, P-012)
           — NOT the OP##-### / ST##-### / EB##-### pattern of regular boosters.
           This alone is enough to identify it as a CN promo.
        2. **Region marker at bottom-LEFT corner** — text like 区BX, 区A, 区B
           (区 is the Simplified Chinese character for "region").
        3. **Anniversary stamp on the artwork** — a circular badge reading
           "3rd Anniversary One Piece Card Game" (or 2nd / 1st). The Chinese
           release does its own anniversary cycle that does NOT match JP/EN.
        4. **Card name in Simplified Chinese**:
             - 波尔·汉库珂 = Boa Hancock
             - 蒙奇·D·路飞 = Monkey D. Luffy
             - 罗罗诺亚·索隆 = Roronoa Zoro
             - 香克斯 = Shanks
             - 特拉法尔加·罗 = Trafalgar Law
           Set "nameJp" to the Simplified Chinese characters when lang === 'CN'.
        5. **Rarity stamp shown is "P"** (Promo) for most CN anniversary cards.
           Even though the foil treatment looks like SR or SEC, the printed stamp
           is "P" — record "P" as the rarity, never invent something else.

      WORKED EXAMPLE — a real card you might see:
        - Photo shows: Boa Hancock, blue cost circle (4), power 5000, full
          holographic foil pattern, "3rd Anniversary One Piece Card Game" stamp
          on the artwork, code "P-066" at bottom-right, "区BX" at bottom-left,
          character name 波尔·汉库珂 below the artwork.
        - Correct output:
            {
              "code": "P-066",
              "nameEn": "Boa Hancock",
              "nameJp": "波尔·汉库珂",
              "rarity": "P",
              "type": "Character",
              "promo": true,
              "confidence": 92,
              "lang": "CN",
              "reasoning": "P-066 stamped bottom-right; 3rd Anniversary stamp on artwork; CN-region 区BX marker; SimpChinese name 波尔·汉库珂; full-art foil indicates Promo treatment from CN 3rd Anniversary set."
            }

      Critically: DO NOT mistake CN cards for JP cards. JP cards have a Japanese
      name (片仮名 / カタカナ characters) above their rarity stamp; CN cards have
      Simplified Chinese (汉字, e.g. 波尔). When in doubt, the region marker 区
      at bottom-left is the dead giveaway.

STEP 3 — Cross-check the card name.
  - Read the card name printed at the BOTTOM-CENTER of the full image (below the artwork).
  - Provide BOTH the original-script name (Japanese OR Chinese, whichever is printed) AND the canonical English name.
  - If the card is JP, use the Japanese characters for the "nameJp" field.
  - If the card is CN (Simplified Chinese), use the Simplified Chinese characters for the "nameJp" field
    (we keep the field name "nameJp" for schema stability — it just holds the non-English original-script name).
  - If the card is EN, set "nameJp" to null.
  - Sanity-check: does the name match the code's typical character? (e.g. OP09-001
    is "Monkey D. Luffy" in OP09 set. If you can't reconcile name and code, lower the
    confidence score and flag it.)

==============================================================
RARITY REFERENCE (the ONLY valid rarities — output one of these exact strings)
==============================================================
${rarityTableForPrompt()}

==============================================================
CARD TYPES (One Piece)
==============================================================
  Leader     — distinct frame, has Life value bottom-left, no cost
  Character  — has cost (top-left circle) and power (bottom-left of art)
  Event      — text-heavy, no power number
  Stage      — field card, scene art
  DON!!      — white background, resource card, NO rarity stamp

==============================================================
OUTPUT — respond with ONLY this JSON, no surrounding text:
==============================================================
{
  "code": "OP09-001",
  "nameEn": "Monkey D. Luffy",
  "nameJp": "モンキー・D・ルフィ",
  "rarity": "L★",
  "type": "Leader",
  "promo": false,
  "confidence": 92,
  "lang": "${lang}",
  "reasoning": "Brief 1-line note on what visual cues confirmed code/rarity. <= 100 chars."
}

If you genuinely cannot determine a field, use null for that field and lower confidence.
NEVER make up a code or name — confidence under 60 with null fields is better than hallucinating.`;
}

// ------------------------------------------------------------
// Parse + sanity-check the Haiku response.
// ------------------------------------------------------------
export function parseHaikuJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('OP scan: response was not valid JSON');
  const card = JSON.parse(match[0]);

  // Guardrails. Accept main-series codes AND P-NNN promo codes (common in CN).
  if (card.code
      && !/^(OP|ST|EB|PRB)\d{2}-\d{3}$/.test(card.code)
      && !/^P-\d{2,4}$/.test(card.code)
      && card.code !== 'DON!!') {
    card.codeLooksWrong = true;
  }
  if (card.rarity && !(card.rarity in RARITIES)) {
    card.rarityLooksWrong = true;
  }
  if (card.type && !CARD_TYPES.includes(card.type)) {
    card.type = null;
  }
  return card;
}
