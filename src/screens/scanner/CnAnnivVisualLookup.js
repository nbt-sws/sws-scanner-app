// src/screens/scanner/CnAnnivVisualLookup.js — SCN85 extracted from Scanner.js
import { apiUrl } from '../../api';
import React, { useState, useEffect, useMemo } from 'react';
import { T, SZ } from '../../theme';
import { Card, Pill, LoadingCard, SectionLabel } from '../../components';

export default function CnAnnivVisualLookup({ card, imageDataUrl, onPick }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visionLoading, setVisionLoading] = useState(false);
  const [bestMatchId, setBestMatchId] = useState(null);
  const [matchScores, setMatchScores] = useState({});
  const [showAll, setShowAll] = useState(false);

  const setHint = card?.setCode || null;        // CN-1ANV / 2ANV / 3ANV
  const annivHint = setHint && setHint.startsWith('CN-')
    ? setHint.slice(3)                          // 1ANV / 2ANV / 3ANV
    : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchCatalog = async () => {
      let narrowed = null;
      if (!showAll && annivHint) {
        try {
          const r = await fetch(apiUrl('/cn-anniv-cards?anniv=' + encodeURIComponent(annivHint) + '&verified=true'));
          const d = await r.json();
          if (d?.items?.length > 0) narrowed = d.items;
        } catch { /* fall through */ }
      }
      if (!narrowed) {
        try {
          const r = await fetch(apiUrl('/cn-anniv-cards?verified=true'));
          const d = await r.json();
          narrowed = d?.items || [];
        } catch { narrowed = []; }
      }
      if (cancelled) return;
      setItems(narrowed);

      // Vision + Haiku confirm against the user's photo.
      if (imageDataUrl && narrowed.length > 0) {
        setVisionLoading(true);
        try {
          const r = await fetch(apiUrl('/visual-match'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: imageDataUrl,
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
            if (visionData.bestMatch) setBestMatchId(visionData.bestMatch.id);
          }
        } catch { /* silent */ }
        finally { if (!cancelled) setVisionLoading(false); }
      }
    };

    fetchCatalog().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line
  }, [annivHint, showAll]);

  const ranked = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => {
      const aId = items.indexOf(a);
      const bId = items.indexOf(b);
      return (matchScores[bId] || 0) - (matchScores[aId] || 0);
    });
  }, [items, matchScores]);

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>CN ANNIVERSARY · VISUAL LOOKUP</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {visionLoading && <Pill tag="Vision…" />}
          {bestMatchId !== null && !visionLoading && <Pill tag="AI matched" />}
          {annivHint && <Pill tag={annivHint.replace('ANV', ' Anniversary')} />}
        </div>
      </div>
      <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 12, lineHeight: 1.6 }}>
        CN Anniversary box cards are alt-art reprints — the printed code
        (e.g. OP01-016) matches the original print, but the artwork is
        unique to the anniversary box. Tap the matching card below to lock
        the synthetic code used for SwibSwap pricing + the verified DB.
      </div>

      {loading && <LoadingCard text="Loading CN Anniversary card catalog…" />}

      {!loading && items && items.length === 0 && (
        <div style={{ fontSize: SZ.sm, color: T.textMid, padding: '8px 0' }}>
          No CN Anniversary records yet — run <code>node tools/backfill-cn-anniv.mjs</code>
          to upload the local samples.
        </div>
      )}

      {ranked.length > 0 && !loading && bestMatchId === null && !visionLoading && (
        <div style={{
          fontSize: SZ.xs, color: T.textDim, marginBottom: 10,
          fontStyle: 'italic', textAlign: 'center',
        }}>
          No AI match — pick manually below.
        </div>
      )}

      {ranked.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {/* SCN61 — show ALL variants for CN anniversary (catalog is only
              ~33 items total). Haiku's confirmed pick stays at the top via
              the existing rank sort, but the user can still scroll through
              the full grid. DON cards keep their top-9 cap because their
              catalog is ~600 entries. */}
          {ranked.map((d, displayIdx) => {
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
                  border: '1px solid ' + (aiMatched ? T.cyan : T.border2),
                  borderRadius: 12, padding: 8, cursor: 'pointer', position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  boxShadow: aiMatched ? '0 0 16px ' + T.cyanGlow : 'none',
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
                  src={d.imageUrl}
                  alt={d.name}
                  loading="lazy"
                  style={{
                    width: '100%', height: 'auto', borderRadius: 8, display: 'block',
                    aspectRatio: '63 / 88', objectFit: 'contain', background: T.bgDeep,
                  }}
                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                />
                <div style={{ fontSize: SZ.xs, color: T.textHi, fontFamily: T.fontMono, textAlign: 'center', fontWeight: 600, lineHeight: 1.3 }}>
                  {d.name}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span style={{ fontSize: SZ.xs, color: T.amber, fontFamily: T.fontDisplay, letterSpacing: '0.05em' }}>
                    {d.setHint}
                  </span>
                </div>
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
