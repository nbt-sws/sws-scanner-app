// src/screens/scanner/LanguagePrompt.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function LanguagePrompt({ current, options, onPick, onCancel }) {
  // Each language tile carries: native script of the language name (what
  // collectors recognise on the card), the canonical EN name (for clarity),
  // a small flag glyph, and an emoji-free description of what each option
  // routes to. Hover/active state uses the cyan accent line.
  const meta = {
    JP: { native: '日本語', en: 'Japanese',            flag: '🇯🇵', tagline: 'Bandai 公式 (onepiece-cardgame.com)' },
    EN: { native: 'English', en: 'English',            flag: '🇺🇸', tagline: 'en.onepiece-cardgame.com' },
    CN: { native: '简体中文', en: 'Simplified Chinese',flag: '🇨🇳', tagline: 'onepiece-cardgame.cn + cardpiece.com' },
    AE: { native: 'Asia EN', en: 'Asian English',      flag: '🇸🇬', tagline: 'asia-en.onepiece-cardgame.com' },
  };
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 8, 12, 0.86)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border2}`,
        borderRadius: 20,
        padding: '28px 22px 22px',
        maxWidth: 460, width: '100%',
        boxShadow: '0 28px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(93, 213, 240, 0.08)',
      }}>
        {/* Header — small cyan eyebrow + bold question */}
        <div style={{
          fontSize: SZ.xs, color: T.cyan, fontFamily: T.fontDisplay,
          letterSpacing: '0.18em', fontWeight: 700, marginBottom: 10,
          textTransform: 'uppercase',
        }}>
          Language of the card
        </div>
        <div style={{
          fontSize: SZ.xxl || SZ.xl, color: T.textHi, fontWeight: 700,
          fontFamily: T.fontDisplay, marginBottom: 8, lineHeight: 1.15,
          letterSpacing: '-0.005em',
        }}>
          Which print is this?
        </div>
        <div style={{ fontSize: SZ.sm, color: T.textMid, lineHeight: 1.55, marginBottom: 18 }}>
          Pick the language printed on the card. We use it to route the right Bandai source for SAMPLE images, eBay queries, and pricing.
        </div>

        {/* Language tiles — one per row, big, tap-friendly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map((l) => {
            const isCurrent = l === current;
            const m = meta[l] || { native: l, en: l, flag: '', tagline: '' };
            return (
              <button
                key={l}
                type="button"
                onClick={() => onPick(l)}
                style={{
                  textAlign: 'left',
                  padding: '16px 18px',
                  background: isCurrent
                    ? 'linear-gradient(135deg, rgba(93,213,240,0.12), rgba(93,213,240,0.04))'
                    : T.bgDeep,
                  border: `1.5px solid ${isCurrent ? T.cyan : T.border2}`,
                  borderRadius: 14,
                  cursor: 'pointer',
                  color: T.textHi,
                  fontFamily: T.fontBody,
                  position: 'relative',
                  transition: 'transform 0.1s ease, border-color 0.15s ease',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                {/* Flag glyph */}
                <span style={{ fontSize: 28, lineHeight: 1, filter: 'saturate(1.1)' }}>{m.flag}</span>

                {/* Native script + EN name + tagline */}
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block',
                    fontSize: SZ.lg, fontWeight: 700, color: T.textHi,
                    fontFamily: T.fontDisplay, letterSpacing: '0.02em',
                    lineHeight: 1.2,
                  }}>{m.native}</span>
                  <span style={{
                    display: 'block',
                    fontSize: SZ.xs, color: isCurrent ? T.cyan : T.textLow,
                    fontFamily: T.fontMono, letterSpacing: '0.04em', marginTop: 3,
                  }}>{m.en}</span>
                  <span style={{
                    display: 'block',
                    fontSize: SZ.xs, color: T.textDim,
                    fontFamily: T.fontMono, marginTop: 3,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{m.tagline}</span>
                </span>

                {/* Code + last-used pill */}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{
                    fontSize: SZ.md, fontWeight: 700,
                    color: isCurrent ? T.cyan : T.textMid,
                    fontFamily: T.fontDisplay, letterSpacing: '0.08em',
                  }}>{l}</span>
                  {isCurrent && (
                    <span style={{
                      fontSize: 9, color: T.cyan, fontFamily: T.fontDisplay,
                      letterSpacing: '0.1em', fontWeight: 700,
                      padding: '2px 6px', borderRadius: 999,
                      background: 'rgba(93,213,240,0.12)',
                    }}>LAST USED</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Subtle cancel — most users will pick a language */}
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: 'block', width: '100%', marginTop: 18,
            background: 'transparent', border: 'none', color: T.textLow,
            fontSize: SZ.sm, padding: '10px 0', cursor: 'pointer',
            fontFamily: T.fontDisplay, letterSpacing: '0.08em',
          }}
        >Cancel</button>
      </div>
    </div>
  );
}
