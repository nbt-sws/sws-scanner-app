// src/screens/scanner/CurrentValueHero.js — SCN86 + SCN99
import React, { useMemo } from 'react';
import { T, SZ } from '../../theme';
import { SectionLabel } from '../../components';
import * as helpers from './helpers';
const { isGradedTier, classifyTitleClient, GRADED_TIERS } = helpers;

// SCN99 — Show median for each of the top 3 most-listed graded tiers
// (PSA 10, BGS 10, CGC 10, ARS 10, BGS 10 BL) plus RAW. Previously only
// PSA 10 + RAW were rendered.
export default function CurrentValueHero({ allItems, fmt }) {
  const buckets = useMemo(() => {
    const out = {}; // tier → array
    for (const it of allItems) {
      const tier = it.conditionTier || classifyTitleClient(it.title);
      if (!out[tier]) out[tier] = [];
      out[tier].push(it);
    }
    return out;
  }, [allItems]);

  const computeStats = (items) => {
    const prices = items.map((it) => it.priceUSD).filter((p) => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    const dated = items.filter((it) => it.soldDate)
      .sort((a, b) => new Date(b.soldDate) - new Date(a.soldDate));
    return {
      median,
      low:  prices[0],
      high: prices[prices.length - 1],
      count: prices.length,
      lastSold: dated[0] || items[0],
    };
  };

  // Pick the top 3 most-listed graded tiers.
  const gradedTiles = useMemo(() => {
    const entries = Object.entries(buckets)
      .filter(([t]) => isGradedTier(t))
      .map(([t, items]) => ({ tier: t, stats: computeStats(items) }))
      .filter((x) => x.stats)
      .sort((a, b) => b.stats.count - a.stats.count)
      .slice(0, 3);
    return entries;
  }, [buckets]);

  const rawStats = useMemo(() => computeStats(buckets['Raw'] || []), [buckets]);

  if (gradedTiles.length === 0 && !rawStats) return null;

  const TIER_ACCENT = {
    'PSA 10':    'cyan',
    'BGS 10':    'gold',
    'BGS 10 BL': 'blue',
    'CGC 10':    'green',
    'ARS 10':    'purple',
    'Raw':       'magenta',
  };

  const COLORS = {
    cyan:    T.cyan,
    magenta: T.magenta,
    gold:    '#FFD24A',
    blue:    '#5DA9F0',
    green:   '#5DF09D',
    purple:  '#B85DF0',
  };

  const renderTile = (label, accent, stats) => {
    const color = COLORS[accent] || T.cyan;
    return (
      <div style={{
        flex: 1, minWidth: 0,
        background: T.surface2,
        border: `1px solid ${T.border2}`,
        borderRadius: 14,
        padding: '14px 14px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: color,
        }} />
        <div style={{
          fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay,
          fontWeight: 700, letterSpacing: '0.06em',
        }}>
          {label}
        </div>
        {stats ? (
          <>
            <div style={{
              fontSize: 26, fontWeight: 700, fontFamily: T.fontDisplay,
              color, lineHeight: 1.1, marginTop: 4,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {fmt(stats.median)}
            </div>
            <div style={{
              fontSize: 10, color: T.textDim, fontFamily: T.fontMono,
              marginTop: 2, display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span>median</span><span>·</span><span>{stats.count} sold</span>
            </div>
            {stats.low !== stats.high && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  position: 'relative', height: 6, background: T.bgDeep,
                  borderRadius: 999, overflow: 'visible',
                }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `linear-gradient(90deg, ${color}33, ${color})`,
                    borderRadius: 999,
                  }} />
                  <div style={{
                    position: 'absolute',
                    left: `${((stats.median - stats.low) / (stats.high - stats.low)) * 100}%`,
                    top: -2, bottom: -2,
                    width: 2, background: T.textHi,
                    borderRadius: 2, transform: 'translateX(-50%)',
                  }} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 4, fontSize: 10, color: T.textLow,
                  fontFamily: T.fontMono,
                }}>
                  <span>{fmt(stats.low)}</span>
                  <span>{fmt(stats.high)}</span>
                </div>
              </div>
            )}
            {stats.lastSold && (
              <div style={{
                marginTop: 10, paddingTop: 8,
                borderTop: `1px solid ${T.border}`,
                fontSize: 10, color: T.textLow, fontFamily: T.fontMono,
                display: 'flex', justifyContent: 'space-between', gap: 6,
              }}>
                <span>last sold</span>
                <span style={{ color: T.textHi, fontWeight: 600 }}>
                  {fmt(stats.lastSold.priceUSD)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{
            fontSize: SZ.xs, color: T.textDim,
            marginTop: 8, padding: '14px 0', textAlign: 'center',
          }}>
            No sales found
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 18 }}>
      <SectionLabel>CURRENT VALUE · BY GRADE</SectionLabel>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gradedTiles.length + (rawStats ? 1 : 0)}, minmax(0, 1fr))`,
        gap: 10, marginTop: 10,
      }}>
        {gradedTiles.map((g) => (
          <React.Fragment key={g.tier}>
            {renderTile(g.tier.toUpperCase(), TIER_ACCENT[g.tier] || 'cyan', g.stats)}
          </React.Fragment>
        ))}
        {rawStats && renderTile('RAW · NEAR MINT', 'magenta', rawStats)}
      </div>
    </div>
  );
}
