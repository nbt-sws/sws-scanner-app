// src/lib/sets.js
// One Piece TCG set catalog, grouped by language flavour.
// Used by the EditPanel "Set" dropdown and the eBay pricing query format.
//
// Format per entry: { code, name, type } where type ∈
//   'booster' | 'starter' | 'extra' | 'promo' | 'anniversary' | 'sealed' | 'tournament' | 'event'
//
// Sources: Bandai official cardlists at:
//   - https://www.onepiece-cardgame.com  (JP)
//   - https://en.onepiece-cardgame.com   (EN)
//   - https://asia-en.onepiece-cardgame.com (AE)
//   - https://www.onepiece-cardgame.cn   (CN, Simplified)
// Plus One Piece Base Shop, yuyu-tei sealed-product index, and cardpiece.com
// catalog for CN-region cross-checks.
//
// If a set is JP-only or CN-only, it's flagged in `availableIn` so the
// dropdown only surfaces sets actually printed in the selected language.
//
// ── 2026 update notes (lastUpdated: 2026-05-19) ──
// Bandai moved to SIMULTANEOUS GLOBAL RELEASES starting in 2026 — every
// new set lands in JP / EN / AE on the same day, with CN following ~6 mo
// later. Pre-2026 sets retain their staggered availability.
//
// ── How to add a new set ──
// 1. Add to BOOSTERS / STARTERS / EXTRAS / PREMIUM / ANNIVERSARY etc.
// 2. Set `availableIn: ALL` for any 2026+ set (sim-release).
// 3. For CN-only or JP-only, narrow availableIn accordingly.
// 4. Bump the lastUpdated stamp below.

export const SETS_LAST_UPDATED = '2026-05-19';

const ALL = ['JP', 'EN', 'AE', 'CN'];

// ----------------------- BOOSTERS (OP-XX) -----------------------
const BOOSTERS = [
  { code: 'OP-01', name: 'Romance Dawn',                       type: 'booster', availableIn: ALL },
  { code: 'OP-02', name: 'Paramount War',                      type: 'booster', availableIn: ALL },
  { code: 'OP-03', name: 'Pillars of Strength',                type: 'booster', availableIn: ALL },
  { code: 'OP-04', name: 'Kingdoms of Intrigue',               type: 'booster', availableIn: ALL },
  { code: 'OP-05', name: 'Awakening of the New Era',           type: 'booster', availableIn: ALL },
  { code: 'OP-06', name: 'Wings of the Captain',               type: 'booster', availableIn: ALL },
  { code: 'OP-07', name: '500 Years in the Future',            type: 'booster', availableIn: ALL },
  { code: 'OP-08', name: 'Two Legends',                        type: 'booster', availableIn: ALL },
  { code: 'OP-09', name: 'Emperors in the New World',          type: 'booster', availableIn: ALL },
  { code: 'OP-10', name: 'Royal Bloodlines',                   type: 'booster', availableIn: ALL },
  { code: 'OP-11', name: 'A Fist of Divine Speed',             type: 'booster', availableIn: ALL },
  { code: 'OP-12', name: 'Legacy of the Master',               type: 'booster', availableIn: ALL },
  { code: 'OP-13', name: 'Phenomenal',                         type: 'booster', availableIn: ['JP', 'EN', 'AE'] },
  // 2026 — simultaneous global release; CN lags ~6 months.
  { code: 'OP-14', name: "The Azure Sea's Seven",              type: 'booster', availableIn: ['JP', 'EN', 'AE'] },
  { code: 'OP-15', name: "Adventure on Kami's Island",         type: 'booster', availableIn: ['JP', 'EN', 'AE'] },
  { code: 'OP-16', name: 'The Time of Battle',                 type: 'booster', availableIn: ['JP', 'EN', 'AE'] },
];

