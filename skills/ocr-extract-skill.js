// skills/ocr-extract-skill.js — v14 SCN15
// ------------------------------------------------------------
// OCR-text extraction for One Piece TCG cards. Pure function over Vision's
// DOCUMENT_TEXT_DETECTION output. Returns:
//
//   {
//     cardCode:        'OP13-051' | 'P-066' | 'ST10-005' | null,
//     isDonCard:       boolean,   // confirmed via printed card text
//     characterName:   'Doflamingo' | 'Gol D. Roger' | … | null,
//     language:        'JP' | 'EN' | 'CN' | null,
//     powerValue:      '+1000' | null,
//     signals:         ['card-code-jp', 'don-marker-jp', 'character-name-cn', …],
//     ocrSnippet:      first 300 chars of OCR text
//   }
//
// This is the PRIMARY identifier in the v14 scan pipeline. Any time the
// OCR returns a confident card code or DON marker, it takes precedence
// over Haiku's visual guess. Haiku is the fallback when OCR is too noisy
// to extract a code (low-res photo, glare, off-angle).
//
// All regexes anchored with word/space boundaries so we don't false-match
// "DON" in "DONate" or "Bondon" etc.
// ------------------------------------------------------------

// ─── Card-code regex (covers every printed OP code format) ───────────────────
//
// OP##-###     boosters         (OP01-001 .. OP16-999)
// ST##-###     starter decks    (ST01-001 .. ST26-XXX)
// EB##-###     extra boosters   (EB01-001 .. EB04-XXX)
// PRB##-###    premium boosters (PRB01-001 .. PRB03-XXX)
// P-###        promo series     (P-001 .. P-150+)
const OP_CODE_PATTERNS = [
  // SCN82 — Accept space-separated OCR output too. Vision sometimes drops
  // the dash entirely ("OP15 119 SE" was the snippet for the Luffy OP15-119
  // SEC scan), so [\s-]+ between the digit groups instead of a strict dash.
  // Also allow no separator at all for the rare smushed case ("OP15119").
  {
    re: /\b(OP|ST|EB|PRB)\s*-?\s*(\d{1,2})[\s-]+(\d{1,3})\b/i,
    canonical: (m) => `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}-${m[3].padStart(3, '0')}`,
    normalize: (m) => `${m[1].toUpperCase()}${m[2].padStart(2, '0')}-${m[3].padStart(3, '0')}`,
  },
  // Tight smushed form: "OP15119" / "ST10005" with no separator.
  {
    re: /\b(OP|ST|EB|PRB)(\d{2})(\d{3})\b/i,
    normalize: (m) => `${m[1].toUpperCase()}${m[2]}-${m[3]}`,
  },
  // Promo: P-### at any of the printing positions (bottom-right of card).
  {
    re: /\bP\s*-\s*(\d{2,4})\b/,
    normalize: (m) => `P-${m[1].padStart(3, '0')}`,
  },
];

// ─── DON-card markers (printed on every DON token, all 3 languages) ──────────
const DON_MARKERS = {
  jp:  [/ドン!!\s*カード/, /ドン!!/, /ドン\s*!!\s*カード/],
  en:  [/\bDON\s*!!\s*CARD\b/i, /\bDON\s*!!\b/i, /\bDON!!\b/],
  // CN printed Don markers — Simplified
  cn:  [/咚!!\s*卡/, /咚!!/, /\bDON!!\b/],
};

// ─── Power-indicator (DON tokens print "+1000" prominently) ──────────────────
const POWER_PATTERNS = [
  /\+\s*1\s*,?\s*0\s*0\s*0\b/,  // +1000 / +1,000 / + 1 000
  /\+1000/,
];

