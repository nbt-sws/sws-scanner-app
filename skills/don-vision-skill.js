// skills/don-vision-skill.js — v14 SCN15
// ------------------------------------------------------------
// "Google Lens for DON cards" — web-corpus-driven fallback identifier.
//
// SCN15 split of responsibilities:
//   - skills/ocr-extract-skill.js  → ALL OCR-derived signals (card code,
//                                     DON marker, character name from the
//                                     PRINTED CARD TEXT in JP/EN/CN)
//   - skills/don-vision-skill.js   → Web-detection corpus mining: character
//                                     name from page titles / best-guess
//                                     labels, variant tag (gold parallel,
//                                     alt art), set code from URLs
//
// This skill is the FALLBACK when OCR couldn't read the card text
// (blurry photo, severe glare, off-angle). It also enriches the OCR
// extraction with variant/set info that's never printed on the card
// itself but lives on third-party listing pages.
//
// Why it exists:
//   DON!! cards (the +1000 power tokens) have purple borders, a single
//   character art, and no visible character name. Haiku struggles to pick
//   out the character because the artwork is abstracted (Doflamingo =
//   smile + glasses + pink coat — no facial detail). Google Lens / Vision
//   WEB_DETECTION finds the same image on TCGplayer, Shopee, eBay,
//   optcgapi — and page titles literally say "Donquixote Doflamingo
//   DON!! Gold Parallel PRB-01".
//
// Usage (server-side, from api/scan.js):
//   import { identifyDonCard, buildDonEbayQuery } from '../skills/don-vision-skill.js';
//   const donId = identifyDonCard({ web: vision.web, ocrText: vision.ocrText });
//   if (donId.isDonCard && donId.confidence >= 0.55 && donId.fullName) {
//     card.code   = `${donId.fullName} Don Card`;     // synthetic code
//     card.nameEn = donId.fullName;
//     card.rarity = donId.rarity;                     // 'DON!! Gold' / 'DON!!'
//     card.type   = 'Don!!';
//     card.setCode = donId.setCode;
//   }
// ------------------------------------------------------------

import { extractFromOcr } from './ocr-extract-skill.js';