// ----------------------- STARTERS (ST-XX) -----------------------
const STARTERS = [
  { code: 'ST-01', name: 'Straw Hat Crew',                     type: 'starter', availableIn: ALL },
  { code: 'ST-02', name: 'Worst Generation',                   type: 'starter', availableIn: ALL },
  { code: 'ST-03', name: 'The Seven Warlords of the Sea',      type: 'starter', availableIn: ALL },
  { code: 'ST-04', name: 'Animal Kingdom Pirates',             type: 'starter', availableIn: ALL },
  { code: 'ST-05', name: 'Film Edition',                       type: 'starter', availableIn: ALL },
  { code: 'ST-06', name: 'Absolute Justice',                   type: 'starter', availableIn: ALL },
  { code: 'ST-07', name: 'Big Mom Pirates',                    type: 'starter', availableIn: ALL },
  { code: 'ST-08', name: 'Side Monkey D. Luffy',               type: 'starter', availableIn: ALL },
  { code: 'ST-09', name: 'Side Yamato',                        type: 'starter', availableIn: ALL },
  { code: 'ST-10', name: '3D2Y',                               type: 'starter', availableIn: ALL },
  { code: 'ST-11', name: 'Uta',                                type: 'starter', availableIn: ALL },
  { code: 'ST-12', name: 'Zoro and Sanji',                     type: 'starter', availableIn: ALL },
  { code: 'ST-13', name: 'The Three Brothers',                 type: 'starter', availableIn: ALL },
  { code: 'ST-14', name: '3D2Y Wave 2',                        type: 'starter', availableIn: ALL },
  { code: 'ST-15', name: 'RED Edition',                        type: 'starter', availableIn: ALL },
  { code: 'ST-16', name: 'Green Uta',                          type: 'starter', availableIn: ALL },
  { code: 'ST-17', name: 'The BEST Storage Box Set Gold',      type: 'sealed',  availableIn: ALL },
  { code: 'ST-18', name: 'Buggy',                              type: 'starter', availableIn: ALL },
  { code: 'ST-19', name: 'Smoker',                             type: 'starter', availableIn: ALL },
  { code: 'ST-20', name: 'Charlotte Katakuri',                 type: 'starter', availableIn: ALL },
  { code: 'ST-21', name: 'Eustass Kid',                        type: 'starter', availableIn: ALL },
  { code: 'ST-22', name: 'Vinsmoke Family',                    type: 'starter', availableIn: ALL },
  { code: 'ST-23', name: 'Marine',                             type: 'starter', availableIn: ['JP', 'EN', 'AE'] },
  // 2026 New Era starter cycle — sim-release JP / EN / AE.
  { code: 'ST-24', name: 'Jewelry Bonney (Green)',             type: 'starter', availableIn: ['JP', 'EN', 'AE'] },
  { code: 'ST-25', name: 'Buggy (Blue)',                       type: 'starter', availableIn: ['JP', 'EN', 'AE'] },
  { code: 'ST-26', name: 'Monkey D. Luffy (Purple/Black)',     type: 'starter', availableIn: ['JP', 'EN', 'AE'] },
  // ST-27 / ST-28 / ST-29 leaked but not yet officially listed — names TBA.
  // When Bandai posts them on onepiece-cardgame.com, add lines here and
  // bump SETS_LAST_UPDATED. Until then they're inferable via the OP code
  // prefix (`ST27-` etc.) but won't surface in the dropdown.
];

// ----------------------- EXTRA BOOSTERS (EB-XX) -----------------------
const EXTRAS = [
  { code: 'EB-01', name: 'Memorial Collection',                type: 'extra', availableIn: ALL },
  { code: 'EB-02', name: 'Anime 25th Collection',              type: 'extra', availableIn: ALL },
  { code: 'EB-03', name: 'ONE PIECE Heroines',                 type: 'extra', availableIn: ALL },
  // 2026 — Jan 31 JP release. EN half is folded into OP-14 + OP-15 per
  // Bandai's 2026 merge policy ("EB-04 half-merge" tracks back to OP-14
  // for the first half + OP-15 for the second half).
  { code: 'EB-04', name: 'Egghead Crisis',                     type: 'extra', availableIn: ['JP', 'EN', 'AE'] },
];

