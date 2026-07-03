// src/screens/scanner/Sparkline.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function Sparkline({ items, convert }) {
  if (!items || items.length < 2) return null;
  // Bucket: items WITH dates go first (sorted by date), then items without.
  // For the X axis we synthesize an index for everything; for items that
  // do have a date we keep them in their chronological position.
  const withDate = items.filter((it) => it.soldDate)
    .sort((a, b) => new Date(a.soldDate) - new Date(b.soldDate));
  const withoutDate = items.filter((it) => !it.soldDate);
  const sorted = [...withDate, ...withoutDate];
  const W = 480, H = 70, pad = 4;
  const ys = sorted.map((it) => convert ? convert(it.priceUSD) : it.priceUSD);
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  const range = max - min || 1;
  const xs = sorted.map((_, i) => pad + (i / (sorted.length - 1)) * (W - pad * 2));
  const points = sorted.map((_, i) => {
    const y = H - pad - ((ys[i] - min) / range) * (H - pad * 2);
    return `${xs[i].toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
         style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.cyan} stopOpacity="0.45"/>
          <stop offset="100%" stopColor={T.cyan} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline
        points={`${pad},${H - pad} ${points.join(' ')} ${W - pad},${H - pad}`}
        fill="url(#sparkfill)" stroke="none"
      />
      <polyline points={points.join(' ')} fill="none" stroke={T.cyan} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots — magenta for items missing a date, cyan for dated items */}
      {sorted.map((it, i) => {
        const x = xs[i];
        const y = H - pad - ((ys[i] - min) / range) * (H - pad * 2);
        return <circle key={i} cx={x} cy={y} r="2.5" fill={it.soldDate ? T.cyan : T.magenta} />;
      })}
    </svg>
  );
}
