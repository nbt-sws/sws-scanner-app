// src/screens/scanner/CurrencyPills.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function CurrencyPills({ active, onChange }) {
  const CCY = ['THB', 'USD', 'JPY', 'PHP', 'MYR', 'SGD'];
  return (
    <div style={{
      display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap',
    }}>
      {CCY.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            style={{
              padding: '6px 12px', fontSize: SZ.xs, fontWeight: 700,
              fontFamily: T.fontDisplay, letterSpacing: '0.06em',
              background: isActive ? T.gradientPrimary : 'transparent',
              color: isActive ? T.bgDeep : T.textMid,
              border: `1px solid ${isActive ? 'transparent' : T.border2}`,
              borderRadius: 999, cursor: 'pointer',
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
