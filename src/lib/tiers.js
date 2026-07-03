// src/lib/tiers.js — v14, A2
// Membership tier metadata shared between web (Settings → Membership panel)
// and mobile (Profile tab). Pure data; no DOM, no React, no Firebase.
//
// The actual user tier lives on /users/{uid}.subscriptionTier in Firestore.
// Until RevenueCat (E1) + Stripe (E2) ship, all users are 'user' tier and
// the upgrade CTAs link to a "Coming soon" panel.

export const TIERS = ['user', 'silver', 'gold', 'platinum'];

// Tier-by-tier BSA fee rates pulled from the locked NBT_Rate_3 config.
// (Mirrored here so the UI can show a comparison table without re-fetching
// the fee engine for every cell.)
// Bracket: { flat: bool, rates: [user, silver, gold, platinum] }
// e.g. for a ฿15,001-50,000 sale, gold pays 6.0% vs user's 13.0%.
export const TIER_LABELS = {
  user:     { name: 'User',     short: 'U',  color: '#8E94C0' },
  silver:   { name: 'Silver',   short: 'S',  color: '#B5BAE0' },
  gold:     { name: 'Gold',     short: 'G',  color: '#FFD84D' },
  platinum: { name: 'Platinum', short: 'P',  color: '#A6B4FF' },
};

// Benefits per tier — used to populate the Membership panel + the upgrade
// CTAs. Source of truth is `swibswap_project.md` (handoff doc).
export const TIER_BENEFITS = {
  user: {
    headline: 'Free forever',
    monthlyTHB: 0,
    annualTHB: 0,
    bsaSummary: '13% – 15% per sale',  // ฿15k+ bracket as illustrative
    perks: [
      'Unlimited scanning (fair-use cap)',
      'Vault — track up to 100 cards',
      'Browse community catalog + eBay pricing',
      'Sell on SwibSwap (no listing, view-only)',
    ],
    locked: [
      'Listing on SwibSwap.com',
      'Bidding in auctions',
      'Consign mode',
      'Multi-folder vault organization',
    ],
  },
  silver: {
    headline: 'For casual sellers',
    monthlyTHB: 99,
    annualTHB: 990,
    bsaSummary: '7% – 8% per sale',
    perks: [
      'Everything in User, plus:',
      'List + sell on SwibSwap.com',
      'Vault — up to 1,000 cards',
      'Bid in auctions',
      'Bulk-import via CSV',
      'Email support',
    ],
  },
  gold: {
    headline: 'For active collectors + flippers',
    monthlyTHB: 249,
    annualTHB: 2490,
    bsaSummary: '5.5% – 6.5% per sale',
    perks: [
      'Everything in Silver, plus:',
      'Consign mode (7-day decay)',
      'Vault — up to 5,000 cards',
      'Folder organization',
      'Real eBay sold-history graphs',
      'Priority support',
    ],
  },
  platinum: {
    headline: 'For dealers + power-sellers',
    monthlyTHB: 599,
    annualTHB: 5990,
    bsaSummary: '3.5% per sale (flat)',
    perks: [
      'Everything in Gold, plus:',
      'Vault — unlimited',
      'Multi-hop consignment chains (up to 7 hops)',
      'Vault Auctions (bundle up to 18 cards)',
      'Custom store URL on SwibSwap.com',
      'Verified Dealer badge',
      'Dedicated account manager',
    ],
  },
};

// Used by the fee preview UI to highlight which tier the user is on.
export function tierIndex(tier) {
  return Math.max(0, TIERS.indexOf(String(tier || 'user').toLowerCase()));
}

// Friendly "Upgrade from X to Y" copy generator.
export function nextTierAbove(currentTier) {
  const i = tierIndex(currentTier);
  return i < TIERS.length - 1 ? TIERS[i + 1] : null;
}