// ----------------------- PREMIUM BOOSTERS / SEALED (PRB-XX, special boxes) -----------------------
const PREMIUM = [
  { code: 'PRB-01',  name: 'Premium Booster',                   type: 'sealed', availableIn: ALL },
  { code: 'PRB-02',  name: 'Premium Booster Vol 2',             type: 'sealed', availableIn: ['JP', 'EN', 'AE'] },
  // PRB-03 announced for late-2026 — placeholder; name to confirm at release.
  { code: 'PRB-03',  name: 'Premium Booster Vol 3',             type: 'sealed', availableIn: ['JP'] },
  // EN-exclusive Mini Tin Sets — reprint cards from prior boosters in tin
  // packaging. Cards keep original codes (OP07-XXX, OP08-XXX, etc.) but
  // get unique EN-only printings. Bandai EN site indexes them under the
  // original code paths, cardpiece carries the EN-tin variants under
  // their own product handles.
  { code: 'MT-01',   name: 'Mini Tin Set Vol 1',                type: 'sealed', availableIn: ['EN', 'AE'] },
  { code: 'MT-02',   name: 'Mini Tin Set Vol 2',                type: 'sealed', availableIn: ['EN', 'AE'] },
];

// ----------------------- ANNIVERSARY / MILESTONE PROMOS -----------------------
const ANNIVERSARY = [
  { code: 'PR-1ANV', name: 'OP-TCG 1st Anniversary Set',                  type: 'anniversary', availableIn: ALL },
  { code: 'PR-2ANV', name: 'OP-TCG 2nd Anniversary Set',                  type: 'anniversary', availableIn: ALL },
  { code: 'PR-3ANV', name: 'OP-TCG 3rd Anniversary Set',                  type: 'anniversary', availableIn: ['JP', 'EN'] },
  { code: 'PR-25TH', name: 'One Piece Anime 25th Anniversary',            type: 'anniversary', availableIn: ALL },
  { code: 'PR-15TH', name: 'One Piece 15-Year Manga Anniversary',         type: 'anniversary', availableIn: ALL },
  { code: 'PR-FILM', name: 'Film RED Anniversary',                        type: 'anniversary', availableIn: ['JP', 'EN'] },
];

// ----------------------- TOURNAMENT / EVENT PROMOS -----------------------
const TOURNAMENT = [
  { code: 'TR-CHAMP', name: 'Champion Battle Tournament Pack',            type: 'tournament', availableIn: ALL },
  { code: 'TR-FLAG',  name: 'Flagship Battle Tournament',                 type: 'tournament', availableIn: ALL },
  { code: 'TR-STORE', name: 'Store Championship',                         type: 'tournament', availableIn: ALL },
  { code: 'TR-REGNL', name: 'Regional Championship',                      type: 'tournament', availableIn: ['JP', 'EN'] },
  { code: 'TR-ONLN',  name: 'Online Regional Pack',                       type: 'tournament', availableIn: ALL },
  { code: 'TR-PCC',   name: 'Pro Card Club',                              type: 'tournament', availableIn: ['JP'] },
];

// ----------------------- EVENT / PROMO PACKS -----------------------
const EVENT_PROMOS = [
  { code: 'P-OPDAY',  name: 'One Piece Day Promo',                        type: 'event', availableIn: ALL },
  { code: 'P-CBF',    name: 'Card Battle Festival',                       type: 'event', availableIn: ALL },
  { code: 'P-PRE',    name: 'Pre-release Pack',                           type: 'event', availableIn: ALL },
  { code: 'P-MEMSH',  name: 'Membership Shop Exclusive',                  type: 'event', availableIn: ['JP'] },
  { code: 'P-BASE',   name: 'One Piece Base Shop Exclusive',              type: 'event', availableIn: ['JP'] },
  { code: 'P-WIN',    name: 'Battle Tournament Winner Card',              type: 'event', availableIn: ALL },
  { code: 'P-PRZ',    name: 'Champion Prize Card',                        type: 'event', availableIn: ALL },
  { code: 'P-JUMP',   name: 'V-JUMP Magazine Promo',                      type: 'event', availableIn: ['JP'] },
  { code: 'P-SDK',    name: 'Saikyo Jump Promo',                          type: 'event', availableIn: ['JP'] },
  { code: 'P-MFEST',  name: 'Manga Festival Promo',                       type: 'event', availableIn: ['JP'] },
];

