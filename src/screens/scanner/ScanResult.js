// src/screens/scanner/ScanResult.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export function CrossCheckBanner({ crossCheck, onAcceptVision }) {
  if (!crossCheck) return null;
  if (crossCheck.agreement === 'vision-unavailable') return null;

  if (crossCheck.agreement === 'agree') {
    return (
      <div style={{
        marginTop: 10, padding: '6px 12px',
        background: 'rgba(79,224,208,0.12)', border: `1px solid ${T.cyanTeal}`,
        borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: SZ.xs, color: T.cyanTeal, fontFamily: T.fontDisplay,
        letterSpacing: '0.06em', fontWeight: 700,
      }}>
        ✓ AI + IMAGE-MATCH AGREE · CODE {crossCheck.code}
      </div>
    );
  }

  if (crossCheck.agreement === 'vision-only') {
    return (
      <div style={{
        marginTop: 10, padding: '6px 12px',
        background: 'rgba(93,213,240,0.10)', border: `1px solid ${T.cyan}`,
        borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: SZ.xs, color: T.cyan, fontFamily: T.fontDisplay,
        letterSpacing: '0.06em', fontWeight: 700,
      }}>
        ✓ VISION-IDENTIFIED · CODE {crossCheck.code}
      </div>
    );
  }

  if (crossCheck.agreement === 'disagree') {
    return (
      <div style={{
        marginTop: 12, padding: '12px 14px', borderRadius: 12,
        background: 'rgba(255,184,108,0.08)', border: `1px solid ${T.amber}`,
      }}>
        <div style={{
          fontSize: SZ.xs, color: T.amber, fontFamily: T.fontDisplay,
          letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4,
        }}>
          AI + IMAGE-MATCH DISAGREE
        </div>
        <div style={{ fontSize: SZ.sm, color: T.textMid, lineHeight: 1.5, marginBottom: 8 }}>
          Card recognition (<strong style={{ color: T.textHi, fontFamily: T.fontMono }}>{crossCheck.haikuCode}</strong>)
          {' '}didn&apos;t match the reverse-image search
          (<strong style={{ color: T.cyan, fontFamily: T.fontMono }}>{crossCheck.visionCode}</strong>,
          {' '}{Math.round((crossCheck.visionConfidence || 0) * 100)}% sure).
          {' '}Tap below to switch to the image-search code, or leave it and Edit fields manually.
        </div>
        <button
          type="button"
          onClick={() => onAcceptVision && onAcceptVision(crossCheck.visionCode)}
          style={{
            background: T.gradientPrimary, border: 'none', color: T.bgDeep,
            padding: '8px 14px', borderRadius: 999, fontWeight: 700,
            fontSize: SZ.xs, fontFamily: T.fontDisplay, letterSpacing: '0.06em',
            cursor: 'pointer', textTransform: 'uppercase',
          }}
        >
          Use {crossCheck.visionCode} instead
        </button>
      </div>
    );
  }

  return null;
}

export function ScanActions({ onRescan, onEdit, busyRescan, anyBusy }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
      marginTop: 14, marginBottom: 14,
    }}>
      <Button variant="outline" onClick={onRescan} disabled={anyBusy}>
        {busyRescan ? <Spinner size={14} /> : 'Re-scan'}
      </Button>
      <Button variant="outline" onClick={onEdit} disabled={anyBusy}>
        Edit fields
      </Button>
    </div>
  );
}

export default function ScanResult({ result, edits, onRescan, onEdit, busyRescan, anyBusy, onAcceptVisionCode }) {
  const merged = { ...result.card, ...(edits || {}) };
  const { cached, hash, crossCheck, identifiedBy } = result;
  const wasEdited = edits && Object.keys(edits).length > 0;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: SZ.sm, color: T.textLow, fontFamily: T.fontMono, letterSpacing: '0.03em' }}>
            {merged.code}
          </div>
          <div style={{ fontSize: SZ.lg, fontWeight: 600, marginTop: 4, color: T.textHi }}>
            {merged.nameEn}
          </div>
          {merged.nameJp && (
            <div style={{ fontSize: SZ.md, color: T.textMid, marginTop: 2 }}>{merged.nameJp}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {cached && result.wasCorrected && <Pill tag="Corrected" />}
          {cached && !result.wasCorrected && !wasEdited && <Pill tag="Cached" />}
          {wasEdited && <Pill tag="Edited" />}
          {/* SCN41 — One pill per category (rarity + type), deduped.
              Drops Promo (the set name carries that signal already) and
              keeps only the canonical rarity (first expansion entry). */}
          {(() => {
            const seen = new Set();
            const tags = [];
            const push = (t) => {
              if (!t) return;
              const k = String(t).toLowerCase();
              if (seen.has(k)) return;
              seen.add(k); tags.push(t);
            };
            const exp = expandRarityTags(merged.rarity);
            if (exp[0]) push(exp[0]);
            if (merged.type) push(merged.type);
            return tags.map((t) => <Pill key={t} tag={t} />);
          })()}
        </div>
      </div>

      {/* SCN41 — only show reasoning on fresh, un-edited scans. After
          an edit or cache hit the original Haiku rationale is stale. */}
      {/* SCN63 — hide Haiku reasoning for DON cards too. The "P-#### promo
          code; CN region marker..." note is visual-confirmation noise that
          doesn't help the user once a DON card is identified. */}
      {merged.reasoning && !cached && !wasEdited && !isDonCard(merged) && (
        <div style={{ fontSize: SZ.sm, color: T.textMid, marginTop: 12, fontStyle: 'italic' }}>{merged.reasoning}</div>
      )}

      {/* SCN11 — Haiku + Vision cross-check pill / disagreement panel */}
      <CrossCheckBanner crossCheck={crossCheck} onAcceptVision={onAcceptVisionCode} />

      <div style={{
        display: 'flex', gap: 10, marginTop: 14, fontSize: SZ.xs,
        color: T.textDim, fontFamily: T.fontMono,
      }}>
        <span>conf {merged.confidence ?? '?'}%</span>
        <span>·</span>
        <span>{cached ? 'from cache' : 'fresh scan'}</span>
        {identifiedBy && (() => {
          const FRIENDLY = {
            'haiku': 'AI',
            'haiku-cache': 'cache',
            'haiku+vision': 'AI · image-match',
            'user-corrected-cache': 'verified',
            'verified-cache': 'verified',
            'vision-search': 'image-match',
            'ocr-extracted': 'OCR',
          };
          const label = FRIENDLY[identifiedBy] || identifiedBy.replace(/haiku/gi, 'AI').replace(/-/g, ' ');
          return <><span>·</span><span>{label}</span></>;
        })()}
        {hash && <><span>·</span><span title={hash}>#{hash.slice(0, 8)}</span></>}
      </div>

      {/* SCN64 — Re-scan / Edit Fields buttons moved out of ScanResult into
          a dedicated ScanActions row that renders AFTER the variant picker
          (DonVisualLookup / VariantPicker / CnAnnivVisualLookup). The picker
          is the primary action; Re-scan / Edit are secondary fallbacks. */}
    </Card>
  );
}