// ─── Character roster (most-traded DON-card subjects) ────────────────────────
// Order matters — longer / more-specific names first so "Charlotte Linlin"
// matches before bare "Linlin", "Donquixote Doflamingo" before "Doflamingo".
// Patterns are case-INsensitive and tolerate JP romaji + EN spelling.
// Extend the list as new DON characters print (the catalog grows ~quarterly).
const CHARACTERS = [
  // Roger Pirates + legends
  { match: /\bgol\s+d\.?\s+roger\b|\bgold\s+roger\b/i,         full: 'Gol D. Roger' },
  { match: /\bsilvers\s+rayleigh\b|\brayleigh\b/i,             full: 'Silvers Rayleigh' },
  { match: /\bkozuki\s+oden\b|\boden\b/i,                      full: 'Kozuki Oden' },
  { match: /\bshiki\s+(the\s+golden\s+lion)?\b/i,              full: 'Shiki' },

  // Whitebeard Pirates
  { match: /\bwhitebeard\b|\bedward\s+newgate\b|\bnewgate\b/i, full: 'Edward Newgate' },
  { match: /\bmarco\s+(the\s+phoenix)?\b/i,                    full: 'Marco' },
  { match: /\bportgas\s+d\.?\s+ace\b|\bgol\s+d\.?\s+ace\b/i,   full: 'Portgas D. Ace' },
  { match: /\bvista\b/i,                                       full: 'Vista' },
  { match: /\bedward\s+weevil\b|\bweevil\b/i,                  full: 'Edward Weevil' },

  // Donquixote Family
  { match: /\bdonquixote\s+doflamingo\b|\bdoflamingo\b/i,      full: 'Donquixote Doflamingo' },
  { match: /\bdonquixote\s+rosinante\b|\brosinante\b|\bcorazon\b/i, full: 'Donquixote Rosinante' },
  { match: /\btrebol\b/i,                                      full: 'Trebol' },
  { match: /\bdiamante\b/i,                                    full: 'Diamante' },
  { match: /\bpica\b/i,                                        full: 'Pica' },
  { match: /\bvergo\b/i,                                       full: 'Vergo' },
  { match: /\bsugar\b/i,                                       full: 'Sugar' },

  // Yonko
  { match: /\bcharlotte\s+linlin\b|\bbig\s+mom\b/i,            full: 'Charlotte Linlin' },
  { match: /\bkaido\b|\bkaidou\b/i,                            full: 'Kaido' },
  { match: /\bred-?haired\s+shanks\b|\bshanks\b/i,             full: 'Shanks' },
  { match: /\bblackbeard\b|\bmarshall\s+d\.?\s+teach\b|\bteach\b/i, full: 'Marshall D. Teach' },

  // Big Mom Pirates (Charlotte family)
  { match: /\bcharlotte\s+katakuri\b|\bkatakuri\b/i,           full: 'Charlotte Katakuri' },
  { match: /\bcharlotte\s+smoothie\b|\bsmoothie\b/i,           full: 'Charlotte Smoothie' },
  { match: /\bcharlotte\s+cracker\b|\bcracker\b/i,             full: 'Charlotte Cracker' },
  { match: /\bcharlotte\s+perospero\b|\bperospero\b/i,         full: 'Charlotte Perospero' },
  { match: /\bcharlotte\s+pudding\b|\bpudding\b/i,             full: 'Charlotte Pudding' },

  // Kaido / Beasts Pirates ("All-Stars" — bare "King/Queen/Jack" too
  // collision-prone so we require an OP-context qualifier).
  { match: /\b(king\s+the\s+(wild)?fire|king\s+the\s+conflagration|wano\s+king|king\s+don\s+card)\b/i, full: 'King' },
  { match: /\b(queen\s+the\s+plague|wano\s+queen|queen\s+don\s+card)\b/i,             full: 'Queen' },
  { match: /\b(jack\s+the\s+drought|wano\s+jack|jack\s+don\s+card)\b/i,                full: 'Jack' },
  { match: /\byamato\b/i,                                      full: 'Yamato' },

  // Marines + Admirals + warlords
  { match: /\bsmoker\b/i,                                      full: 'Smoker' },
  { match: /\bmonkey\s+d\.?\s+garp\b|\bgarp\b/i,               full: 'Monkey D. Garp' },
  { match: /\bsengoku\b/i,                                     full: 'Sengoku' },
  { match: /\bakainu\b|\bsakazuki\b/i,                         full: 'Sakazuki' },
  { match: /\baokiji\b|\bkuzan\b/i,                            full: 'Kuzan' },
  { match: /\bkizaru\b|\bborsalino\b/i,                        full: 'Borsalino' },
  { match: /\bfujitora\b|\bissho\b/i,                          full: 'Issho' },
  { match: /\bryokugyu\b|\baramaki\b/i,                        full: 'Aramaki' },
  { match: /\btashigi\b/i,                                     full: 'Tashigi' },
  { match: /\bkoby\b|\bcoby\b/i,                               full: 'Koby' },
  { match: /\bdracule\s+mihawk\b|\bmihawk\b/i,                 full: 'Dracule Mihawk' },
  { match: /\bsir\s+crocodile\b|\bcrocodile\b/i,               full: 'Crocodile' },
  { match: /\bboa\s+hancock\b|\bhancock\b/i,                   full: 'Boa Hancock' },
  { match: /\bbartholomew\s+kuma\b|\bkuma\b/i,                 full: 'Bartholomew Kuma' },
  { match: /\bjinbe\b|\bjimbei\b/i,                            full: 'Jinbe' },
  { match: /\bbuggy\s+(the\s+clown|the\s+star)?\b|\bbuggy\b/i, full: 'Buggy' },
  { match: /\bdoflamingo\b/i,                                  full: 'Donquixote Doflamingo' }, // dup-safety

  // CP9 / CP0
  { match: /\brob\s+lucci\b|\blucci\b/i,                       full: 'Rob Lucci' },
  { match: /\bkaku\b/i,                                        full: 'Kaku' },
  { match: /\bblueno\b/i,                                      full: 'Blueno' },
  { match: /\bspandam\b/i,                                     full: 'Spandam' },

  // Worst Generation + supernovas
  { match: /\beustass\s+kid\b|\bkid\b/i,                       full: 'Eustass Kid' },
  { match: /\btrafalgar\s+law\b|\btrafalgar\s+d\.?\s+water\s+law\b|\blaw\b/i, full: 'Trafalgar Law' },
  { match: /\bcapone\s+bege\b|\bbege\b/i,                      full: 'Capone Bege' },
  { match: /\bbasil\s+hawkins\b|\bhawkins\b/i,                 full: 'Basil Hawkins' },
  { match: /\bjewelry\s+bonney\b|\bbonney\b/i,                 full: 'Jewelry Bonney' },
  { match: /\burouge\b/i,                                      full: 'Urouge' },
  { match: /\bx\.?\s*drake\b|\bdrake\b/i,                      full: 'X Drake' },
  { match: /\bscratchmen\s+apoo\b|\bapoo\b/i,                  full: 'Scratchmen Apoo' },
  { match: /\bkillerwhale\b|\bkiller\b/i,                      full: 'Killer' },

  // Straw Hats (full names then aliases)
  { match: /\bmonkey\s+d\.?\s+luffy\b|\bluffy\b/i,             full: 'Monkey D. Luffy' },
  { match: /\broronoa\s+zoro\b|\bzoro\b/i,                     full: 'Roronoa Zoro' },
  { match: /\bvinsmoke\s+sanji\b|\bsanji\b/i,                  full: 'Sanji' },
  { match: /\bnami\b/i,                                        full: 'Nami' },
  { match: /\busopp\b/i,                                       full: 'Usopp' },
  { match: /\btony\s+tony\s+chopper\b|\bchopper\b/i,           full: 'Tony Tony Chopper' },
  { match: /\bnico\s+robin\b|\brobin\b/i,                      full: 'Nico Robin' },
  { match: /\bfranky\b|\bcutty\s+flam\b/i,                     full: 'Franky' },
  { match: /\bbrook\b/i,                                       full: 'Brook' },

  // Revolutionary Army + others
  { match: /\bsabo\b/i,                                        full: 'Sabo' },
  { match: /\bdragon\s+(the\s+revolutionary)?\b|\bmonkey\s+d\.?\s+dragon\b/i, full: 'Monkey D. Dragon' },
  { match: /\bnefertari\s+vivi\b|\bvivi\b/i,                   full: 'Nefertari Vivi' },
  { match: /\bcarrot\b/i,                                      full: 'Carrot' },
  { match: /\bkalgara\b/i,                                     full: 'Kalgara' },

  // Wano (Kozuki retainers)
  { match: /\bkin'?emon\b|\bkinemon\b/i,                       full: "Kin'emon" },
  { match: /\bdenjiro\b/i,                                     full: 'Denjiro' },
  { match: /\bhyogoro\b/i,                                     full: 'Hyogoro' },
  { match: /\bashura\s+doji\b/i,                               full: 'Ashura Doji' },

  // Bartolomeo / Cavendish / Bellamy etc.
  { match: /\bbartolomeo\b/i,                                  full: 'Bartolomeo' },
  { match: /\bcavendish\b/i,                                   full: 'Cavendish' },
  { match: /\bbellamy\b/i,                                     full: 'Bellamy' },
];

// ─── Variant detection (gold parallel, foil, alt art, etc.) ──────────────────
// Keyed in priority order — a single matched key short-circuits.
const VARIANT_DETECTORS = [
  { name: 'gold',     regex: /\b(gold(\s+parallel)?|g\.?\s*parallel)\b|\b金\b/i },
  { name: 'alt-art',  regex: /\b(alt(\s+art)?|alternate\s+art)\b|\bAA\b/i },
  { name: 'foil',     regex: /\b(foil|holographic)\b/i },
  { name: 'reprint',  regex: /\breprint\b/i },
  { name: 'manga',    regex: /\bmanga(\s+(alt|alternate))?\s+art\b/i },
];

// ─── Set / booster detection ────────────────────────────────────────────────
// Most DON cards live in Premium Booster (PRB-NN), Extra Booster (EB-NN), or
// a main booster (OP-NN). Captures the canonical code so we can pass it on to
// prices.js + the variant picker.
const SET_PATTERNS = [
  /\b(PRB[-\s]?\d{1,2})\b/i,
  /\b(EB[-\s]?\d{1,2})\b/i,
  /\b(OP[-\s]?\d{1,2})\b/i,
  /\b(ST[-\s]?\d{1,2})\b/i,
];

// Sanitize "PRB 01" / "PRB-1" → "PRB-01" (canonical 2-digit form).
function canonicalSetCode(raw) {
  const m = String(raw || '').match(/^(PRB|EB|OP|ST)[-\s]?(\d{1,2})$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}`;
}

// ─── DON-card-ness detector ─────────────────────────────────────────────────
// Two tiers of detection:
//
// TIER A — OCR text from the card itself (Vision DOCUMENT_TEXT_DETECTION).
//   This is the GROUND TRUTH. DON tokens print "ドン!!カード" + "+1000" on
//   every single one of them. If we see that text in the OCR'd card image,
//   it IS a DON card, full stop. No ambiguity from web-page noise.
//
// TIER B — Web-detection corpus (fallback when OCR didn't catch the text,
//   e.g. blurry photo). Much stricter than the v1 version — requires the
//   DON signal AND One-Piece-specific context in the SAME source string,
//   to avoid the "Amazon collectibles" false-positive class.
const DON_OCR_PATTERNS = [
  /ドン!!\s*カード/,            // JP printed label
  /ドン!!/,                       // JP standalone
  /DON\s*!!\s*CARD/i,             // EN printed label
  /DON\s*!!/,                     // EN standalone
  /\+\s*1000\b/,                  // power indicator (combined with other DON cues)
];

const OP_CONTEXT_PATTERNS = [
  /\bone\s*piece\b/i,
  /\bonepiece\b/i,
  /\bop-?cg\b/i,
  /\boptcg\b/i,
  /onepiece-?cardgame/i,
  /cardpiece\.com/i,
  /optcgapi/i,
  /apitcg/i,
];

function ocrSaysDonCard(ocrText) {
  if (!ocrText) return false;
  // Strong: explicit DON label printed on the card.
  if (/ドン!!\s*カード/.test(ocrText) || /DON\s*!!\s*CARD/i.test(ocrText)) {
    return true;
  }
  // Medium: BOTH "ドン!!" / "DON!!" AND a +1000 indicator (or similar) —
  // requires two independent signals before we commit, because "+1000"
  // alone can show up on regular Character cards too (rare but possible).
  const hasDonText = /ドン!!/.test(ocrText) || /DON\s*!!/i.test(ocrText);
  const hasPowerMod = /\+\s*1000\b/.test(ocrText);
  return hasDonText && hasPowerMod;
}

function corpusSaysDonCardWithOpContext(corpus) {
  // Require BOTH a DON signal AND an OP-context word IN THE SAME SOURCE
  // STRING. Previously we accepted any DON signal anywhere in the corpus,
  // which falsely fired on Amazon "+1000 sold" listings, "London" street
  // signs, etc. The same-source requirement eliminates that whole class.
  return corpus.some((s) => {
    const hasDon = DON_OCR_PATTERNS.some((re) => re.test(s));
    if (!hasDon) return false;
    const hasOp = OP_CONTEXT_PATTERNS.some((re) => re.test(s));
    return hasOp;
  });
}

function firstMatch(corpus, list, propMatch, propResult) {
  for (const item of list) {
    for (const s of corpus) {
      if (item[propMatch].test(s)) return item[propResult];
    }
  }
  return null;
}

// ─── Build the corpus of strings we mine for keywords ───────────────────────
function buildCorpus(visionWeb) {
  if (!visionWeb) return [];
  const out = [];
  for (const l of (visionWeb.bestGuessLabels || [])) {
    if (l?.label) out.push(l.label);
  }
  for (const e of (visionWeb.webEntities || [])) {
    if (e?.description) out.push(e.description);
  }
  for (const p of (visionWeb.pagesWithMatchingImages || [])) {
    if (p?.pageTitle) out.push(p.pageTitle);
    if (p?.url)       out.push(p.url);
  }
  // Image-host URLs sometimes encode the card slug ("doflamingo-don-gold").
  for (const arr of [visionWeb.fullMatchingImages, visionWeb.partialMatchingImages]) {
    for (const it of (arr || [])) {
      const u = typeof it === 'string' ? it : it?.url;
      if (u) out.push(u);
    }
  }
  return out;
}

// ─── SCN26: name extraction from page titles / bestGuess labels ─────────────
//
// Goal: when the actual card name appears in a listing title (e.g. "Don!!
// Shandora Bell — Okini Land") or Vision's bestGuess label ("one piece don
// card bell"), pull THAT name in preference to the CHARACTERS-list lookup,
// which false-matches on tangentially-mentioned characters in evidence
// pages (Luffy mentioned because he rings the Shandora bell).

// Word lists used to reject obvious non-names extracted from titles.
// Avoids returning "Card" / "Booster" / etc. as the character name.
const NAME_REJECT_WORDS = new Set([
  'card', 'cards', 'set', 'sets', 'pack', 'packs', 'booster', 'box',
  'series', 'pricing', 'price', 'prices', 'listing', 'listings',
  'stock', 'available', 'english', 'japanese', 'chinese', 'simplified',
  'bandai', 'tcg', 'cg', 'op', 'one', 'piece', 'gold', 'foil',
  'parallel', 'alt', 'art', 'manga', 'reprint', 'premium', 'rare',
  'common', 'super', 'special', 'leader', 'character', 'event', 'edition',
  'product', 'pre-order', 'preorder', 'release', 'shop', 'store',
]);

function cleanExtractedName(raw) {
  if (!raw) return null;
  // Strip trailing rarity/variant tokens + brackets + connectors.
  let name = String(raw)
    .replace(/[\[\(\{].*?[\]\)\}]/g, ' ')        // remove bracketed groups
    .replace(/\b(gold|foil|parallel|alt|alternate|manga|reprint|premium|edition|series)\b.*$/i, '')
    .replace(/\s*[-—–|·]\s*.*$/, '')             // strip everything after first separator
    .replace(/[^\w\s'.\-]/g, ' ')                 // strip punctuation except apostrophe/dot/dash
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 40) return null;
  // Reject if first token is a stop-word.
  const first = name.split(/\s+/)[0].toLowerCase();
  if (NAME_REJECT_WORDS.has(first)) return null;
  // Title-case so "luffy" → "Luffy", "shandora bell" → "Shandora Bell".
  name = name.split(/\s+/).map((w) =>
    w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
  ).join(' ');
  return name;
}

// Look for "Don!! [Name]" / "DON - [Name]" / "Don Card [Name]" in titles
// or URLs of pages flagged by OP_CONTEXT_PATTERNS.
function extractNameFromTitles(visionWeb) {
  if (!visionWeb) return null;
  const pages = visionWeb.pagesWithMatchingImages || [];
  // Patterns in order of specificity.
  const patterns = [
    /don\s*!?!?\s*card\s*[-:\(\[]\s*([A-Za-z][\w\s'.\-]{1,40})/i,
    /don\s*!!\s+([A-Z][\w\s'.\-]{1,40}?)(?:\s*[-:\]\)\|]|\s+gold|\s+foil|\s+parallel|\s+(?:OP|ST|EB|PRB)-?\d)/i,
    /don\s*-\s*\[?\s*([A-Z][\w\s'.\-]{1,40}?)\s*[\]\)]/i,                       // "DON - [Name]"
    /don\s*card\s+([A-Za-z][\w\s'.\-]{1,40}?)(?:\s+gold|\s+foil|\s+parallel|$)/i,
  ];
  for (const p of pages) {
    const title = p.pageTitle || '';
    const url   = p.url || '';
    // Require OP-context to trust this page.
    const opCtx = OP_CONTEXT_PATTERNS.some((re) => re.test(title) || re.test(url));
    if (!opCtx) continue;
    for (const re of patterns) {
      const m = title.match(re);
      if (m && m[1]) {
        const cleaned = cleanExtractedName(m[1]);
        if (cleaned) return cleaned;
      }
    }
  }
  return null;
}

// Look for "one piece don card [name]" / "don card [name]" in bestGuess labels.
function extractNameFromBestGuess(visionWeb) {
  if (!visionWeb) return null;
  const labels = visionWeb.bestGuessLabels || [];
  for (const l of labels) {
    const text = (l.label || '').trim();
    if (!text) continue;
    // "one piece don card shandora bell" → captures "shandora bell"
    // "don card luffy" → captures "luffy"
    const m = text.match(/don\s*(?:!!\s*)?card\s+(.+?)(?:\s+gold|\s+foil|\s+parallel)?\s*$/i);
    if (m && m[1]) {
      const cleaned = cleanExtractedName(m[1]);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

// ─── Main: identify a DON card from a Vision response ────────────────────────
//
// Accepts EITHER the old single-arg form (visionWeb) for backward compat,
// OR the new object form { web, ocrText } which is preferred since it
// gives the skill access to the OCR'd card text — the most reliable DON
// signal we have.
//
// SCN15: OCR signals come from extractFromOcr() (the shared ocr-extract
// skill) rather than this file's local regex set. That gives us:
//   - Three-language DON marker detection (JP / EN / CN)
//   - OCR-derived character names (printed on the card itself in EN/JP/CN)
//   - Card code extraction (OP##-### / P-### / etc.)
// in one place. This skill then mines the web corpus for things that DON
// cards don't print on themselves (variant, set code, sometimes the
// character name when OCR can't read it).
export function identifyDonCard(visionInput) {
  // Normalize input shape.
  const visionWeb = visionInput?.web || visionInput;
  const ocrText   = visionInput?.ocrText || '';

  // ── Tier A: shared OCR extractor (highest trust, multi-language) ─────────
  const ocr = extractFromOcr(ocrText);
  const ocrConfirmed     = ocr.isDonCard;
  const ocrCharacterName = ocr.characterName;        // EN canonical, from any of JP/EN/CN OCR
  const ocrCardCode      = ocr.cardCode;             // P-### or null for DON tokens

  const corpus = buildCorpus(visionWeb);
  if (corpus.length === 0 && !ocrConfirmed) {
    return { isDonCard: false, confidence: 0, reason: 'empty corpus + no OCR DON signal' };
  }

  // ── Tier B: web detection with OP-context check (lower trust) ────────────
  const corpusConfirmed = corpusSaysDonCardWithOpContext(corpus);

  if (!ocrConfirmed && !corpusConfirmed) {
    return {
      isDonCard: false,
      confidence: 0,
      reason: ocrText
        ? 'OCR text has no DON label AND web corpus lacks OP-context DON signal'
        : 'No OCR + web corpus lacks OP-context DON signal',
    };
  }

  // Character name resolution order (SCN26):
  //   1. OCR-derived (printed on the card itself, language-agnostic)
  //   2. "Don!! [Name]" / "DON [Name]" pattern from OP-context page titles
  //      — most reliable for non-character DON tokens (Shandora Bell,
  //      themed treasures, etc.) where CHARACTERS-list match would
  //      otherwise grab a tangential webEntity (e.g. Luffy mentioned
  //      because he rings the Shandora bell in the manga).
  //   3. Vision bestGuess label parsing — "one piece don card bell" → "Bell"
  //   4. Legacy CHARACTERS-list match against OP-context sources
  // The OCR name is always more trustworthy than any web-derived guess.
  let fullName = ocrCharacterName || null;
  const opContextSources = corpus.filter((s) => OP_CONTEXT_PATTERNS.some((re) => re.test(s)));

  // Step 2: extract from page titles. Pattern: "Don!! [Name]" or
  // "DON - [Name]" or "Don Card [Name]". Only trust OP-context pages.
  if (!fullName) {
    fullName = extractNameFromTitles(visionWeb);
  }

  // Step 3: extract from Vision bestGuess label. Pattern:
  // "one piece don card [name]" or just "don card [name]".
  if (!fullName) {
    fullName = extractNameFromBestGuess(visionWeb);
  }

  // Step 4: legacy CHARACTERS-list match. Iterates known characters in
  // priority order and picks the first whose name appears in any
  // OP-context source. Last resort because it false-matches on
  // tangentially-related characters (Luffy / Roger / etc. mentioned in
  // listing descriptions but not the card subject).
  if (!fullName) {
    for (const char of CHARACTERS) {
      if (opContextSources.some((s) => char.match.test(s))) {
        fullName = char.full;
        break;
      }
    }
  }
  // Variant — only trust variant tag if it appears in an OP-context source.
  let variant = 'regular';
  for (const det of VARIANT_DETECTORS) {
    if (opContextSources.some((s) => det.regex.test(s))) {
      variant = det.name;
      break;
    }
  }
  // Set code — same rule: must appear in an OP-context source. If OCR
  // found a P-### promo code directly off the card, prefer that.
  let setCode = null;
  if (ocrCardCode && /^P-\d/i.test(ocrCardCode)) {
    setCode = ocrCardCode;
  }
  if (!setCode) {
    for (const s of opContextSources) {
      for (const re of SET_PATTERNS) {
        const m = s.match(re);
        if (m) { setCode = canonicalSetCode(m[1]); break; }
      }
      if (setCode) break;
    }
  }

  // Confidence scoring — weighted to favor OCR-confirmed identifications.
  // OCR DON marker + OCR character name = highest tier (we read BOTH off
  // the card itself).
  let confidence;
  if (ocrConfirmed && ocrCharacterName) {
    confidence = 0.85;                                // OCR marker + OCR name
  } else if (ocrConfirmed) {
    confidence = 0.55;                                // OCR marker only, name from web
  } else {
    confidence = 0.25;                                // web-corpus fallback
  }
  if (fullName) confidence += 0.10;
  if (setCode)  confidence += 0.05;
  if (variant !== 'regular') confidence += 0.03;
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);

  // Build a compact evidence list (top page titles + best-guess labels) so
  // the client can show the user "here's why we identified this".
  const evidence = [];
  for (const l of (visionWeb.bestGuessLabels || []).slice(0, 2)) {
    if (l?.label) evidence.push({ source: 'bestGuess', snippet: l.label });
  }
  for (const e of (visionWeb.webEntities || []).slice(0, 3)) {
    if (e?.description) evidence.push({ source: 'webEntity', snippet: e.description, score: e.score });
  }
  for (const p of (visionWeb.pagesWithMatchingImages || []).slice(0, 3)) {
    if (p?.pageTitle) {
      evidence.push({
        source: 'pageMatch',
        snippet: String(p.pageTitle).slice(0, 140),
        url: p.url,
        score: p.score,
      });
    }
  }

  return {
    isDonCard:    true,
    confidence,
    fullName,                      // 'Donquixote Doflamingo' or null
    variant,                       // 'gold' | 'alt-art' | 'foil' | 'reprint' | 'manga' | 'regular'
    setCode,                       // 'PRB-01' or null
    syntheticCode: fullName ? `${fullName} Don Card` : null,
    rarity: deriveRarity(variant),
    tier: ocrConfirmed && ocrCharacterName ? 'ocr-text+ocr-name'
         : ocrConfirmed ? 'ocr-text+web-name'
         : 'web-corpus-op-context',
    ocrSnippet: ocr.ocrSnippet || null,
    ocrSignals: ocr.signals || [],
    ocrLanguage: ocr.language || null,
    evidence,
  };
}

// Map our variant key → the rarity string the rest of the codebase uses on
// DON cards. Mirrors how api/don-cards.js + the variant picker label them.
function deriveRarity(variant) {
  switch (variant) {
    case 'gold':     return 'DON!! Gold';
    case 'alt-art':  return 'DON!! Alt Art';
    case 'foil':     return 'DON!! Foil';
    case 'reprint':  return 'DON!! Reprint';
    case 'manga':    return 'DON!! Manga Alt Art';
    default:         return 'DON!!';
  }
}

// ─── eBay-query builder for DON cards ───────────────────────────────────────
// Mirrors the format /api/prices.js already uses for synthetic DON codes:
//   "{Name} Don Card {variant} {setCode} {setLabel} - One piece {lang}"
// e.g. "Donquixote Doflamingo Don Card Gold PRB-01 Premium Booster - One piece Japanese"
//
// The result is suitable for both eBay Browse keyword search AND for the
// "canonical query" line the UI shows under the pricing table.
export function buildDonEbayQuery(identification, { lang = 'JP', setLabel = '' } = {}) {
  if (!identification?.fullName) return null;
  const langEN = ({ JP: 'Japanese', EN: 'English', CN: 'Chinese', AE: 'Asian English' })[String(lang).toUpperCase()] || 'Japanese';
  const variantTag = ({
    gold:     'Gold Parallel',
    'alt-art':'Alt Art',
    foil:     'Foil',
    reprint:  'Reprint',
    manga:    'Manga Alt Art',
    regular:  '',
  })[identification.variant] || '';

  const parts = [
    identification.fullName,
    'Don Card',
    variantTag,
    identification.setCode || '',
    setLabel || '',
  ].filter((p) => p && p.trim().length > 0);
  return parts.join(' ') + ` - One piece ${langEN}`;
}

// Re-export the character list so other modules (e.g. don-cards.js scraper,
// the variant picker) can use the same canonical name set.
export { CHARACTERS as DON_CHARACTERS };
