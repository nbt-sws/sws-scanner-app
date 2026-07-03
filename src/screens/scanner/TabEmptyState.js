// src/screens/scanner/TabEmptyState.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

// SCN87 — restored from Scanner.js (was orphaned during SCN86 extraction).
const mercariBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '12px 16px', fontSize: SZ.sm, fontWeight: 600,
  color: T.textHi, background: T.surface2,
  border: `1px solid ${T.border2}`, borderRadius: 12,
  textDecoration: 'none', cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function TabEmptyState({ activeTab, totalSold, gradedCount, rawCount, fallbackLinks, onSwitchTab }) {
  const copy = (() => {
    if (totalSold === 0) {
      return {
        headline: 'No matching listings found',
        body: "We couldn't find this card on eBay automatically. Try the direct searches below.",
        cta: 'links',
      };
    }
    if (activeTab === 'Graded') {
      return {
        headline: 'No graded slabs available',
        body: `None of the ${totalSold} current listings are PSA / BGS / CGC / ARS graded. ` +
              (rawCount > 0 ? `Switch to Raw to see ${rawCount} ungraded listing${rawCount === 1 ? '' : 's'}.` : ''),
        cta: 'switch-raw',
      };
    }
    if (activeTab === 'Raw') {
      return {
        headline: 'Only graded listings available',
        body: `All ${gradedCount} current listing${gradedCount === 1 ? '' : 's'} for this card are in graded slabs. ` +
              `Switch to Graded to see them.`,
        cta: 'switch-graded',
      };
    }
    return {
      headline: 'No data for this tab',
      body: 'Try another tab or the direct eBay search below.',
      cta: 'links',
    };
  })();

  return (
    <div style={{
      padding: '18px 16px',
      background: 'rgba(93,213,240,0.06)',
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      margin: '4px 0 12px',
    }}>
      <div style={{
        fontSize: SZ.md, color: T.textHi, fontWeight: 600,
        fontFamily: T.fontDisplay, letterSpacing: '0.02em', marginBottom: 6,
      }}>
        {copy.headline}
      </div>
      <div style={{ fontSize: SZ.sm, color: T.textMid, lineHeight: 1.55, marginBottom: 12 }}>
        {copy.body}
      </div>

      {copy.cta === 'switch-raw' && rawCount > 0 && (
        <button
          type="button"
          onClick={() => onSwitchTab('Raw')}
          style={{
            background: T.gradientPrimary, border: 'none', color: T.bgDeep,
            padding: '10px 16px', borderRadius: 999, fontWeight: 700,
            fontSize: SZ.sm, fontFamily: T.fontDisplay, letterSpacing: '0.08em',
            cursor: 'pointer', textTransform: 'uppercase',
          }}
        >
          Switch to Raw ({rawCount})
        </button>
      )}
      {copy.cta === 'switch-graded' && gradedCount > 0 && (
        <button
          type="button"
          onClick={() => onSwitchTab('Graded')}
          style={{
            background: T.gradientPrimary, border: 'none', color: T.bgDeep,
            padding: '10px 16px', borderRadius: 999, fontWeight: 700,
            fontSize: SZ.sm, fontFamily: T.fontDisplay, letterSpacing: '0.08em',
            cursor: 'pointer', textTransform: 'uppercase',
          }}
        >
          Switch to Graded ({gradedCount})
        </button>
      )}
      {copy.cta === 'links' && fallbackLinks && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {fallbackLinks.ebaySold && (
            <a href={fallbackLinks.ebaySold} target="_blank" rel="noopener noreferrer" style={mercariBtn}>
              eBay · sold listings (web search) ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