// ----------------------- GENERIC P-SERIES (general promos) -----------------------
const GENERIC_PROMO = [
  { code: 'P-001',  name: 'Promo Series',                                 type: 'promo', availableIn: ALL },
];

// ----------------------- CN-EXCLUSIVE PROMOS -----------------------
// Simplified Chinese (中国大陆) release has its own anniversary cycle and
// numerous promo folders that don't appear in JP/EN. Cards from these sets
// carry "P-NNN" codes printed at the bottom-right of the card.
//
// Source: onepiece-cardgame.cn official catalog, plus community catalogs
// curated by CN-region collectors (NGA, Weibo CN-OPTCG communities, and
// the OP Base Shop China retail catalog).
const CN_EXCLUSIVE = [
  // ---- Anniversary cycle — distinct CN cycle, JP/EN art does NOT match ----
  // SCN55 + SCN56 (2026-05-20): SAMPLE images for 1st / 2nd / 3rd anniversary
  // boxes extracted from official Bandai CN Anniversary List PDF,
  // watermarked (SwibSwap SAMPLE_WTM + Bandai 样品图 禁止转载 baked in),
  // saved to public/cn-anniv/, indexed in api/_cn-anniv-catalog.json.
  //
  // Cross-referenced against:
  //   - cardpiece.com (Chinese Exclusive product pages)
  //   - tcghobby.com  ("Simplified Chinese First Anniversary Set")
  //   - tcgmikaeru.com (Op-CN collection)
  //   - pandarator.com (1st Anniversary Exclusive Gift Box CHI)
  //   - eBay listings + pokemoncard.com.cn singles
  //
  // Each anniversary box ships with a serial-numbered chase card and
  // a small batch of "Straw Hat Crew" promo reprints with new CN art.
  { code: 'CN-1ANV',     name: 'CN 1st Anniversary Set 一周年 (Nami chase + 5 Straw Hat promos)',  type: 'anniversary', availableIn: ['CN'], hasLocalCatalog: true,
    notes: '5,000 boxes printed. Nami serialized: 4,500 normal red-dress + 500 hidden blue-dress.' },
  { code: 'CN-2ANV',     name: 'CN 2nd Anniversary Set 二周年 (Boa Hancock chase)',                 type: 'anniversary', availableIn: ['CN'], hasLocalCatalog: true,
    notes: '10,000 boxes printed. Boa serialized: 10,000 normal + 1,500 hidden alt-art.' },
  { code: 'CN-3ANV',     name: 'CN 3rd Anniversary Set 三周年 (Jewelry Bonney chase)',              type: 'anniversary', availableIn: ['CN'], hasLocalCatalog: true,
    notes: 'Bonney serialized chase card + CN-flair Straw Hat promo reprints.' },
  { code: 'CN-4ANV',     name: 'CN 4th Anniversary Set 四周年',                                     type: 'anniversary', availableIn: ['CN'] },
  { code: 'CN-OP25',     name: 'CN Anime 25th Anniversary 动画25周年',                              type: 'anniversary', availableIn: ['CN'] },
  { code: 'CN-MANGA25',  name: 'CN Manga 25th Anniversary 漫画25周年',                              type: 'anniversary', availableIn: ['CN'] },

  // ---- Launch / pre-release / retail ----
  { code: 'CN-LAUNCH',   name: 'CN Launch Promotional Pack 首发活动',           type: 'promo',       availableIn: ['CN'] },
  { code: 'CN-PRE',      name: 'CN Pre-release Set 试玩活动',                   type: 'event',       availableIn: ['CN'] },
  { code: 'CN-DEMO',     name: 'CN Demo Pack 体验装',                           type: 'event',       availableIn: ['CN'] },
  { code: 'CN-STARTER',  name: 'CN Player Starter Kit 玩家入门套装',            type: 'starter',     availableIn: ['CN'] },
  { code: 'CN-BASESHOP', name: 'CN Base Shop Exclusive 卡店活动',               type: 'event',       availableIn: ['CN'] },
  { code: 'CN-RETAIL',   name: 'CN Retail Bonus Pack 零售赠品',                 type: 'promo',       availableIn: ['CN'] },

  // ---- Tournament / Champion promos ----
  // SCN56 note (2026-05-20): cross-checked with eBay + pokemoncard.com.cn —
  // CN flagship / championship prizes are NOT a separate code series; they
  // are parallel reprints of existing OP / EB / ST codes (e.g. EB01-012 SR
  // Cavendish "Flagship Battle Parallel PROMO Chinese"). The set entries
  // below remain for UI dropdown grouping, but `code` here is a synthetic
  // bucket label rather than a Bandai code.
  { code: 'CN-CHAMP',    name: 'CN Champion Battle Pack 冠军赛 (parallel reprints)',                type: 'tournament',  availableIn: ['CN'] },
  { code: 'CN-FLAG',     name: 'CN Flagship Battle Pack 旗舰赛 (FSB parallel of EB / OP codes)',    type: 'tournament',  availableIn: ['CN'] },
  { code: 'CN-STORE',    name: 'CN Store Championship 卡店冠军赛',                                  type: 'tournament',  availableIn: ['CN'] },
  { code: 'CN-REGNL',    name: 'CN Regional Championship 区域冠军赛',                               type: 'tournament',  availableIn: ['CN'] },
  { code: 'CN-NATL',     name: 'CN National Championship 全国冠军赛',                               type: 'tournament',  availableIn: ['CN'] },

  // ---- Event / festival / collab ----
  { code: 'CN-OPDAY',    name: 'CN One Piece Day 海贼王日',                     type: 'event',       availableIn: ['CN'] },
  { code: 'CN-MANGA',    name: 'CN Manga Festival 漫画节',                      type: 'event',       availableIn: ['CN'] },
  { code: 'CN-CCG',      name: 'CN Comic Con 漫展',                             type: 'event',       availableIn: ['CN'] },
  { code: 'CN-WB',       name: 'CN Weibo Online Event 微博活动',                type: 'event',       availableIn: ['CN'] },
  { code: 'CN-BILI',     name: 'CN Bilibili Event 哔哩哔哩活动',                type: 'event',       availableIn: ['CN'] },
  { code: 'CN-CNY',      name: 'CN Chinese New Year 春节限定',                  type: 'event',       availableIn: ['CN'] },

  // ---- Collaboration / sealed boxes ----
  { code: 'CN-PRB',      name: 'CN Premium Booster 高级补充包',                 type: 'sealed',      availableIn: ['CN'] },
  { code: 'CN-BEST',     name: 'CN BEST Storage Box 精选收藏盒',                type: 'sealed',      availableIn: ['CN'] },
  { code: 'CN-COLLAB',   name: 'CN Collaboration Pack 联动活动',                type: 'event',       availableIn: ['CN'] },

  // ---- Online / mobile ----
  { code: 'CN-ONLINE',   name: 'CN Online Battle Pack 线上赛',                  type: 'tournament',  availableIn: ['CN'] },
];

