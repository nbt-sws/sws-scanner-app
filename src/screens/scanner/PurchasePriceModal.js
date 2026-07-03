// src/screens/scanner/PurchasePriceModal.js — SCN86 extracted from Scanner.js
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
const VAULT_GRADE_OPTIONS = [
  'Raw',
  'PSA 10', 'PSA 9',
  'BGS 10', 'BGS 10 BL', 'BGS 9.5',
  'CGC 10', 'CGC 9.5',
  'ARS 10',
  'SGC 10',
];

// Local label helper (was inlined in Scanner.js shared FieldLabel — recreated here).
function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.08em',
      marginBottom: 6, fontFamily: T.fontDisplay, fontWeight: 600,
    }}>{children}</div>
  );
}

export default function PurchasePriceModal({ action, price, setPrice, currencyVal, setCurrencyVal, dateVal, setDateVal, gradeVal = 'Raw', setGradeVal, medianTHB, currency, fx, onConfirm, onCancel }) {
  const inputStyle = {
    width: '100%', background: T.surface2, color: T.textHi,
    border: `1px solid ${T.border2}`, borderRadius: 12,
    padding: '14px 16px', fontSize: SZ.lg, marginBottom: 12,
    outline: 'none', boxSizing: 'border-box', fontFamily: T.fontMono,
  };
  const previewTHB = price && !Number.isNaN(parseFloat(price))
    ? Math.round(convertCurrency(parseFloat(price), currencyVal, 'THB', fx))
    : 0;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
        zIndex: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 0,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bg, borderTop: `1px solid ${T.border2}`,
          borderRadius: '24px 24px 0 0', padding: 22, width: '100%', maxWidth: 540,
          paddingBottom: 'calc(22px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{
          fontFamily: T.fontDisplay, fontSize: SZ.lg, fontWeight: 700,
          letterSpacing: '0.06em', marginBottom: 6,
        }}>
          PURCHASE PRICE
        </div>
        <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 16 }}>
          {action === 'community'
            ? "What did you pay for this card? It's stored alongside your community contribution so price-trend graphs can use it later."
            : "What did you pay for this card? Used to compute P/L in your SwibsVault."}
        </div>

        <FieldLabel>AMOUNT</FieldLabel>
        <input
          autoFocus
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          inputMode="decimal"
          style={inputStyle}
        />

        <FieldLabel>CURRENCY</FieldLabel>
        <select value={currencyVal} onChange={(e) => setCurrencyVal(e.target.value)} style={inputStyle}>
          {Object.entries(CURRENCIES).map(([k, c]) => (
            <option key={k} value={k}>{c.symbol} {k} — {c.name}</option>
          ))}
        </select>

        {previewTHB > 0 && currencyVal !== 'THB' && (
          <div style={{ fontSize: SZ.sm, color: T.textLow, fontFamily: T.fontMono, marginBottom: 14 }}>
            ≈ ฿{previewTHB.toLocaleString('th-TH')} (vault stores in THB)
          </div>
        )}

        {action === 'vault' && (
          <>
            <FieldLabel>GRADING</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {VAULT_GRADE_OPTIONS.map((g) => {
                const isActive = gradeVal === g;
                const isRaw    = g === 'Raw';
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeVal && setGradeVal(g)}
                    style={{
                      padding: '8px 14px', fontSize: SZ.sm, fontWeight: 600,
                      background: isActive ? T.gradientPrimary : 'transparent',
                      color: isActive ? T.bgDeep : (isRaw ? T.textMid : T.cyan),
                      border: `1px solid ${isActive ? 'transparent' : T.border2}`,
                      borderRadius: 999, cursor: 'pointer', fontFamily: T.fontDisplay,
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}
                  >{g}</button>
                );
              })}
            </div>
            {gradeVal && gradeVal !== 'Raw' && (
              <div style={{
                background: 'rgba(93,213,240,0.08)', border: `1px solid rgba(93,213,240,0.25)`,
                color: T.cyan, padding: '8px 12px', borderRadius: 8,
                fontSize: SZ.xs, marginBottom: 14, lineHeight: 1.5,
              }}>
                Stored as a graded card. Filterable in the SwibsVault under <strong>{gradeVal}</strong>.
              </div>
            )}

            <FieldLabel>PURCHASE DATE</FieldLabel>
            <input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              style={inputStyle}
            />

            {medianTHB > 0 && (
              <div style={{
                background: 'rgba(93,213,240,0.1)', border: `1px solid rgba(93,213,240,0.3)`,
                color: T.cyan, padding: '10px 12px', borderRadius: 10,
                fontSize: SZ.sm, marginBottom: 14, lineHeight: 1.5,
              }}>
                <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: '0.08em', fontSize: SZ.xs }}>
                  CURRENT VALUE (30-day sold history)
                </div>
                <div style={{ fontSize: SZ.lg, fontFamily: T.fontMono, fontWeight: 700, marginTop: 2 }}>
                  {(() => {
                    const c = CURRENCIES[currency] || CURRENCIES.THB;
                    const rate = (fx && fx[currency]) || 1;
                    return `${c.symbol}${Math.round(medianTHB * rate).toLocaleString(c.locale)}`;
                  })()}
                </div>
                <div style={{ fontSize: SZ.xs, color: T.textMid, marginTop: 4 }}>
                  Refreshes daily as new sold-history data lands.
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Confirm & Save</Button>
        </div>
        <div style={{ fontSize: SZ.xs, color: T.textDim, textAlign: 'center', marginTop: 10 }}>
          Tap outside to dismiss
        </div>
      </div>
    </div>
  );
}
