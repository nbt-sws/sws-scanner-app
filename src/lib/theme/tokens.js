// src/lib/theme/tokens.js — v14
// SWIBSWAP design tokens, platform-agnostic. ZERO CSS strings, zero RN imports.
//
// Both the web app (boboa-v13/src/theme.js) and the mobile app
// (swibswap-mobile/src/theme/native.js) re-export from this module so the
// brand palette is defined exactly once.
//
// Per D1 (locked 2026-05-18): keep the cyan/magenta-on-navy palette.

// ─── Type scale (point values, not CSS units) ────────────────────────────────
export const SZ = {
  // SCN47 — bumped one step across the scale for easier reading on phones.
  // xs/sm grow the most because that's where most secondary text lives
  // (pills, metadata rows, caption labels).
  xs:   13,
  sm:   15,
  md:   16,
  base: 17,
  lg:   20,
  xl:   24,
  xxl:  30,
};

// ─── Font family names (plain strings; loaders are platform-specific) ────────
// Web loads these via Google Fonts <link> in public/index.html.
// Mobile loads these via `expo-font` in the App.js bootstrap.
export const FONT_FAMILY = {
  display: 'Orbitron',          // logo wordmark — display + numbers
  body:    'Inter',             // body copy
  mono:    'JetBrains Mono',    // codes, prices
};

// ─── Palette — every color SwibSwap uses, named ──────────────────────────────
export const COLORS = {
  // backgrounds
  bg:        '#0A0F2E',
  bgDeep:    '#050822',
  surface:   '#141938',
  surface2:  '#1E2447',
  surface3:  '#2A3057',
  border:    '#2A3057',
  border2:   '#3A4170',
  borderHi:  '#4F5790',

  // accents from the logo gradient
  cyan:      '#5DD5F0',  // logo S start
  cyanDeep:  '#3FBFD9',
  cyanGlow:  'rgba(93, 213, 240, 0.35)',
  magenta:   '#F06AE8',  // logo SWAP end
  magentaDeep:'#C946C0',
  magentaGlow:'rgba(240, 106, 232, 0.35)',
  // legacy alias used across v13 components — points to the logo magenta
  pink:      '#F06AE8',
  pinkDark:  '#1A0820',

  // secondaries
  blue:      '#7B8AF5',
  blueBright:'#A6B4FF',
  cyanTeal:  '#4FE0D0',
  amber:     '#FFB86C',
  red:       '#FF4D4D',
  redLight:  '#FF8080',
  gold:      '#FFD84D',
  cgcBlue:   '#85B7EB',

  // text
  textHi:    '#F2F4FF',
  textMid:   '#B5BAE0',
  textLow:   '#8E94C0',
  textDim:   '#5A6090',
};

// ─── Spacing scale (point values) ────────────────────────────────────────────
export const SPACE = {
  xxs: 2,
  xs:  4,
  sm:  8,
  md:  12,
  base:16,
  lg:  20,
  xl:  28,
  xxl: 40,
};

// ─── Border radius scale (point values) ──────────────────────────────────────
export const RADIUS = {
  xs:   4,
  sm:   6,
  md:   8,
  base: 10,
  lg:   14,
  xl:   20,
  pill: 999,
};

// ─── Currency catalog (used for display formatting) ──────────────────────────
export const CURRENCIES = {
  THB: { symbol: '฿',  name: 'Thai baht',          locale: 'th-TH' },
  USD: { symbol: '$',  name: 'US dollar',          locale: 'en-US' },
  PHP: { symbol: '₱',  name: 'Philippine peso',    locale: 'en-PH' },
  JPY: { symbol: '¥',  name: 'Japanese yen',       locale: 'ja-JP' },
  MYR: { symbol: 'RM', name: 'Malaysian ringgit',  locale: 'ms-MY' },
  SGD: { symbol: 'S$', name: 'Singapore dollar',   locale: 'en-SG' },
};

// THB-base fallback FX rates (Frankfurter refreshes these via /api/fx).
export const DEFAULT_FX = {
  THB: 1, USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383,
};

export function fmtMoney(amountTHB, currency, fx) {
  const rate = (fx && fx[currency]) || DEFAULT_FX[currency];
  const converted = (amountTHB || 0) * rate;
  const c = CURRENCIES[currency] || CURRENCIES.THB;
  return `${c.symbol}${Math.round(converted).toLocaleString(c.locale)}`;
}

// ─── Gradient stops (raw color stops; platform layers compose the gradient) ──
export const GRADIENT_PRIMARY_STOPS = [
  { offset: 0,   color: COLORS.cyan    },
  { offset: 1.0, color: COLORS.magenta },
];

// Card photo aspect ratio — sacred per README_v2 §1. NEVER 1:1.
export const CARD_ASPECT = 5 / 7;
