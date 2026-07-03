// src/screens/scanner/WatermarkResult.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function WatermarkResult({ watermark, loading, onZoom }) {
  if (loading && !watermark) return <LoadingCard text="Cropping corners + auto-exposing…" />;
  if (!watermark) return null;
  const corners = [
    ['Top-Left',     watermark.corners?.topLeft],
    ['Top-Right',    watermark.corners?.topRight],
    ['Bottom-Left',  watermark.corners?.bottomLeft],
    ['Bottom-Right', watermark.corners?.bottomRight],
  ];
  return (
    <Card>
      <SectionLabel>CARD CROPS · AUTO-EXPOSED</SectionLabel>
      <div style={{ fontSize: SZ.sm, color: T.textMid, fontFamily: T.fontMono, marginTop: 4, marginBottom: 14 }}>
        Watermark is applied when you save this card to your vault.
      </div>
      {watermark.full && (
        <img
          src={watermark.full} alt="card preview"
          onClick={() => onZoom(watermark.full, 1)}
          style={{ width: '100%', borderRadius: 10, cursor: 'zoom-in', display: 'block', marginBottom: 12 }}
        />
      )}
      <div style={{
        fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono,
        letterSpacing: '0.04em', marginBottom: 10, textAlign: 'center',
      }}>
        Tap a corner to open it at 200% zoom · scroll to adjust
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {corners.map(([label, src]) =>
          src ? (
            <div key={label}>
              <img
                src={src} alt={label}
                onClick={() => onZoom(src, 2)}
                style={{ width: '100%', borderRadius: 8, cursor: 'zoom-in', display: 'block' }}
              />
              <div style={{
                fontSize: SZ.xs, color: T.textDim, textAlign: 'center', marginTop: 6,
                fontFamily: T.fontMono, letterSpacing: '0.05em',
              }}>{label}</div>
            </div>
          ) : null
        )}
      </div>
    </Card>
  );
}
