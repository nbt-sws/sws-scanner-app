// src/screens/scanner/DonVisualLookup.js — SCN85 extracted from Scanner.js
import React, { useState, useEffect, useMemo } from 'react';
import { T, SZ } from '../../theme';
import { Card, Pill, LoadingCard, SectionLabel } from '../../components';

export default function DonVisualLookup({ card, imageDataUrl, onPick, donVision }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [bestMatchId, setBestMatchId] = useState(null);
  const [matchScores, setMatchScores] = useState({});  // id → score
  // SCN20: when scan narrowed by character/set, we record what we narrowed by
  // so the UI can explain "showing N variants for Donquixote Doflamingo" and
  // offer a "show all" escape hatch.
  const [narrowing, setNarrowing] = useState(null);   // {by: 'character'|'setCode', value, count}
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState('');

  // SCN20: identify narrowing hints from the scan card + donVision result.
  //   - characterHint: the canonical character name we already identified
  //   - setHint: the set this card belongs to (PRB-02, OP-13, etc.)
  // We fetch a narrowed catalog using these; if the narrowed result is 0,
  // we fall back to the full catalog.
  const characterHint = donVision?.fullName || card?.nameEn || null;
  const setHint = card?.setCode || donVision?.setCode || null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchCatalog = async () => {
      // Step 1: try narrowed query (character first, then setCode).
      let narrowed = null;
      let narrowedBy = null;
      if (!showAll && characterHint) {
        try {
          const r = await fetch(`/api/don-cards?character=${encodeURIComponent(characterHint)}&verified=true`);
          const d = await r.json();
          if (d?.items?.length > 0) {
            narrowed = d.items;
            narrowedBy = { by: 'character', value: characterHint, count: d.items.length };
          }
        } catch { /* fall through */ }
      }
      if (!narrowed && !showAll && setHint) {
        try {
          const r = await fetch(`/api/don-cards?setCode=${encodeURIComponent(setHint)}&verified=true`);
          const d = await r.json();
          if (d?.items?.length > 0) {
            narrowed = d.items;
            narrowedBy = { by: 'setCode', value: setHint, count: d.items.length };
          }
        } catch { /* fall through */ }
      }
      // Step 2: fall back to full catalog
      if (!narrowed) {
        try {
          const r = await fetch('/api/don-cards?verified=true');
          const d = await r.json();
          narrowed = d?.items || [];
        } catch { narrowed = []; }
      }
      if (cancelled) return;
      setItems(narrowed);
      setNarrowing(narrowedBy);

      // Step 3: Vision ranking — runs against whatever set we ended up with.
      if (imageDataUrl && narrowed.length > 0) {
        setVisionLoading(true);
        try {
          const r = await fetch('/api/visual-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: imageDataUrl,
              // SCN51 — ask Haiku to confirm Vision's top picks against the
              // user's photo. Server limits this to top 9 by default.
              haikuConfirm: true,
              haikuConfirmTopN: 9,
              candidates: narrowed.slice(0, 30).map((d, i) => ({
                id: i, imageUrl: d.imageUrl,
              })),
            }),
          });
          const visionData = await r.json();
          if (!cancelled && visionData?.ok && !visionData?.degraded) {
            const scores = {};
            for (const c of (visionData.candidates || [])) {
              scores[c.id] = c.matchScore || 0;
            }
            setMatchScores(scores);
            if (visionData.bestMatch) {
              setBestMatchId(visionData.bestMatch.id);
            }
          }
        } catch { /* silent */ }
        finally { if (!cancelled) setVisionLoading(false); }
      }
    };

    fetchCatalog().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line
  }, [characterHint, setHint, showAll]);

  // Apply variant filter client-side, then sort AI-matched candidates first.
  //
  // SCN17: when AI matches an item, also boost its "set-mate" (same setHint,
  // opposite variant) to the top — that way the user sees Regular + Gold
  // pairs side-by-side whenever the visual matches one but the other might
  // be the actual print. Example: AI picks Doflamingo Gold (PRB-02) → we
  // also surface Doflamingo Regular (PRB-02) at #2.
  const setMateIds = useMemo(() => {
    if (bestMatchId === null || !items) return new Set();
    const matched = items[bestMatchId];
    if (!matched?.setHint) return new Set();
    const mates = new Set();
    items.forEach((it, i) => {
      if (i === bestMatchId) return;
      if (it.setHint === matched.setHint &&
          String(it.variant || '').toLowerCase() !== String(matched.variant || '').toLowerCase()) {
        mates.add(i);
      }
    });
    return mates;
  }, [items, bestMatchId]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const f = filter ? filter.toLowerCase() : '';
    const matching = f
      ? items.filter((it) => String(it.variant || '').toLowerCase().includes(f))
      : items;
    // Sort: AI-matched first (best score), set-mates of the AI match next,
    // then everything else by match score.
    return [...matching].sort((a, b) => {
      const aId = items.indexOf(a);
      const bId = items.indexOf(b);
      const aMate = setMateIds.has(aId) ? 1 : 0;
      const bMate = setMateIds.has(bId) ? 1 : 0;
      // Mate boost: a mate ranks just below the AI-matched item itself.
      const aScore = (matchScores[aId] || 0) + (aMate ? 0.5 : 0);
      const bScore = (matchScores[bId] || 0) + (bMate ? 0.5 : 0);
      return bScore - aScore;
    });
  }, [items, filter, matchScores, setMateIds]);

  const variantOptions = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((i) => i.variant).filter(Boolean))).sort();
  }, [items]);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>DON CARD · VISUAL LOOKUP</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {visionLoading && <Pill tag="Vision…" />}
          {bestMatchId !== null && !visionLoading && <Pill tag="AI matched" />}
          <Pill tag={card?.rarity || 'DON!!'} />
        </div>
      </div>
      <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 12, lineHeight: 1.6 }}>
        DON!! cards have no card number — pick the matching name + variant below.
        Selection locks the synthetic code (e.g. <strong>Kalgara Don Card</strong>) used
        for the eBay pricing query.
      </div>

      {/* Variant filter chips */}
      {variantOptions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
          {[''].concat(variantOptions).map((v) => (
            <button
              key={v || 'all'}
              onClick={() => setFilter(v)}
              style={{
                flexShrink: 0, padding: '6px 12px', fontSize: SZ.xs, fontWeight: 600,
                background: filter === v ? T.gradientPrimary : 'transparent',
                color: filter === v ? T.bgDeep : T.textMid,
                border: `1px solid ${filter === v ? 'transparent' : T.border2}`,
                borderRadius: 999, cursor: 'pointer', fontFamily: T.fontBody,
                whiteSpace: 'nowrap',
              }}
            >
              {v || 'All'}
            </button>
          ))}
        </div>
      )}

      {loading && <LoadingCard text="Loading DON card catalog (Bandai PDF reference)…" />}

      {/* SCN20 + SCN47 — narrowing-by hint, now a quieter neutral row. */}
      {!loading && narrowing && (
        <div style={{
          background: T.surface2, border: `1px solid ${T.border2}`,
          padding: '8px 12px', borderRadius: 999, marginBottom: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          fontSize: SZ.xs, color: T.textMid, lineHeight: 1.4,
        }}>
          <div>
            Narrowed to <strong style={{ color: T.cyan }}>{narrowing.count}</strong> variant{narrowing.count === 1 ? '' : 's'}
            {narrowing.by === 'character'
              ? <> for <strong style={{ color: T.textHi }}>{narrowing.value}</strong></>
              : <> in set <strong style={{ color: T.textHi }}>{narrowing.value}</strong></>
            }
          </div>
          <button
            onClick={() => setShowAll(true)}
            style={{
              padding: '6px 12px', fontSize: SZ.xs, fontWeight: 600,
              background: 'transparent', color: T.cyan,
              border: `1px solid ${T.border2}`, borderRadius: 999,
              cursor: 'pointer', fontFamily: T.fontDisplay, letterSpacing: '0.06em', whiteSpace: 'nowrap',
            }}
          >Show all</button>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: SZ.sm, color: T.textMid, padding: '8px 0' }}>
          No DON cards found for this filter. Try switching the variant chip above.
        </div>
      )}

      {filtered.length > 0 && !loading && filtered.length === items.length && items.length > 0 && bestMatchId === null && !visionLoading && !narrowing && (
        // SCN63 — when narrowing failed AND Vision didn't pick a winner,
        // the user is staring at the full DON catalog. Tell them how to
        // help the picker: set the Set or character via Edit Fields.
        <div style={{
          fontSize: SZ.sm, color: T.textMid, marginBottom: 10,
          padding: '10px 12px',
          background: T.surface2, border: `1px solid ${T.border2}`,
          borderRadius: 10, lineHeight: 1.5,
        }}>
          <strong style={{ color: T.cyan }}>Showing all DON cards.</strong> The scanner couldn&apos;t auto-detect this card&apos;s set. To narrow the list, tap <strong>Edit Fields</strong> above and pick the Set (e.g. PRB-02 Premium Booster, PRB-01, etc.) — the picker will re-narrow to just that set&apos;s DON variants.
        </div>
      )}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {/* SCN51 — cap to top-9 best matches (Vision + Haiku confirm). */}
          {filtered.slice(0, 9).map((d, displayIdx) => {
            const itemIdx = items.indexOf(d);
            const aiMatched = bestMatchId === itemIdx;
            const aiScore = matchScores[itemIdx] || 0;
            return (
              <button
                key={displayIdx}
                type="button"
                onClick={() => onPick && onPick(d)}
                style={{
                  background: aiMatched ? 'rgba(93,213,240,0.08)' : T.surface2,
                  border: `1px solid ${aiMatched ? T.cyan : T.border2}`,
                  borderRadius: 12, padding: 8, cursor: 'pointer', position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  boxShadow: aiMatched ? `0 0 16px ${T.cyanGlow}` : 'none',
                }}
              >
                {aiMatched && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4, fontSize: 10,
                    background: T.cyan, color: T.bgDeep, padding: '2px 6px',
                    borderRadius: 999, fontWeight: 700, fontFamily: T.fontDisplay,
                    letterSpacing: '0.06em',
                  }}>AI ✓</div>
                )}
                <img
                  src={d.imageUrl && d.imageUrl.startsWith('/') ? d.imageUrl : `/api/proxy-image?url=${encodeURIComponent(d.imageUrl)}`}
                  alt={d.name}
                  loading="lazy"
                  style={{
                    width: '100%', height: 'auto', borderRadius: 8, display: 'block',
                    aspectRatio: '63 / 88', objectFit: 'contain', background: T.bgDeep,
                  }}
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fallback) {
                      e.currentTarget.dataset.fallback = '1';
                      e.currentTarget.src = d.imageUrl;
                    } else { e.currentTarget.style.opacity = '0.3'; }
                  }}
                />
                <div style={{ fontSize: SZ.sm, color: T.textHi, fontFamily: T.fontMono, textAlign: 'center', fontWeight: 600, lineHeight: 1.3 }}>
                  {d.name}
                </div>
                {(d.setHint || d.variant) && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {d.setHint && (
                      <span style={{ fontSize: SZ.xs, color: T.amber, fontFamily: T.fontDisplay, letterSpacing: '0.05em' }}>
                        {d.setHint}
                      </span>
                    )}
                    {d.variant && d.variant.toLowerCase() !== 'regular' && (
                      <span style={{ fontSize: SZ.xs, color: T.cyan, fontFamily: T.fontDisplay, letterSpacing: '0.06em' }}>
                        {d.variant.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
                {aiScore > 0 && !aiMatched && (
                  <div style={{ fontSize: 9, color: T.textDim, fontFamily: T.fontMono }}>
                    sim {Math.round(aiScore * 100)}%
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
