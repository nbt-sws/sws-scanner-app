// src/screens/scanner/QualityResult.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function QualityResult({ quality }) {
  const q = quality.quality;
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SectionLabel>QUALITY GRADE</SectionLabel>
        <div style={{ fontSize: 38, fontWeight: 700, color: T.cyan, fontFamily: T.fontDisplay }}>{q.grade}</div>
      </div>
      {q.estimatedTier && <div style={{ fontSize: SZ.md, color: T.textMid, marginTop: 4 }}>{q.estimatedTier}</div>}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14,
        fontSize: SZ.sm, fontFamily: T.fontMono, color: T.textLow,
      }}>
        <div>centering: <span style={{ color: T.textHi }}>{q.subscores?.centering ?? '–'}</span></div>
        <div>corners: <span style={{ color: T.textHi }}>{q.subscores?.corners ?? '–'}</span></div>
        <div>edges: <span style={{ color: T.textHi }}>{q.subscores?.edges ?? '–'}</span></div>
        <div>surface: <span style={{ color: T.textHi }}>{q.subscores?.surface ?? '–'}</span></div>
      </div>
      {q.issues && q.issues.length > 0 && (
        <ul style={{ margin: '14px 0 0 20px', padding: 0, fontSize: SZ.sm, color: T.textMid }}>
          {q.issues.map((iss, i) => <li key={i}>{iss}</li>)}
        </ul>
      )}
    </Card>
  );
}