// ─── Character roster across all three languages ─────────────────────────────
// Each entry has 3 regex patterns: EN/romaji, JP katakana, CN simplified.
// Match in ANY language → return the canonical English full name.
const CHARACTERS = [
  // ── Donquixote family ─────────────────────────────────────────────────────
  { en: /\b(donquixote\s+doflamingo|doflamingo)\b/i, jp: /ドフラミンゴ/,                cn: /多弗朗明哥|唐吉诃德[\s·]*多弗朗明哥/,    full: 'Donquixote Doflamingo' },
  { en: /\b(donquixote\s+rosinante|rosinante|corazon)\b/i, jp: /ロシナンテ|コラソン/, cn: /罗西南特|科拉松/,                     full: 'Donquixote Rosinante' },
  { en: /\btrebol\b/i,                            jp: /トレーボル/,             cn: /特雷波尔/,                              full: 'Trebol' },
  { en: /\bdiamante\b/i,                          jp: /ディアマンテ/,           cn: /迪亚曼蒂/,                              full: 'Diamante' },
  { en: /\bpica\b/i,                              jp: /ピーカ/,                  cn: /比卡/,                                  full: 'Pica' },

  // ── Roger Pirates + legends ───────────────────────────────────────────────
  { en: /\b(gol\s+d\.?\s+roger|gold\s+roger)\b/i, jp: /ゴール\s*[・·]?\s*D\s*[・·]?\s*ロジャー|ロジャー/, cn: /哥尔[\s·.]*D[\s·.]*罗杰|罗杰/, full: 'Gol D. Roger' },
  { en: /\b(silvers\s+rayleigh|rayleigh)\b/i,     jp: /シルバーズ\s*レイリー|レイリー/, cn: /席尔巴斯[\s·.]*雷利|雷利/,        full: 'Silvers Rayleigh' },
  { en: /\b(kozuki\s+oden|oden)\b/i,              jp: /光月\s*おでん|おでん/,    cn: /光月御田|御田/,                          full: 'Kozuki Oden' },

  // ── Yonko ─────────────────────────────────────────────────────────────────
  { en: /\b(charlotte\s+linlin|big\s+mom)\b/i,    jp: /シャーロット\s*リンリン|ビッグ\s*マム/, cn: /夏洛特[\s·]*玲玲|大妈/,        full: 'Charlotte Linlin' },
  { en: /\b(kaido|kaidou)\b/i,                    jp: /カイドウ/,               cn: /凯多/,                                  full: 'Kaido' },
  { en: /\bshanks\b/i,                            jp: /シャンクス/,             cn: /香克斯|红发/,                            full: 'Shanks' },
  { en: /\b(blackbeard|marshall\s+d\.?\s+teach|teach)\b/i, jp: /黒ひげ|マーシャル\s*D\s*ティーチ|ティーチ/, cn: /黑胡子|马歇尔[\s·.]*D[\s·.]*蒂奇/, full: 'Marshall D. Teach' },
  { en: /\b(whitebeard|edward\s+newgate|newgate)\b/i, jp: /白ひげ|エドワード\s*ニューゲート|ニューゲート/, cn: /白胡子|爱德华[\s·]*纽盖特/,    full: 'Edward Newgate' },

  // ── Big Mom Pirates ───────────────────────────────────────────────────────
  { en: /\b(charlotte\s+katakuri|katakuri)\b/i,   jp: /カタクリ/,               cn: /卡塔库栗/,                              full: 'Charlotte Katakuri' },
  { en: /\b(charlotte\s+smoothie|smoothie)\b/i,   jp: /スムージー/,             cn: /斯姆吉/,                                full: 'Charlotte Smoothie' },
  { en: /\b(charlotte\s+cracker|cracker)\b/i,     jp: /クラッカー/,             cn: /克力架/,                                full: 'Charlotte Cracker' },

  // ── Worst Generation ──────────────────────────────────────────────────────
  { en: /\b(eustass\s+kid|eustass\s*"?\s*captain\s*"?\s*kid|kid)\b/i, jp: /ユースタス\s*[・·]?\s*キッド|キッド/, cn: /尤斯塔斯[\s·.]*基德|基德/, full: 'Eustass Kid' },
  { en: /\b(trafalgar\s+law|law)\b/i,             jp: /トラファルガー\s*[・·]?\s*ロー|ロー/, cn: /特拉法尔加[\s·.]*罗|罗/,           full: 'Trafalgar Law' },
  { en: /\b(jewelry\s+bonney|bonney)\b/i,         jp: /ジュエリー\s*ボニー|ボニー/, cn: /朱莉[\s·.]*邦尼|邦尼/,                full: 'Jewelry Bonney' },

  // ── Warlords + Marines ────────────────────────────────────────────────────
  { en: /\b(dracule\s+mihawk|mihawk)\b/i,         jp: /ジュラキュール\s*ミホーク|ミホーク/, cn: /朱拉库尔[\s·.]*米霍克|米霍克/,    full: 'Dracule Mihawk' },
  { en: /\b(boa\s+hancock|hancock)\b/i,           jp: /ボア\s*ハンコック|ハンコック/, cn: /波尔[\s·.]*汉库珂|汉库克/,           full: 'Boa Hancock' },
  { en: /\bcrocodile\b/i,                         jp: /クロコダイル/,           cn: /克洛克达尔/,                            full: 'Crocodile' },
  { en: /\b(bartholomew\s+kuma|kuma)\b/i,         jp: /バーソロミュー\s*くま|くま/, cn: /巴索罗缪[\s·.]*熊|熊/,                full: 'Bartholomew Kuma' },
  { en: /\bjinbe\b|\bjimbei\b/i,                  jp: /ジンベエ/,               cn: /甚平/,                                  full: 'Jinbe' },
  { en: /\bbuggy\b/i,                             jp: /バギー/,                  cn: /巴基/,                                  full: 'Buggy' },
  { en: /\bsmoker\b/i,                            jp: /スモーカー/,             cn: /斯莫格/,                                full: 'Smoker' },

  // ── Straw Hats ────────────────────────────────────────────────────────────
  { en: /\b(monkey\s+d\.?\s+luffy|luffy)\b/i,     jp: /モンキー\s*[・·]?\s*D\s*[・·]?\s*ルフィ|ルフィ/, cn: /蒙奇[\s·.]*D[\s·.]*路飞|路飞/, full: 'Monkey D. Luffy' },
  { en: /\b(roronoa\s+zoro|zoro)\b/i,             jp: /ロロノア\s*ゾロ|ゾロ/,    cn: /罗罗诺亚[\s·.]*索隆|索隆/,              full: 'Roronoa Zoro' },
  { en: /\b(vinsmoke\s+sanji|sanji)\b/i,          jp: /ヴィンスモーク\s*サンジ|サンジ/, cn: /文斯莫克[\s·.]*山治|山治/,        full: 'Sanji' },
  { en: /\bnami\b/i,                              jp: /ナミ/,                    cn: /娜美/,                                  full: 'Nami' },
  { en: /\busopp\b/i,                             jp: /ウソップ/,               cn: /乌索普/,                                full: 'Usopp' },
  { en: /\b(tony\s+tony\s+chopper|chopper)\b/i,   jp: /トニートニー\s*チョッパー|チョッパー/, cn: /托尼托尼[\s·.]*乔巴|乔巴/,    full: 'Tony Tony Chopper' },
  { en: /\b(nico\s+robin|robin)\b/i,              jp: /ニコ\s*ロビン|ロビン/,    cn: /妮可[\s·.]*罗宾|罗宾/,                  full: 'Nico Robin' },
  { en: /\bfranky\b/i,                            jp: /フランキー/,             cn: /弗兰奇/,                                full: 'Franky' },
  { en: /\bbrook\b/i,                             jp: /ブルック/,               cn: /布鲁克/,                                full: 'Brook' },
  { en: /\b(portgas\s+d\.?\s+ace|ace)\b/i,        jp: /ポートガス\s*[・·]?\s*D\s*[・·]?\s*エース|エース/, cn: /波特卡斯[\s·.]*D[\s·.]*艾斯|艾斯/, full: 'Portgas D. Ace' },
  { en: /\bsabo\b/i,                              jp: /サボ/,                    cn: /萨博/,                                  full: 'Sabo' },
  { en: /\byamato\b/i,                            jp: /ヤマト/,                  cn: /大和/,                                  full: 'Yamato' },
];

