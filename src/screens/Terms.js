// src/screens/Terms.js — v14, G1
// SwibSwap Terms of Service. Required for App Store + Play Store submission
// alongside the Privacy Policy. The canonical public URL is
// https://swibswap.com/terms.

import React from 'react';
import { T, SZ } from '../theme';
import Logo from '../Logo';

export default function Terms() {
  return (
    <div style={{ padding: '20px 16px 80px', maxWidth: 720, margin: '0 auto', color: T.textHi }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Logo height={40} />
      </div>

      <h1 style={{ fontSize: SZ.xxl, fontWeight: 700, fontFamily: T.fontDisplay, letterSpacing: '0.04em', marginBottom: 4 }}>
        Terms of Service
      </h1>
      <p style={{ fontSize: SZ.sm, color: T.textLow, fontFamily: T.fontMono, marginBottom: 28 }}>
        Effective 1 June 2026 · last updated 18 May 2026
      </p>

      <Section title="1. Acceptance">
        By creating a SwibSwap account or using the SwibSwap apps you agree
        to these Terms and the linked Privacy Policy. If you don't agree,
        don't use the service.
      </Section>

      <Section title="2. The service">
        SwibSwap is (a) a trading-card identification, pricing, and vault
        tracking tool and (b) a marketplace where users can buy, sell, bid
        on, and consign trading cards. The marketplace launches with One
        Piece TCG; other TCGs may be added.
      </Section>

      <Section title="3. Eligibility">
        You must be at least 18 years old to use the marketplace features.
        Scanner + vault features are available to users 13+. KYC verification
        (Thai National ID for now) is required for any seller or bidder.
      </Section>

      <Section title="4. Your account">
        You're responsible for keeping your sign-in credentials safe and for
        every action taken under your account. Tell us immediately if you
        suspect unauthorized access. We may suspend or close accounts that
        violate these Terms, attempt fraud, or harm other users.
      </Section>

      <Section title="5. Marketplace rules">
        <ul>
          <li>You may only list cards you actually own and have lawful
            title to.</li>
          <li>Listings must accurately represent condition (Mint / NM /
            Lightly Played / Played) and any grading (PSA / BGS / CGC / ARS).
            Misrepresenting condition is grounds for listing removal and
            account suspension.</li>
          <li>You may not list counterfeit cards. We use Vision API
            reverse-image search to flag suspected counterfeits.</li>
          <li>Once a buyer pays, you have 3 business days to ship the card.</li>
          <li>Bidders in auctions are bound by their bids. Retractions
            require a valid reason; 3 strikes within 90 days trigger a
            bidding suspension.</li>
          <li>The 7-day consignment window operates per the published rate
            table (`NBT Rate 3`). The buyer pays a consign extra that
            increases each day; the platform pays a small payback to the
            consignor on the first hop.</li>
        </ul>
      </Section>

      <Section title="6. Fees">
        SwibSwap charges a Buyer / Seller / Auction fee ("BSA") at the rates
        published in-app and visible on every sale-preview screen. Fees are
        finalized at the moment of confirmation and are inclusive of Thai
        VAT (7%, levied only on our platform fee revenue per Revenue Code
        §78/1). Shipping is collected from the buyer at a flat ฿50, and we
        pay the courier ฿30 — the ฿20 differential is platform revenue and
        likewise VAT-applicable.
      </Section>

      <Section title="7. Payments">
        SwibSwap processes baht payments through Omise. We support
        PromptPay (with a platform-subsidized 2.5% discount on fixed-price
        listings — not auctions) and major credit / debit cards (with a
        pass-through 3.5% processing fee). For international auctions,
        currency conversion is the bidder's responsibility and uses the
        Frankfurter mid-market rate at confirmation time.
      </Section>

      <Section title="8. Refunds + disputes">
        <ul>
          <li>Buyers may open a dispute within 7 days of receipt if the card
            isn't as described.</li>
          <li>Sellers have 3 business days to respond before the dispute
            escalates to SwibSwap admin review.</li>
          <li>If admin sides with the buyer, we refund the gross sale amount
            and arrange return shipping at the seller's cost.</li>
          <li>If admin sides with the seller, the sale is finalized.</li>
          <li>Admin decisions are final; either party may close their
            account afterward.</li>
        </ul>
      </Section>

      <Section title="9. Prohibited conduct">
        <ul>
          <li>Reverse-engineering, scraping, or automated mass-querying
            beyond the published rate limits</li>
          <li>Uploading photos you don't own the rights to</li>
          <li>Using the marketplace to launder funds or for other illegal
            purposes</li>
          <li>Harassing or threatening other users</li>
          <li>Circumventing fees by completing payments outside SwibSwap
            after meeting on the platform</li>
        </ul>
      </Section>

      <Section title="10. Intellectual property">
        SwibSwap is © I1NOV Co., Ltd. The SwibSwap word mark + logo are our
        trademarks. Trading-card artwork remains the property of the
        respective rights holders (Bandai for One Piece TCG, Konami for
        Yu-Gi-Oh!, etc.). We display SAMPLE images watermarked with the
        SwibSwap.com wordmark; collectors are free to share these for
        identification purposes but not for commercial resale of the
        underlying artwork.
      </Section>

      <Section title="11. Subscriptions">
        Silver / Gold / Platinum memberships are billed monthly or annually
        in advance via Apple's IAP, Google Play Billing, or Stripe. You can
        cancel at any time from your billing provider's settings; the
        membership stays active until the end of the paid period. We do not
        offer pro-rated refunds on partial periods.
      </Section>

      <Section title="12. Account deletion">
        See the Privacy Policy. From Settings → Membership → Delete my
        account you can erase your account + data within 30 days.
      </Section>

      <Section title="13. No warranty + liability cap">
        SwibSwap is provided "as is". We work hard on accurate card
        identification, but Haiku + Vision are not infallible — always
        verify with the SAMPLE image preview before committing to a price.
        Our maximum aggregate liability to any user is the total fees that
        user paid SwibSwap in the trailing 12 months.
      </Section>

      <Section title="14. Governing law + jurisdiction">
        These Terms are governed by Thai law. Disputes are subject to the
        exclusive jurisdiction of the courts of Bangkok, Thailand.
      </Section>

      <Section title="15. Changes">
        We may update these Terms as the product changes. Material changes
        get an in-app banner + an email to your account address at least 14
        days before they take effect. Continued use after the effective
        date constitutes acceptance.
      </Section>

      <Section title="16. Contact">
        Email <a href="mailto:legal@swibswap.com" style={linkStyle}>legal@swibswap.com</a>
        {' '}for any Terms-of-Service questions.
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontSize: SZ.lg, fontWeight: 600, fontFamily: T.fontDisplay,
        letterSpacing: '0.04em', color: T.cyan, marginBottom: 10,
      }}>
        {title}
      </h2>
      <div style={{ fontSize: SZ.md, lineHeight: 1.65, color: T.textMid }}>
        {children}
      </div>
    </section>
  );
}

const linkStyle = { color: T.cyan, textDecoration: 'underline' };
