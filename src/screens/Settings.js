// src/screens/Settings.js — primary + secondary currency, sign-out, build info.
// v14 (A2): adds Membership panel showing the user's tier + benefits +
// comparison vs higher tiers. Upgrade CTAs link to "Coming soon" until
// RevenueCat (E1) + Stripe (E2) wire up real billing.

import React, { useState } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../theme';
import { Button } from '../components';
import { signOut } from '../auth';
import { useSubscription } from '../hooks/useSubscription';
import { TIERS, TIER_LABELS, TIER_BENEFITS, nextTierAbove } from '../lib/tiers';
import Logo from '../Logo';

export default function Settings({ user, currency, currency2, onCurrencyChange, onCurrency2Change, fx }) {
  const { tier } = useSubscription(user?.uid);
  return (
    <div style={{ padding: '20px 16px 80px', maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ fontSize: SZ.xl, fontWeight: 600, margin: '8px 0 20px' }}>Settings</h2>

      {user && (
        <div style={{ background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.05em' }}>SIGNED IN AS</div>
          <div style={{ fontSize: SZ.base, marginTop: 4 }}>{user.displayName || user.email || user.uid}</div>
        </div>
      )}

      <MembershipPanel tier={tier} currency={currency} fx={fx} />

      <CurrencyPicker
        label="PRIMARY CURRENCY"
        value={currency}
        onChange={onCurrencyChange}
      />

      <CurrencyPicker
        label="SECONDARY CURRENCY (shown alongside primary)"
        value={currency2}
        onChange={onCurrency2Change}
        disabledKey={currency}
      />

      <Button variant="danger" onClick={signOut} style={{ marginTop: 24 }}>Sign out</Button>

      <div style={{ textAlign: 'center', marginTop: 32, opacity: 0.6 }}>
        <Logo height={28} />
        <div style={{ fontSize: SZ.xs, color: T.textDim, marginTop: 8, fontFamily: T.fontMono, letterSpacing: '0.05em' }}>
          v13.2 · I1NOV · Bangkok
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// MembershipPanel — v14, A2
// Shows the user's current tier with a benefit list + an "Upgrade to {next}"
// CTA. Each tier card is collapsible so the panel doesn't dominate the
// Settings screen — tap a tier to expand and see its perks vs the current
// tier. RevenueCat/Stripe billing is wired in E1+E2; until then the
// upgrade button opens a "Coming soon" modal explaining where billing will
// live.
// ===========================================================
function MembershipPanel({ tier, currency, fx }) {
  const [expanded, setExpanded] = useState(null);  // tier key
  const [showSoonModal, setShowSoonModal] = useState(false);
  const current = TIER_BENEFITS[tier] || TIER_BENEFITS.user;
  const upgradeTo = nextTierAbove(tier);

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.05em', marginBottom: 8,
          fontFamily: T.fontDisplay, fontWeight: 600,
        }}>
          MEMBERSHIP
        </div>

        {/* Current tier hero */}
        <div style={{
          background: T.surface, border: `1px solid ${TIER_LABELS[tier]?.color || T.border}`,
          borderRadius: 14, padding: 16, marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.06em', fontFamily: T.fontDisplay, fontWeight: 600 }}>
                CURRENT TIER
              </div>
              <div style={{
                fontSize: SZ.xxl, fontWeight: 700, fontFamily: T.fontDisplay,
                color: TIER_LABELS[tier]?.color || T.textHi, letterSpacing: '0.04em',
                marginTop: 2,
              }}>
                {TIER_LABELS[tier]?.name || 'User'}
              </div>
              <div style={{ fontSize: SZ.sm, color: T.textMid, marginTop: 4 }}>
                {current.headline}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, letterSpacing: '0.06em' }}>
                BSA FEE
              </div>
              <div style={{ fontSize: SZ.md, color: T.cyan, fontFamily: T.fontMono, fontWeight: 600, marginTop: 4 }}>
                {current.bsaSummary}
              </div>
            </div>
          </div>

          {upgradeTo && (
            <Button
              onClick={() => setShowSoonModal(true)}
              style={{ marginTop: 10, width: '100%' }}
            >
              Upgrade to {TIER_LABELS[upgradeTo].name} ·{' '}
              {fmtMoney(TIER_BENEFITS[upgradeTo].monthlyTHB, currency, fx)}/mo
            </Button>
          )}
        </div>

        {/* Other tiers — tap to expand */}
        {TIERS.filter((t) => t !== tier).map((t) => {
          const isOpen = expanded === t;
          const b = TIER_BENEFITS[t];
          return (
            <button
              key={t}
              onClick={() => setExpanded(isOpen ? null : t)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10, padding: 12, marginBottom: 8,
                cursor: 'pointer', fontFamily: T.fontBody,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  fontSize: SZ.base, fontWeight: 600,
                  color: TIER_LABELS[t].color, fontFamily: T.fontDisplay, letterSpacing: '0.04em',
                }}>
                  {TIER_LABELS[t].name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: SZ.sm, color: T.textMid, fontFamily: T.fontMono }}>
                    {b.monthlyTHB === 0 ? 'Free' : `${fmtMoney(b.monthlyTHB, currency, fx)}/mo`}
                  </span>
                  <span style={{ color: T.textDim, fontSize: SZ.sm }}>{isOpen ? '▴' : '▾'}</span>
                </div>
              </div>
              <div style={{ fontSize: SZ.xs, color: T.textLow, marginTop: 4 }}>
                {b.headline}  ·  BSA {b.bsaSummary}
              </div>
              {isOpen && (
                <ul style={{ margin: '10px 0 0 0', paddingLeft: 20, color: T.textMid, fontSize: SZ.sm, lineHeight: 1.6 }}>
                  {b.perks.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {showSoonModal && (
        <UpgradeSoonModal tier={upgradeTo} onClose={() => setShowSoonModal(false)} currency={currency} fx={fx} />
      )}
    </>
  );
}

function UpgradeSoonModal({ tier, onClose, currency, fx }) {
  const b = TIER_BENEFITS[tier];
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: T.surface, border: `1px solid ${T.border2}`,
        borderRadius: 16, padding: 22, maxWidth: 380, width: '100%',
      }}>
        <div style={{
          fontSize: SZ.xs, color: T.cyan, fontFamily: T.fontDisplay,
          letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6,
        }}>
          COMING SOON
        </div>
        <div style={{
          fontSize: SZ.xl, color: T.textHi, fontWeight: 700,
          fontFamily: T.fontDisplay, marginBottom: 8,
        }}>
          Upgrade to {TIER_LABELS[tier].name}
        </div>
        <div style={{ fontSize: SZ.md, color: T.textMid, lineHeight: 1.55, marginBottom: 12 }}>
          {b.headline} — {fmtMoney(b.monthlyTHB, currency, fx)}/month
          (or {fmtMoney(b.annualTHB, currency, fx)}/year).
        </div>
        <div style={{ fontSize: SZ.sm, color: T.textLow, lineHeight: 1.6, marginBottom: 18 }}>
          In-app upgrade is wired up in the next sprint via RevenueCat (iOS + Android)
          and Stripe (web). For now you can email <a href="mailto:hello@swibswap.com" style={{ color: T.cyan }}>hello@swibswap.com</a> to be on the early-access list.
        </div>
        <Button onClick={onClose} style={{ width: '100%' }}>Got it</Button>
      </div>
    </div>
  );
}

function CurrencyPicker({ label, value, onChange, disabledKey = null }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {Object.keys(CURRENCIES).map((k) => {
          const disabled = k === disabledKey;
          const active = value === k;
          return (
            <button
              key={k}
              onClick={() => !disabled && onChange(k)}
              disabled={disabled}
              style={{
                padding: '12px 0',
                fontSize: SZ.sm,
                background: active ? T.pink : T.surface,
                color: disabled ? T.textDim : active ? T.pinkDark : T.textMid,
                border: `0.5px solid ${active ? T.pink : T.border}`,
                borderRadius: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {CURRENCIES[k].symbol} {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