// ----------------------- MASTER LIST -----------------------
const ALL_SETS = [
  ...BOOSTERS,
  ...STARTERS,
  ...EXTRAS,
  ...PREMIUM,
  ...ANNIVERSARY,
  ...TOURNAMENT,
  ...EVENT_PROMOS,
  ...GENERIC_PROMO,
  ...CN_EXCLUSIVE,
];

// Build the per-language map by filtering on `availableIn`.
function forLang(lang) {
  return ALL_SETS.filter((s) => !s.availableIn || s.availableIn.includes(lang));
}

export const OP_SETS_BY_LANG = {
  JP: forLang('JP'),
  EN: forLang('EN'),
  AE: forLang('AE'),
  CN: forLang('CN'),
};

// Type-order used in the dropdown so the user sees the sets they pick most often first.
const TYPE_ORDER = ['booster', 'starter', 'extra', 'sealed', 'anniversary', 'tournament', 'event', 'promo'];

export function sortedSetsForLang(lang) {
  const list = OP_SETS_BY_LANG[lang] || OP_SETS_BY_LANG.JP;
  return [...list].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.type);
    const bi = TYPE_ORDER.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return a.code.localeCompare(b.code);
  });
}

// Helper: infer the most-likely set from a card code.
//   "ST10-010"  → ST-10
//   "OP07-051"  → OP-07
//   "OP14-001"  → OP-14
//   "ST26-008"  → ST-26
//   "EB04-005"  → EB-04
//   "PRB02-014" → PRB-02
//   "P-066"     → for CN: most-recent CN anniversary; else generic P-series.
// Returns the set entry or null. Codes for sets not yet in our catalog (e.g.
// future ST-27, OP-17) fall through to null — UI can prompt the user to
// pick manually.
export function inferSetFromCode(code, lang = 'JP') {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  const list = OP_SETS_BY_LANG[lang] || OP_SETS_BY_LANG.JP;

  // OP/ST/EB/PRB main-set codes — regex already handles 1-2 digit set numbers
  // so OP-14, OP-15, OP-16, ST-24, ST-25, ST-26, EB-04, PRB-03 all match.
  let m = upper.match(/^(OP|ST|EB|PRB)(\d{1,2})-/);
  if (m) {
    const setCode = `${m[1]}-${m[2].padStart(2, '0')}`;
    const hit = list.find((s) => s.code === setCode);
    if (hit) return hit;
  }

  // P-NNN promo codes — the actual code printed on most promo cards.
  // For CN, P-codes overwhelmingly come from the most-recent anniversary
  // (1st / 2nd / 3rd / 4th — the cycle progresses ~yearly). Updated 2026:
  //   P-001..P-029  → 1st Anniversary (early CN promos)
  //   P-030..P-059  → 2nd Anniversary
  //   P-060..P-099  → 3rd Anniversary
  //   P-100+        → 4th Anniversary (the current cycle as of mid-2026)
  // These boundaries are rough — the user can change the dropdown if wrong.
  m = upper.match(/^P-(\d{2,4})/);
  if (m) {
    if (lang === 'CN') {
      const n = parseInt(m[1], 10);
      const target = n >= 100 ? 'CN-4ANV'
                  : n >= 60  ? 'CN-3ANV'
                  : n >= 30  ? 'CN-2ANV'
                  :            'CN-1ANV';
      const hit = list.find((s) => s.code === target);
      if (hit) return hit;
    }
    // Non-CN P-NNN → generic Promo Series.
    const hit = list.find((s) => s.code === 'P-001' || s.type === 'promo');
    if (hit) return hit;
  }

  return null;
}

// Human-readable "Set + Type" string used in the eBay search query.
// Example: "OP-07 500 Years in the Future Booster" or
//          "PR-25TH One Piece Anime 25th Anniversary Promo"
export function formatSetForQuery(setEntry) {
  if (!setEntry) return '';
  const typeLabel = {
    booster:     'Booster',
    starter:     'Starter Deck',
    extra:       'Extra Booster',
    sealed:      'Sealed Set',
    anniversary: 'Anniversary',
    tournament:  'Tournament Pack',
    event:       'Event Promo',
    promo:       'Promo',
  }[setEntry.type] || '';
  return `${setEntry.code} ${setEntry.name} ${typeLabel}`.trim();
}

// Pretty group-label for the dropdown header (small UX touch).
export function setGroupLabel(type) {
  return {
    booster:     'Boosters',
    starter:     'Starter Decks',
    extra:       'Extra Boosters',
    sealed:      'Sealed Sets',
    anniversary: 'Anniversary Promos',
    tournament:  'Tournament Promos',
    event:       'Event Promos',
    promo:       'Other Promos',
  }[type] || 'Other';
}
