// src/lib/fees/config.js — v14
// NBT_Rate_3 (the locked SwibSwap fee config) as an ES module default export.
//
// Generated 2026-05-08T16:43:33.645Z. To update: paste a new NBT_Rate_*.json
// from the simulator into this file. The shape must stay identical: top-level
// { name, savedAt, version, constants, bsaRates }.
//
// We bundle this as JS (not JSON) so both the client webpack build AND the
// Vercel serverless bundler reliably include it. JSON imports on Node 18/20
// without --experimental-json-modules require import-attributes syntax which
// doesn't render consistently across Vercel's esbuild and CRA's webpack.

const NBT = {
  name: 'NBT Rate 3',
  savedAt: '2026-05-08T16:43:33.645Z',
  version: '1.0',
  constants: {
    shippingCharge:       50,
    shippingCost:         30,
    ccFee:                0.035,
    ppFee:                0.01,
    ppDisc:               0.025,
    vat:                  0.07,
    consignExtraRate:     0.025,
    consignPayback:       0,
    consignDecayRates:    [0.0042, 0.006, 0.01, 0.015, 0.018, 0.02, 0.025],
    auctionSellerFeeRate: 0.5,
  },
  bsaRates: {
    100:   { flat: true,  rates: [6,     5,     3.5,   2.25 ] },
    15000: { flat: false, rates: [0.15,  0.08,  0.065, 0.035] },
    50000: { flat: false, rates: [0.13,  0.075, 0.06,  0.035] },
    50001: { flat: false, rates: [0.12,  0.07,  0.055, 0.035] },
  },
};

export default NBT;