// ─── Language detection (which script dominates the OCR text) ───────────────
function detectLanguage(text) {
  if (!text) return null;
  const hasKana       = /[぀-ゟ゠-ヿ]/.test(text);   // Hiragana + Katakana
  const hasCnOnly     = /[一-鿿]/.test(text) && !hasKana;    // CJK Unified Ideographs but no kana
  const hasLatin      = /[a-z]/i.test(text);
  if (hasKana) return 'JP';
  if (hasCnOnly) return 'CN';
  if (hasLatin) return 'EN';
  return null;
}

// ─── Main extractor ──────────────────────────────────────────────────────────
export function extractFromOcr(ocrText, langHint = null) {
  if (!ocrText || ocrText.length < 3) {
    return {
      cardCode: null,
      isDonCard: false,
      characterName: null,
      language: langHint,
      powerValue: null,
      signals: ['no-ocr-text'],
      ocrSnippet: '',
    };
  }
  const signals = [];

  // 1. Card code
  let cardCode = null;
  for (const pat of OP_CODE_PATTERNS) {
    const m = ocrText.match(pat.re);
    if (m) {
      cardCode = pat.normalize(m);
      signals.push(`code:${cardCode}`);
      break;
    }
  }

  // 2. DON marker detection — any of JP / EN / CN variants.
  //
  // SCN67 + SCN69 — Negative-context filter, now multi-language. Character /
  // Leader / Event cards frequently REFERENCE "ドン!!" / "DON!!" / "咚!!" in
  // their ability text. A real DON token has NO Character/Leader/Event effect
  // markers: ブロッカー, 登場時, 起動メイン, ターン1回, 阻挡, 登场时, 启动主要,
  // 每回合1次, Blocker, On Play, Activate:Main, Once Per Turn, Counter+,
  // Trigger, When Attacking. If we see any of these, the OCR-extracted
  // "DON!!" was an ability reference, not the printed label.
  const HAS_CHAR_EFFECT_TEXT = new RegExp(
    [
      // English
      'Blocker', 'On\\s*Play', 'On\\s*K\\.?O\\.?', 'Activate\\s*:?\\s*Main',
      'Counter\\s*\\+', 'Once\\s*Per\\s*Turn', 'Trigger', 'When\\s*Attacking',
      // Japanese (印刷上で必ず出てくるキーワード)
      'ブロッカー', '登場時', '起動メイン', 'ターン1回', 'カウンター\\s*\\+',
      'リーダー効果', 'アタック時', 'KO時',
      // Chinese (Simplified)
      '阻挡', '登场时', '启动\\s*主要', '每回合1次', '反击\\s*\\+',
      '攻击时', '出场时',
    ].join('|'),
    'i'
  );
  const looksLikeCharacterEffect = HAS_CHAR_EFFECT_TEXT.test(ocrText);

  const langGroups = ['jp', 'en', 'cn'];
  let donLang = null;
  for (const lg of langGroups) {
    if (DON_MARKERS[lg].some((re) => re.test(ocrText))) {
      // Reject DON marker if Character-effect text is present in the same OCR.
      if (looksLikeCharacterEffect) {
        signals.push(`don-marker-suppressed-${lg}`);
        break;
      }
      donLang = lg.toUpperCase();
      signals.push(`don-marker-${lg}`);
      break;
    }
  }
  if (looksLikeCharacterEffect) signals.push('char-effect-text');

  // 3. Power indicator
  const powerMatch = POWER_PATTERNS.find((re) => re.test(ocrText));
  const powerValue = powerMatch ? '+1000' : null;
  if (powerValue) signals.push('power-1000');

  // DON-card flag: requires an ACTUAL DON marker (ドン!!カード / DON!! CARD /
  // 咚!!卡 / ドン!! / DON!!). The +1000 power value alone is NOT enough —
  // Character cards' effect text frequently references "+1000" (e.g.
  // "this character gains +1000 power"), which falsely triggered DON
  // detection on the CN 3rd-Anniversary Boa Hancock P-066 card. The
  // printed DON label is the ground truth; if OCR can't read it on a
  // blurry DON photo, the web-corpus fallback in don-vision-skill picks
  // up the slack.
  const isDonCard = !!donLang;

  // 4. Character name — search across all 3 languages.
  let characterName = null;
  for (const char of CHARACTERS) {
    if (char.en.test(ocrText) || char.jp.test(ocrText) || char.cn.test(ocrText)) {
      characterName = char.full;
      signals.push(`char:${characterName}`);
      break;
    }
  }

  // 5. Language inference
  const detected = detectLanguage(ocrText);
  const language = langHint || detected;

  return {
    cardCode,
    isDonCard,
    characterName,
    language,
    powerValue,
    signals,
    ocrSnippet: String(ocrText).slice(0, 240),
  };
}
