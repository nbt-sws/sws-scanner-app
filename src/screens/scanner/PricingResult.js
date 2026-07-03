// src/screens/scanner/PricingResult.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;
import CurrencyPills from './CurrencyPills';
import TradingHistory from './TradingHistory';
import CurrentValueHero from './CurrentValueHero';
import TabEmptyState from './TabEmptyState';
import Sparkline from './Sparkline';

// SCN87 — restored from Scanner.js (was orphaned during SCN86 extraction).
const ebayLinkBtn = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '10px 14px', textAlign: 'center',
  background: T.surface2, border: `1px solid ${T.borderHi}`,
  color: T.cyan, borderRadius: 10, fontSize: SZ.sm,
  fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', textDecoration: 'none',
};

export default function PricingResult({ pricing, loading, currency, fx, card }) {
  // SCN73 — per-card display-currency override; THB by default.
  const [displayCurrency, setDisplayCurrency] = useState(null);
  const [activeTab, setActiveTab] = useState('All');

  if (loading && !pricing) return <LoadingCard text="Looking up sold history on eBay…" />;
  if (!pricing) return null;

  const tiers = pricing.tiers || {};
  const order = pricing.tierOrder || [];
  const overall = pricing.overall;

  // Three-tab segmentation.
  const allItems = (overall?.items || []);
  const gradedItems = allItems.filter((i) => isGradedTier(i.conditionTier));
  const rawItems = allItems.filter((i) => !isGradedTier(i.conditionTier));

  // Tab data lookup.
  const tabData = activeTab === 'Graded'
    ? buildSummary(gradedItems)
    : activeTab === 'Raw'
      ? buildSummary(rawItems, { withinPercent: 0.3 })
      : overall;

  // SCN73 — use displayCurrency override if user toggled a pill, else settings currency.
  const activeCurrency = displayCurrency || currency;
  const fmt = (usd) => {
    if (usd == null) return '–';
    const c = CURRENCIES[activeCurrency] || CURRENCIES.USD;
    const v = convertCurrency(usd, 'USD', activeCurrency, fx);
    return `${c.symbol}${Math.round(v).toLocaleString(c.locale)}`;
  };

  const mercari = pricing.mercari;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>
          {pricing.sourceType === 'active' ? 'ACTIVE LISTINGS · EBAY' : 'SOLD HISTORY · EBAY'}
        </SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill tag={
            pricing.sourceType === 'active'
              ? `${pricing.totalSold || 0} listed`
              : `${pricing.totalSold || 0} sold`
          } />
          {pricing.sourceType === 'sold' && (() => {
            const allItems = pricing.overall?.items || [];
            const dated = allItems.filter((i) => i.soldDate).length;
            const total = allItems.length;
            if (total > 0 && dated < total) {
              return <Pill tag={`${dated}/${total} dated`} />;
            }
            return null;
          })()}
        </div>
      </div>
      {pricing.sourceType === 'active' && (
        <div style={{
          fontSize: SZ.xs, color: T.textDim, marginBottom: 10,
          fontStyle: 'italic',
        }}>
          Active listings (no recent sold-history on eBay US).
        </div>
      )}
      {pricing.fallbackLinks?.ebaySold && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <a href={pricing.fallbackLinks.ebaySold} target="_blank" rel="noopener noreferrer" style={ebayLinkBtn}>
            Sold History ↗
          </a>
          {pricing.fallbackLinks.ebayActive && (
            <a href={pricing.fallbackLinks.ebayActive} target="_blank" rel="noopener noreferrer" style={{ ...ebayLinkBtn, color: T.magenta }}>
              Current Listings ↗
            </a>
          )}
        </div>
      )}

      <CurrencyPills active={displayCurrency || currency} onChange={setDisplayCurrency} />

      <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 14 }}>
        {[
          ['All',    allItems.length],
          ['Graded', gradedItems.length],
          ['Raw',    rawItems.length],
        ].map(([t, count]) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                flex: 1, padding: '10px 0',
                background: isActive ? T.gradientPrimary : 'transparent',
                color: isActive ? T.bgDeep : T.textMid,
                border: `1px solid ${isActive ? 'transparent' : T.border2}`,
                borderRadius: 999, fontSize: SZ.sm, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.fontBody,
              }}
            >{t} ({count})</button>
          );
        })}
      </div>

      {tabData ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
            <div>
              <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.05em', fontFamily: T.fontDisplay, fontWeight: 600 }}>
                CURRENT VALUE
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, fontFamily: T.fontDisplay, color: T.cyan, lineHeight: 1.1 }}>
                {fmt(tabData.median)}
              </div>
            </div>
            {tabData.lastSold && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.05em', fontFamily: T.fontDisplay, fontWeight: 600 }}>
                  LAST SOLD
                </div>
                <div style={{ fontSize: SZ.lg, fontWeight: 600, color: T.magenta, fontFamily: T.fontMono }}>
                  {fmt(tabData.lastSold.priceUSD)}
                </div>
              </div>
            )}
          </div>

          {allItems.length > 0 && (
            <CurrentValueHero allItems={allItems} fmt={fmt} />
          )}

          {tabData.items && tabData.items.length > 0 && (
            <TradingHistory
              items={tabData.items}
              activeTab={activeTab}
              card={card}
              fmt={fmt}
              mismatchFiltered={pricing?.mismatchFiltered || 0}
            />
          )}
        </>
      ) : (
        <TabEmptyState
          activeTab={activeTab}
          totalSold={pricing.totalSold}
          gradedCount={gradedItems.length}
          rawCount={rawItems.length}
          fallbackLinks={pricing.fallbackLinks}
          onSwitchTab={setActiveTab}
        />
      )}

      <div style={{ marginTop: 16 }}>
        {pricing.mode === 'vision-image' && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(93,213,240,0.12)',
            border: `1px solid ${T.cyan}`,
            color: T.cyan, fontSize: SZ.xs, fontWeight: 700,
            fontFamily: T.fontDisplay, letterSpacing: '0.08em',
            marginBottom: 8,
          }}>
            ✓ VISION-VERIFIED · SAME PRODUCT PHOTO ON {pricing.totalSold} LISTINGS
          </div>
        )}
        <div style={{ fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono, letterSpacing: '0.02em' }}>
          {pricing.source} · query: &quot;{pricing.query}&quot;
        </div>
      </div>
    </Card>
  );
}
