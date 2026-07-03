// src/screens/Privacy.js — v14, G1
// SwibSwap Privacy Policy. Required for App Store + Play Store submission
// (both ask for a publicly accessible URL during the metadata stage), for
// Apple's "Account Deletion" requirement, and for PDPA (Thailand) + GDPR
// compliance. Rendered as a static React page; the canonical public URL is
// https://swibswap.com/privacy.
//
// Content checklist below mirrors:
//   - Apple App Store Review Guideline 5.1.1
//   - Google Play Data safety section
//   - Thailand PDPA §31 (privacy notice)
//   - EU GDPR §13 (information to provide where personal data is collected)

import React from 'react';
import { T, SZ } from '../theme';
import Logo from '../Logo';

export default function Privacy() {
  return (
    <div style={{ padding: '20px 16px 80px', maxWidth: 720, margin: '0 auto', color: T.textHi }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Logo height={40} />
      </div>

      <h1 style={{ fontSize: SZ.xxl, fontWeight: 700, fontFamily: T.fontDisplay, letterSpacing: '0.04em', marginBottom: 4 }}>
        Privacy Policy
      </h1>
      <p style={{ fontSize: SZ.sm, color: T.textLow, fontFamily: T.fontMono, marginBottom: 28 }}>
        Effective 1 June 2026 · last updated 18 May 2026
      </p>

      <Section title="Who we are">
        SwibSwap is operated by I1NOV Co., Ltd. (the "Company", "we", "us"),
        registered in Bangkok, Thailand. SwibSwap is a trading-card scanner
        and marketplace product available as a web app at swibswap.com and as
        native apps on iOS + Android.
      </Section>

      <Section title="What we collect">
        <ul>
          <li><strong>Account data:</strong> the name, email, profile photo,
            and any provider-linked ID (Google, Apple, LINE) returned by your
            sign-in provider. We store this in Firebase Authentication.</li>
          <li><strong>Card scan data:</strong> photos you take with the
            scanner, the cropped + watermarked variants we produce, and the
            metadata our recognition layer extracts (card code, rarity,
            language). Photos are stored in Firebase Storage under
            <code>cards/&#123;uid&#125;/*</code> with owner-only read access.</li>
          <li><strong>Vault + transaction data:</strong> the cards you save
            to your vault, your purchase / sale prices, and the resulting
            P/L. Stored in Firestore under <code>vault/&#123;id&#125;</code>
            with userId-match access.</li>
          <li><strong>Membership tier + payment proof:</strong> when you
            subscribe to Silver / Gold / Platinum, RevenueCat or Stripe (the
            two billing providers we use) returns a webhook receipt that we
            store at <code>subscriptions/&#123;uid&#125;</code>. We do NOT see
            or store your card number — only the receipt / transaction ID.</li>
          <li><strong>KYC documents</strong> (for sellers + bidders only):
            front + back of your Thai National ID and a selfie, used to
            verify identity. Stored encrypted; reviewed by SwibSwap admins;
            never shared with other users. See the KYC section below.</li>
        </ul>
      </Section>

      <Section title="What we don't collect">
        We do not collect device contacts, calendar, location, microphone,
        SMS, or browsing history. We do not run third-party analytics SDKs
        that send your personal data to ad networks. We do not show ads in
        the app.
      </Section>

      <Section title="How we use your data">
        <ul>
          <li>To identify the cards you scan (we send the photo to our
            recognition layer, Anthropic Claude + Google Cloud Vision)</li>
          <li>To fetch prices for those cards (we send the card code + name
            to eBay + cardpiece.com APIs)</li>
          <li>To run your vault, profile, and subscription</li>
          <li>To detect fraud on the SwibSwap marketplace (e.g. KYC
            verification, dispute resolution)</li>
          <li>To send you account + transactional emails (sign-in alerts,
            payment receipts, dispute updates) — never marketing without
            your explicit opt-in</li>
        </ul>
      </Section>

      <Section title="Third-party processors">
        We use the following sub-processors. All of them are bound by their
        own privacy commitments; we send them only the data necessary for
        the listed function.
        <ul>
          <li><strong>Firebase</strong> (Google LLC) — Auth, Firestore,
            Storage, hosting</li>
          <li><strong>Anthropic Claude API</strong> — card recognition</li>
          <li><strong>Google Cloud Vision</strong> — reverse-image search
            for the eBay listing pipeline</li>
          <li><strong>eBay Developer Program</strong> — Browse + Finding
            API for pricing data</li>
          <li><strong>Vercel</strong> — serverless function hosting</li>
          <li><strong>RevenueCat + Apple App Store + Google Play</strong> —
            in-app subscription billing</li>
          <li><strong>Stripe</strong> — web subscription billing</li>
          <li><strong>Omise</strong> — Thai-baht payments (PromptPay + cards)
            on the SwibSwap marketplace</li>
        </ul>
      </Section>

      <Section title="Where your data lives">
        Our Firebase project is hosted in the <code>asia-southeast1</code>
        region (Singapore). KYC documents are encrypted at rest with a
        customer-managed key. Backups are retained for 30 days, then deleted.
      </Section>

      <Section title="Your rights (PDPA + GDPR)">
        You have the right to:
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Correct anything that's wrong</li>
          <li>Delete your account (see Account Deletion below) — we will
            erase your data within 30 days</li>
          <li>Withdraw consent for processing where it's based on consent</li>
          <li>Object to processing or request restriction</li>
          <li>Receive a portable copy of your vault data in JSON</li>
          <li>Complain to the Personal Data Protection Committee (Thailand) or your
            local supervisory authority (EU)</li>
        </ul>
        Email <a href="mailto:privacy@swibswap.com" style={linkStyle}>privacy@swibswap.com</a>
        {' '}to exercise any of these rights. We aim to respond within 14
        days; PDPA + GDPR allow up to 30.
      </Section>

      <Section title="Account deletion (Apple's requirement)">
        From <strong>Settings → Membership → Delete my account</strong> you
        can permanently delete:
        <ul>
          <li>Your Firebase Authentication record (sign-in is revoked
            immediately)</li>
          <li>Your <code>/users/&#123;uid&#125;</code> profile document</li>
          <li>All your vault entries</li>
          <li>All your card photos in Storage</li>
          <li>All transaction logs you authored</li>
          <li>Any KYC documents on file</li>
        </ul>
        Sample images you contributed to the community DB (the
        <code>verified_cards</code> collection) remain anonymized — they're
        watermarked product references, not personal data. If you would
        prefer those removed too, email privacy@swibswap.com and we'll
        process it manually within 14 days.
      </Section>

      <Section title="Children">
        SwibSwap is not directed at children under 13 and we do not knowingly
        collect data from them. If you believe a child has signed up, email
        us and we'll delete the account.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy as the product changes. The Effective date
        at the top tracks the current version. Material changes will be
        announced via an in-app banner and an email to your account address.
      </Section>

      <Section title="Contact">
        <ul>
          <li>Email: <a href="mailto:privacy@swibswap.com" style={linkStyle}>privacy@swibswap.com</a></li>
          <li>Address: I1NOV Co., Ltd., Bangkok, Thailand (full address provided upon request)</li>
          <li>Data Protection Officer: DPO@swibswap.com</li>
        </ul>
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
      <div style={{
        fontSize: SZ.md, lineHeight: 1.65, color: T.textMid,
      }}>
        {children}
      </div>
    </section>
  );
}

const linkStyle = { color: T.cyan, textDecoration: 'underline' };
