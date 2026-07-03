// src/screens/scanner/ImageLightbox.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

export default function ImageLightbox({ src, onClose, initialZoom = 1 }) {
  const [zoom, setZoom] = useState(initialZoom);
  const viewportRef = useRef(null);
  const dragStateRef = useRef({ active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 });
  // Reset zoom when src changes (user opens a different image).
  useEffect(() => { setZoom(initialZoom); }, [src, initialZoom]);

  // Wheel zoom + Ctrl-wheel micro-zoom.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      // Ctrl (or ⌘ on Mac) → smaller per-notch step for precise zoom.
      const fine = e.ctrlKey || e.metaKey;
      const inFactor  = fine ? 1.03 : 1.10;
      const outFactor = fine ? 0.97 : 0.90;
      const factor = e.deltaY > 0 ? outFactor : inFactor;
      setZoom((z) => {
        const next = Math.max(0.5, Math.min(8, z * factor));
        return Math.round(next * 100) / 100;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Click-drag to pan while zoomed (works for both mouse and single-finger
  // touch). Native overflow:auto scrollbars still work alongside this for
  // users who prefer them.
  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    const el = viewportRef.current;
    if (!el) return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollX: el.scrollLeft,
      scrollY: el.scrollTop,
    };
    el.style.cursor = 'grabbing';
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onPointerMove = (e) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = state.scrollX - (e.clientX - state.startX);
    el.scrollTop  = state.scrollY - (e.clientY - state.startY);
  };
  const onPointerUp = (e) => {
    dragStateRef.current.active = false;
    const el = viewportRef.current;
    if (el) el.style.cursor = zoom > 1 ? 'grab' : 'default';
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const chips = [
    { label: 'Fit',   value: 1   },
    { label: '100%',  value: 1   },
    { label: '200%',  value: 2   },
    { label: '400%',  value: 4   },
  ];
  const zoomReadout = `${Math.round(zoom * 100)}%`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)',
        zIndex: 200, display: 'flex', flexDirection: 'column',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top toolbar — zoom chips + live readout + close button */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: 12, display: 'flex', gap: 8, alignItems: 'center',
        justifyContent: 'center', flexWrap: 'wrap',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))',
      }}>
        {chips.map((c, i) => {
          const active = Math.abs(zoom - c.value) < 0.01;
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setZoom(c.value); }}
              style={{
                padding: '6px 14px', fontSize: SZ.xs,
                background: active ? T.gradientPrimary : 'transparent',
                color: active ? T.bgDeep : T.textHi,
                border: `1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.3)'}`,
                borderRadius: 999, fontWeight: 700, fontFamily: T.fontDisplay,
                letterSpacing: '0.08em', cursor: 'pointer',
              }}
            >{c.label}</button>
          );
        })}
        <div style={{
          fontSize: SZ.xs, color: T.textMid, fontFamily: T.fontMono,
          padding: '6px 10px', minWidth: 56, textAlign: 'center',
          letterSpacing: '0.04em',
        }}>{zoomReadout}</div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            padding: '6px 12px', fontSize: SZ.sm,
            background: 'transparent', color: T.textHi,
            border: `1px solid rgba(255,255,255,0.3)`,
            borderRadius: 999, fontWeight: 700, cursor: 'pointer',
          }}
          aria-label="Close"
        >✕</button>
      </div>

      {/* Image area — wheel-zoom + click-drag pan + native pinch zoom */}
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          flex: 1, overflow: 'auto', padding: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'pan-x pan-y pinch-zoom',
          cursor: zoom > 1 ? 'grab' : 'zoom-in',
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            maxWidth:  zoom <= 1 ? '100%' : 'none',
            maxHeight: zoom <= 1 ? '100%' : 'none',
            width:  zoom <= 1 ? 'auto' : `${zoom * 100}%`,
            height: 'auto',
            borderRadius: 10, display: 'block',
            transition: 'width 0.08s ease',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        background: 'rgba(0,0,0,0.6)', color: T.textLow,
        fontSize: SZ.xs, fontFamily: T.fontMono, letterSpacing: '0.04em',
        padding: '6px 10px', borderRadius: 999,
      }}>
        scroll = zoom · ctrl+scroll = fine zoom · drag = pan · tap outside = close
      </div>
    </div>
  );
}
