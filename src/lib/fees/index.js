// src/lib/fees/index.js — v14
// Re-exports the fee engine + loaded NBT_Rate_3 config as the canonical
// single source of truth for fee math across web, mobile, and server.
//
// Import like:
//   import { calc, calcChain, getBSAFee, NBT } from 'src/lib/fees';
//   const result = calc(15000, 'gold', 'platinum', 'buysell', 'deliver', 'cc',
//                       8000, 0, NBT.constants, NBT.bsaRates);

import NBT from './config.js';

export {
  fmt, fmtPct, r2,
  getBracket, getBSAFee, getActiveFee, getConsignRate,
  calc, calcChain,
  ppBreakevenDiscount,
} from './calc.js';

export {
  TIERS, TIER_IDX, BRACKETS, BRACKET_LABELS,
  DEFAULT_BSA_RATES, DEFAULT_CONSTANTS, DEFAULT_CONSIGN_DECAY,
} from './constants.js';

// The loaded NBT_Rate_3 config — `constants` + `bsaRates` are what every
// callsite needs to pass through to calc()/calcChain().
export { NBT };
export default NBT;
