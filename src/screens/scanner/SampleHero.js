// src/screens/scanner/SampleHero.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function SampleHero({
  verified, details, pinned, loading, tcg, card, lang,
  onContribute, contributing, contributed,
  onContributeSample, contributingSample, contributedSample, imageDataUrl,
  isAdmin, onReplaceSample, replacingSample, replacedSample,
  signedIn, edits,
}) {
  if (tcg !== 'op') return null;
  if (loading && !details && !verified && !pinned) return <LoadingCard text="Loading official card image…" />;
  if (!details && !verified && !pinned) return null;

  // Preferred image source order:
  //   1. Pinned variant (what the user explicitly picked) — WINS over everything
  //   2. Our mirrored sample (verified_cards/<key>.jpg)
  //   3. The live remote image from op-details (optcgapi / apitcg)
  const sampleSrc =
    pinned?.imageUrl ||
    verified?.sampleImageUrl ||
    details?.sampleImageUrl ||
    details?.imageUrl ||
    null;
  const officialName = verified?.officialName || details?.name || null;
  const setName = verified?.officialSetName || details?.setName || null;
  const releaseDate = verified?.officialReleaseDate || details?.releaseDate || null;
  const source = details?.source || verified?.officialSource || null;
  const inCommunityDb = !!verified?.verificationCount;
  const verifications = verified?.verificationCount || 0;

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionLabel>OFFICIAL SAMPLE</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {inCommunityDb && <Pill tag={`Verified · ${verifications}`} />}
          {source && <Pill tag={source} />}
        </div>
      </div>

      {sampleSrc ? (
        <div style={{
          background: T.bgDeep, borderRadius: 12, padding: 12,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}>
          <img
            src={(() => {
              // SCN106 — cache-buster prefers pinned.bust (timestamp written
              // by Save/Replace handlers) so the browser refetches the freshly
              // uploaded watermarked image even when the URL path is identical.
              // Falls back to pinned.source for variant-pick refreshes.
              const bustVal = pinned?.bust || pinned?.source || verified?.officialSource || 'sample';
              const buster = `&v=${encodeURIComponent(bustVal)}`;
              const raw = sampleSrc.startsWith('/')
                ? `${sampleSrc}${sampleSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(bustVal)}`
                : `/api/proxy-image?url=${encodeURIComponent(sampleSrc)}${buster}`;
              return raw;
            })()}
            alt={officialName || 'sample card'}
            style={{
              maxWidth: '100%', maxHeight: 460, width: 'auto', height: 'auto',
              borderRadius: 10, display: 'block',
              filter: 'drop-shadow(0 8px 24px rgba(93, 213, 240, 0.18))',
            }}
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = '1';
                e.currentTarget.src = sampleSrc;
              } else {
                e.currentTarget.style.display = 'none';
              }
            }}
          />
        </div>
      ) : (
        <div style={{ fontSize: SZ.md, color: T.textMid, padding: '8px 0' }}>
          No SAMPLE image available for this code yet — be the first to contribute below.
        </div>
      )}

      {(officialName || setName || releaseDate) && (
        <div style={{ marginTop: 12, fontSize: SZ.sm, color: T.textMid, fontFamily: T.fontMono, lineHeight: 1.7 }}>
          {officialName && <div style={{ color: T.textHi, fontSize: SZ.md, fontWeight: 600 }}>{officialName}</div>}
          {setName && <div>Set: {setName}</div>}
          {releaseDate && <div>Released: {releaseDate}</div>}
          {details?.type && <div>Type: {details.type}</div>}
          {details?.color && <div>Color: {Array.isArray(details.color) ? details.color.join(', ') : details.color}</div>}
          {details?.cost != null && <div>Cost: {details.cost}</div>}
          {details?.power != null && <div>Power: {details.power}</div>}
          {details?.life != null && <div>Life: {details.life}</div>}
        </div>
      )}

      {details?.effect && (
        <div style={{ fontSize: SZ.sm, color: T.textMid, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, lineHeight: 1.6 }}>
          {details.effect}
        </div>
      )}

      {/* Conditional contribute panel — only when:
            - We have both code AND rarity
            - User is signed in
            - Either this card isn't already verified, OR the user has edited the result
              (an edit means the existing verified record may need correcting).
            - SCN46: also hidden when the backfill already supplied a SAMPLE
              for this code+lang (sampleSrc present + not edited) — the
              community DB already has the canonical image. */}
      {(() => {
        const hasIdent = !!card?.code && !!card?.rarity;
        const wasEdited = !!edits && Object.keys(edits).length > 0;
        const alreadyVerified = (verifications || 0) > 0 && !wasEdited;
        const sampleAlreadyInDb = !!sampleSrc && !wasEdited;
        // SCN63 — always show the SAVE panel when card is identified and
        // user is signed in. Previous gates (SCN46/SCN62) were hiding it
        // for non-admins when a SAMPLE was already in the DB, which left
        // people unable to save and confused. SAVE is now always available.
        if (!hasIdent || !signedIn) return null;
        // SCN60 — show CONTRIBUTE alongside SAVE when no SAMPLE exists yet.
        // CONTRIBUTE uploads the user's photo (auto-cropped + watermarked) as
        // the new community SAMPLE, so the next scan pulls it from the DB.
        const canContributeSample = !sampleSrc && !!imageDataUrl;
        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid ' + T.border }}>
            <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 10 }}>
              {contributed
                ? 'Saved. Future scans of this card will hit the community DB first.'
                : wasEdited
                  ? "You've corrected this scan. Save the corrected record to the community database so future scans get the right metadata."
                  : canContributeSample
                    ? 'No SAMPLE in our DB yet. Tap CONTRIBUTE to crop + watermark your photo and use it as the community SAMPLE for future scans, or SAVE to log the metadata only.'
                    : 'Add this card to the community database. Other users — and your own future scans — will get this verified record instantly without re-running the scanner.'}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: canContributeSample ? '1fr 1fr' : '1fr',
              gap: 10,
            }}>
              <Button
                variant={contributed ? 'outline' : 'accent'}
                onClick={onContribute}
                disabled={contributing}
              >
                {contributing ? <Spinner size={16} color={T.bgDeep} />
                  : contributed ? 'Already saved ✓'
                  : 'SAVE  ' + card.code + '  ·  ' + card.rarity}
              </Button>
              {canContributeSample && (
                <Button
                  variant={contributedSample ? 'outline' : 'accent'}
                  onClick={onContributeSample}
                  disabled={contributingSample}
                >
                  {contributingSample ? <Spinner size={16} color={T.bgDeep} />
                    : contributedSample ? 'Contributed ✓'
                    : 'CONTRIBUTE'}
                </Button>
              )}
            </div>
            {/* SCN62 — Admin-only REPLACE button. Visible when admin + a
                SAMPLE already exists + we have a fresh scan to swap in. */}
            {isAdmin && !!sampleSrc && !!imageDataUrl && (
              <div style={{ marginTop: 10 }}>
                <Button
                  variant={replacedSample ? 'outline' : 'accent'}
                  onClick={onReplaceSample}
                  disabled={replacingSample}
                >
                  {replacingSample ? <Spinner size={16} color={T.bgDeep} />
                    : replacedSample ? 'Replaced ✓'
                    : 'REPLACE OFFICIAL SAMPLE WITH MY SCAN  (ADMIN)'}
                </Button>
                <div style={{
                  fontSize: SZ.xs, color: T.textDim, marginTop: 6,
                  fontStyle: 'italic', textAlign: 'center',
                }}>
                  Pre-launch only — crops + watermarks your scan, then overwrites the SAMPLE in Firebase for this {card.code} / {card.rarity} / {(lang || card.lang || 'JP').toUpperCase()}.
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </Card>
  );
}
