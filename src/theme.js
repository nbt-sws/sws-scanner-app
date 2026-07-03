// src/theme.js — v14 shim
// All design tokens now live in src/lib/theme/ as platform-agnostic modules.
// This file just re-exports the web composition layer so existing v13
// components (which import { T, SZ, FONTS, CURRENCIES, fmtMoney } from
// './theme') keep working unchanged.
//
// New code should import from './lib/theme/web' (web) or from
// 'src/lib/theme/tokens' (shared) directly.

export {
  SZ, FONTS, T, COLORS, SPACE, RADIUS,
  CURRENCIES, DEFAULT_FX, fmtMoney,
  GRADIENTS, GRADIENT_PRIMARY_STOPS, CARD_ASPECT,
} from './lib/theme/web.js';
