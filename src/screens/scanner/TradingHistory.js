// src/screens/scanner/TradingHistory.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;
import TabEmptyState from './TabEmptyState';

export default function TradingHistory({ items, activeTab, card, fmt, mismatchFiltered = 0 }) {
  const [sort, setSort] = useState('price_desc');
  // Three data-source tabs. "Last Sold" + "SwibSwap.com" are placeholders
  // until eBay Marketplace Insights approves and the internal market goes live.
  const [source, setSource] = useState('current');

  // For Graded tab: pick 2 per grade tier. For Raw + All: limit to 5.
  const visibleItems = useMemo(() => {
    if (source !== 'current') return [];   // placeholder tabs render empty for now
    // SCN90 — show ALL graded items (was capping to 2 per tier). Sort by
    // tier priority then price desc so the most valuable graded slabs lead.
    // SCN99 — Graded cap = 5 (was 10). Sort by tier then price desc so
    // the most valuable graded slabs lead.
    if (activeTab === 'Graded') {
      return [...items].sort((a, b) => {
        const ta = a.conditionTier || classifyTitleClient(a.title);
        const tb = b.conditionTier || classifyTitleClient(b.title);
        if (ta !== tb) return String(ta).localeCompare(String(tb));
        // SCN99 — prioritize sold listings over active when present.
        const aSold = a.soldDate ? 1 : 0;
        const bSold = b.soldDate ? 1 : 0;
        if (aSold !== bSold) return bSold - aSold;
        return (b.priceUSD || 0) - (a.priceUSD || 0);
      }).slice(0, 5);
    }
    // SCN112 — Raw tab cap = 5, All tab cap = 10. The PricingResult layer
    // already passes us Raw-filtered items when activeTab='Raw', so we just
    // need to honour the per-tab cap here.
    if (activeTab === 'Raw') return items.slice(0, 5);
    return items.slice(0, 10);
  }, [items, activeTab, source]);

  // Compute median for Raw condition-guess column.
  const rawMedian = useMemo(() => {
    if (activeTab !== 'Raw' && activeTab !== 'All') return null;
    const prices = visibleItems.map((i) => i.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
    return prices[Math.floor(prices.length / 2)] || null;
  }, [visibleItems, activeTab]);

  const sorted = useMemo(() => {
    const arr = [...visibleItems];
    arr.sort((a, b) => sort === 'price_asc' ? a.priceUSD - b.priceUSD : b.priceUSD - a.priceUSD);
    return arr;
  }, [visibleItems, sort]);

  const sortBtn = (key, label) => (
    <button
      key={key} type="button" onClick={() => setSort(key)}
      style={{
        padding: '6px 12px', fontSize: SZ.xs,
        background: sort === key ? T.gradientPrimary : 'transparent',
        color: sort === key ? T.bgDeep : T.textMid,
        border: `1px solid ${sort === key ? 'transparent' : T.border2}`,
        borderRadius: 999, fontWeight: 600, fontFamily: T.fontBody,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );

  // Card-Code · Name · Rarity · Language for the middle column.
  const cardLabel = [
    card?.code,
    card?.nameEn,
    card?.rarity,
    (card?.lang || '').toUpperCase(),
  ].filter(Boolean).join(' · ');

  // Source tabs — top-level data set selector.
  const SOURCES = [
    { key: 'current', label: 'Current Listing', live: true },
    { key: 'sold',    label: 'Last Sold',       live: false },
    { key: 'swibswap', label: 'SwibSwap.com',   live: false },
  ];

  const headingFor = (s) => SOURCES.find((x) => x.key === s)?.label || 'Current Listing';

  return (
    <div style={{ marginTop: 14 }}>
      {/* Source tabs (Current Listing / Last Sold / SwibSwap.com) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {SOURCES.map((s) => {
          const isActive = source === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSource(s.key)}
              style={{
                flex: 1, padding: '9px 0',
                background: isActive ? T.gradientPrimary : 'transparent',
                color: isActive ? T.bgDeep : T.textMid,
                border: `1px solid ${isActive ? 'transparent' : T.border2}`,
                borderRadius: 999, fontSize: SZ.xs, fontWeight: 600,
                cursor: 'pointer', fontFamily: T.fontBody,
                opacity: s.live ? 1 : 0.7,
                position: 'relative',
              }}
              title={s.live ? '' : 'Coming soon'}
            >
              {s.label}
              {!s.live && (
                <span style={{
                  position: 'absolute', top: 2, right: 6, fontSize: 8,
                  color: T.amber, fontWeight: 600, letterSpacing: '0.05em',
                }}>SOON</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>{headingFor(source).toUpperCase()}</SectionLabel>
        <span style={{ fontSize: SZ.xs, color: T.textDim }}>
          {source === 'current' ? `${sorted.length} shown` : 'placeholder'}
          {source === 'current' && activeTab === 'Raw' && ' · within ±30% of median'}
          {source === 'current' && mismatchFiltered > 0 && ` · ${mismatchFiltered} filtered as mismatch`}
        </span>
      </div>

      {source !== 'current' && (
        // SCN47 — was amber alarm. Neutralized to a quiet info pane.
        <div style={{
          background: T.surface2, border: `1px solid ${T.border2}`,
          color: T.textMid, padding: '12px 14px', borderRadius: 10,
          fontSize: SZ.sm, lineHeight: 1.6,
        }}>
          {source === 'sold' && (
            <>Coming soon — <strong>Last Sold</strong> data activates once eBay approves Marketplace Insights API access.</>
          )}
          {source === 'swibswap' && (
            <>Coming soon — <strong>SwibSwap.com</strong> direct trades, available when the internal market launches.</>
          )}
        </div>
      )}

      {source === 'current' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {sortBtn('price_desc', 'Price ↓')}
            {sortBtn('price_asc',  'Price ↑')}
          </div>
          <div style={{ fontSize: SZ.sm, fontFamily: T.fontMono }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '70px 1fr 80px',
              padding: '8px 4px', color: T.textLow, fontSize: SZ.xs,
              borderBottom: `1px solid ${T.border}`, letterSpacing: '0.05em', fontWeight: 600,
              gap: 8,
            }}>
              <div>GRADE</div><div>LISTING</div><div style={{ textAlign: 'right' }}>PRICE</div>
            </div>
            {sorted.map((it, i) => {
              // SCN54 — re-classify from the title every time (don't trust
              // conditionTier from the eBay payload — it's frequently stale
              // or set to "Raw" for everything). Run the regex against the
              // padded uppercase form so it actually fires at title edges.
              // SCN78 — Extract the ACTUAL graded value from the title.
              // Top-tier 10s first (most common), then any lower PSA / BGS /
              // CGC / ARS / GMA / AGS / TAG / HGA / SGC grade. Anything not
              // graded → 'RAW'. No more "Lower" placeholder.
              const upperTitle = ` ${String(it.title || '').toUpperCase()} `;
              let tier;
              const psa10 = /[^A-Z]PSA[\s.-]*10[^0-9]/.test(upperTitle);
              const bgs10bl = /[^A-Z]BGS[\s.-]*10\s*BL/.test(upperTitle);
              const bgs10 = /[^A-Z]BGS[\s.-]*10[^0-9]/.test(upperTitle);
              const cgc10 = /[^A-Z]CGC[\s.-]*10[^0-9]/.test(upperTitle);
              const ars10 = /[^A-Z]ARS[\s.-]*10[^0-9]/.test(upperTitle);
              if (psa10)         tier = 'PSA 10';
              else if (bgs10bl)  tier = 'BGS 10 BL';
              else if (bgs10)    tier = 'BGS 10';
              else if (cgc10)    tier = 'CGC 10';
              else if (ars10)    tier = 'ARS 10';
              else {
                // Lower-grade match — extract the actual numeric grade.
                const lowerMatch = upperTitle.match(/\b(PSA|BGS|CGC|ARS|GMA|AGS|TAG|HGA|SGC)\b[\s.-]*(\d+(?:\.\d)?)/);
                if (lowerMatch) tier = `${lowerMatch[1]} ${lowerMatch[2]}`;
                else tier = 'Raw';
              }
              const isGraded = tier !== 'Raw';
              // RAW everywhere for non-graded rows. Graded rows show the
              // actual grade detected from the title (PSA 10 / PSA 9.5 / etc).
              const gradeLabel = isGraded ? tier.toUpperCase() : 'RAW';
              // Strip noisy boilerplate from titles so the row reads cleanly.
              const cleanTitle = String(it.title || '')
                .replace(/\b(NEW|MINT|HOT|RARE|TCG|CCG|FREE\s*SHIP\w*|FAST\s*SHIP\w*|US\s*SELLER)\b/gi, '')
                .replace(/\s{2,}/g, ' ').trim();
              return (
                <a
                  key={i} href={it.url} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'grid', gridTemplateColumns: '70px 1fr 80px',
                    padding: '10px 4px', borderBottom: `1px solid ${T.border}`,
                    color: T.textMid, textDecoration: 'none',
                    gap: 8, alignItems: 'center',
                  }}
                  title={it.title}
                >
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: isGraded ? T.cyan : T.textMid,
                    fontFamily: T.fontDisplay, letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}>{gradeLabel}</div>
                  <div style={{
                    color: T.textMid, fontSize: SZ.xs, lineHeight: 1.35,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    textOverflow: 'ellipsis',
                    wordBreak: 'break-word',
                  }}>{cleanTitle || cardLabel || 'eBay listing'}</div>
                  <div style={{
                    textAlign: 'right', color: T.textHi,
                    fontWeight: 700, fontSize: SZ.sm,
                  }}>
                    {fmt(it.priceUSD)}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
