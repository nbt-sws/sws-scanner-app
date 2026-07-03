// src/lib/fees/constants.js — v14
// Tier + bracket metadata for the fee engine.
// Platform-agnostic (no DOM, no RN). Imported by both web and mobile.

export const TIERS = ['user', 'silver', 'gold', 'platinum'];

export const TIER_IDX = { user: 0, silver: 1, gold: 2, platinum: 3 };

export const BRACKETS = [100, 15000, 50000, 50001];

export const BRACKET_LABELS = [
  '≤ ฿100 (flat)',
  '฿101 – ฿15,000',
  '฿15,001 – ฿50,000',
  '฿50,001+',
];

// Default BSA + constants — used if no NBT config is supplied.
// These mirror the handoff's DEFAULT_BSA + DEFAULT_CONSTANTS in js/config.js.
// In practice every call site should pass the loaded NBT_Rate_3 config from
// config.json, but these are here as a safety net.
export const DEFAULT_BSA_RATES = {
  100:   { flat: true,  rates: [3.5,   2.5,   1.5,   0.5  ] },
  15000: { flat: false, rates: [0.15,  0.075, 0.065, 0.04 ] },
  50000: { flat: false, rates: [0.135, 0.065, 0.055, 0.03 ] },
  50001: { flat: false, rates: [0.125, 0.055, 0.045, 0.02 ] },
};

export const DEFAULT_CONSIGN_DECAY = [
  0.0050, 0.0067, 0.0091, 0.0122, 0.0165, 0.0223, 0.0300,
];

export const DEFAULT_CONSTANTS = {
  shippingCharge:       50,
  shippingCost:         30,
  ccFee:                0.035,
  ppFee:                0.01,
  ppDisc:               0.02,
  vat:                  0.07,
  consignExtraRate:     0.03,
  consignPayback:       0.01,
  consignDecayRates:    DEFAULT_CONSIGN_DECAY.slice(),
  auctionSellerFeeRate: 0,
};
