// src/lib/theme/web.js — v14
// Web-only composition layer on top of platform-agnostic tokens.js.
// Adds CSS strings (font stacks with fallbacks, linear-gradient values).
// The existing src/theme.js re-exports from here so v13 components don't
// have to change their import paths.

import {
  SZ, FONT_FAMILY, COLORS, SPACE, RADIUS, CURRENCIES, DEFAULT_FX,
  fmtMoney, GRADIENT_PRIMARY_STOPS, CARD_ASPECT,
} from './tokens.js';

// Re-export pure tokens so callers can `import { SZ, COLORS } from 'lib/theme/web'`.
export { SZ, COLORS, SPACE, RADIUS, CURRENCIES, DEFAULT_FX, fmtMoney, CARD_ASPECT };

// Web font CSS strings — with system fallbacks. RN doesn't need these
// because expo-font registers the families directly.
export const FONTS = {
  display: `'${FONT_FAMILY.display}', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif`,
  body:    `'${FONT_FAMILY.body}', 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  mono:    `'${FONT_FAMILY.mono}', 'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace`,
};

// CSS linear-gradient strings — built from token stops for consistency.
export const GRADIENTS = {
  primary:     `linear-gradient(135deg, ${COLORS.cyan} 0%, ${COLORS.magenta} 100%)`,
  primarySoft: `linear-gradient(135deg, rgba(93,213,240,0.2) 0%, rgba(240,106,232,0.2) 100%)`,
  glow:        `linear-gradient(135deg, rgba(93,213,240,0.6), rgba(240,106,232,0.6))`,
};

// T — the legacy theme object v13 components import via `import { T } from './theme'`.
// Built on the new tokens so we have a single source of truth.
export const T = {
  // backgrounds
  bg:        COLORS.bg,
  bgDeep:    COLORS.bgDeep,
  surface:   COLORS.surface,
  surface2:  COLORS.surface2,
  surface3:  COLORS.surface3,
  border:    COLORS.border,
  border2:   COLORS.border2,
  borderHi:  COLORS.borderHi,

  // accents
  cyan:      COLORS.cyan,
  cyanDeep:  COLORS.cyanDeep,
  cyanGlow:  COLORS.cyanGlow,
  magenta:   COLORS.magenta,
  magentaDeep:COLORS.magentaDeep,
  magentaGlow:COLORS.magentaGlow,
  pink:      COLORS.pink,
  pinkDark:  COLORS.pinkDark,

  // secondaries
  blue:      COLORS.blue,
  blueBright:COLORS.blueBright,
  cyanTeal:  COLORS.cyanTeal,
  amber:     COLORS.amber,
  red:       COLORS.red,
  redLight:  COLORS.redLight,
  gold:      COLORS.gold,
  cgcBlue:   COLORS.cgcBlue,

  // text
  textHi:    COLORS.textHi,
  textMid:   COLORS.textMid,
  textLow:   COLORS.textLow,
  textDim:   COLORS.textDim,

  // gradients
  gradientPrimary:     GRADIENTS.primary,
  gradientPrimarySoft: GRADIENTS.primarySoft,
  gradientGlow:        GRADIENTS.glow,

  // fonts (string references for inline styles)
  fontMono:    FONTS.mono,
  fontDisplay: FONTS.display,
  fontBody:    FONTS.body,
};

// Also expose the raw stops in case a component wants to build a custom gradient.
export { GRADIENT_PRIMARY_STOPS };
