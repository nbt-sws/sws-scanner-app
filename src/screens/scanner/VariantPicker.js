// src/screens/scanner/VariantPicker.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export function ConfirmRarityPanel({ currentRarity, onConfirm }) {
  const [rarity, setRarity] = useState(currentRarity || '');
  const [confirmed, setConfirmed] = useState(false);
  // SCN70 — keep the dropdown in sync when the user picks a variant
  // AFTER the panel first rendered. useState() only fires once on mount,
  // which left the dropdown blank when the variant pick happened later.
  useEffect(() => {
    if (currentRarity && currentRarity !== rarity) {
      setRarity(currentRarity);
      setConfirmed(false);   // re-arm so the user re-confirms the new pick
    }
  // eslint-disable-next-line
  }, [currentRarity]);
  const allOptions = Object.entries(OP_RARITIES);
  const inputStyle = {
    width: '100%', background: T.surface2, color: T.textHi,
    border: `1px solid ${T.border2}`, borderRadius: 10,
    padding: '12px 14px', fontSize: SZ.md, marginBottom: 10,
    outline: 'none', boxSizing: 'border-box', fontFamily: T.fontMono,
  };
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>CONFIRM RARITY</SectionLabel>
        {confirmed && <Pill tag="Confirmed" />}
      </div>
      <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 12, lineHeight: 1.5 }}>
        The variant is locked. Verify the rarity matches your physical card — this is what
        drives the eBay pricing query.
      </div>
      <select style={inputStyle} value={rarity} onChange={(e) => setRarity(e.target.value)}>
        {allOptions.map(([acronym, label]) => (
          <option key={acronym} value={acronym}>
            {acronym} — {label}
          </option>
        ))}
      </select>
      <Button onClick={() => { setConfirmed(true); onConfirm(rarity); }} disabled={!rarity}>
        Confirm & Refresh Pricing
      </Button>
    </Card>
  );
}

export default function VariantPicker({ loading, variants, onPick, currentRarity }) {
  if (loading) {
    return <LoadingCard text="Looking up all printed variants of this code…" />;
  }
  if (!variants || variants.length === 0) {
    // No variants found — show a helpful message asking the user to use Edit Fields.
    return (
      <Card>
        <SectionLabel>NO VARIANTS FOUND</SectionLabel>
        <div style={{ fontSize: SZ.sm, color: T.textMid, marginTop: 8 }}>
          We couldn&apos;t find SAMPLE images for this code in the official databases.
          Use <strong>Edit Fields</strong> above to refine the code or language, or
          continue with Haiku&apos;s call and tap <strong>Save to community database</strong> —
          your scan becomes the first SAMPLE for this card.
        </div>
      </Card>
    );
  }
  // If only one variant exists, no selection needed — auto-pick.
  if (variants.length === 1) {
    setTimeout(() => onPick(variants[0]), 0);
    return null;
  }
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>SELECT MATCHING VARIANT</SectionLabel>
        <Pill tag={`${variants.length} found`} />
      </div>
      <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 14, lineHeight: 1.5 }}>
        This code has multiple printings. Tap the one that matches your physical card —
        your selection locks the rarity used for pricing and the community DB.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {variants.map((v, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(v)}
            style={{
              background: T.surface2, border: `1px solid ${currentRarity === v.rarity ? T.cyan : T.border2}`,
              borderRadius: 12, padding: 8, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              transition: 'border-color 0.15s, transform 0.1s',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <img
              src={`/api/proxy-image?url=${encodeURIComponent(v.imageUrl)}`}
              alt={v.rarity || 'variant'}
              loading="lazy"
              style={{
                width: '100%', height: 'auto', borderRadius: 8, display: 'block',
                aspectRatio: '63 / 88', objectFit: 'contain', background: T.bgDeep,
              }}
              onError={(e) => {
                // Fallback to direct URL if proxy fails for any reason.
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = '1';
                  e.currentTarget.src = v.imageUrl;
                } else {
                  e.currentTarget.style.opacity = '0.3';
                }
              }}
            />
            <div style={{
              fontSize: SZ.sm, color: currentRarity === v.rarity ? T.cyan : T.textMid,
              fontFamily: T.fontMono, textAlign: 'center', lineHeight: 1.3, fontWeight: 600,
            }}>
              {v.rarity || '—'}
            </div>
            {v.fromDb && (
              <div style={{ fontSize: SZ.xs - 2, color: T.cyan, fontFamily: T.fontDisplay, letterSpacing: '0.06em' }}>
                VERIFIED
              </div>
            )}
          </button>
        ))}
      </div>
    </Card>
  );
}
