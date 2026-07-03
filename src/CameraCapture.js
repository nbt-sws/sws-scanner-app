// src/CameraCapture.js — fullscreen camera with card-frame guide + auto-capture.
//
// Behaviour:
//   - Requests environment-facing camera at up to 4K (real device delivers what it can).
//     facingMode: 'environment' picks the main rear lens on iOS/Android — Safari does
//     not let us programmatically select the 1× lens vs. ultra-wide; on iPhones the
//     default rear stream IS the wide 1× lens (the system never auto-switches to
//     ultra-wide for getUserMedia).
//   - Disables digital zoom on tracks that expose the capability.
//   - Overlays a card-shaped guide (2.5×3.5 trading-card aspect, ~63×88 mm).
//   - On mobile (touch device), an Auto-capture toggle samples the guide's border
//     pixels every 400 ms. When edge-contrast crosses a threshold for 3 consecutive
//     samples (i.e. the card lines up with the guide), the camera fires a snap.
//   - Capacitor native: delegates to the platform Camera plugin (existing native.js).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { T, SZ } from './theme';
import { Button, ErrorBanner, Spinner } from './components';
import { isNative, takeNativePhoto } from './native';

const CARD_ASPECT = 63 / 88; // trading card width/height
const AUTO_SAMPLE_INTERVAL_MS = 400;
const AUTO_FRAMES_REQUIRED = 3;
const EDGE_CONTRAST_THRESHOLD = 38; // mean greyscale delta along the guide outline

function isTouchDevice() {
  return (typeof window !== 'undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
}

export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const sampleCanvasRef = useRef(null);
  const stableFramesRef = useRef(0);
  const autoTimerRef = useRef(null);

  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [autoCapture, setAutoCapture] = useState(isTouchDevice());
  const [edgeScore, setEdgeScore] = useState(0);
  const [countdown, setCountdown] = useState(null);

  // -----------------------------------------------------
  // Start camera
  // -----------------------------------------------------
  useEffect(() => {
    if (isNative()) {
      (async () => {
        const dataUrl = await takeNativePhoto();
        if (dataUrl) onCapture(dataUrl);
        else onCancel();
      })();
      return undefined;
    }

    let cancelled = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          const { protocol, hostname } = window.location;
          const insecure = protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1';
          if (insecure) {
            throw new Error(
              'Live camera blocked on insecure (HTTP) origin. ' +
              'Safari requires HTTPS. Use the native camera button on the Scan tab instead, ' +
              'or run the dev server over HTTPS (ngrok / localtunnel / vercel deploy).'
            );
          }
          throw new Error('Camera API not available in this browser');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            // Ask for max resolution; the device gives us what it can.
            width:  { ideal: 4096 },
            height: { ideal: 3072 },
            // Disable digital zoom where supported (Chrome on Android exposes this).
            zoom:    { ideal: 1.0 },
            // Continuous autofocus (well-supported on iOS Safari + Android Chrome).
            focusMode: 'continuous',
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Try to apply additional constraints post-getUserMedia.
        const track = stream.getVideoTracks()[0];
        if (track?.applyConstraints) {
          try {
            const caps = track.getCapabilities?.();
            const adv = [];
            if (caps?.zoom)        adv.push({ zoom: caps.zoom.min || 1.0 });
            if (caps?.focusMode?.includes('continuous')) adv.push({ focusMode: 'continuous' });
            if (adv.length) await track.applyConstraints({ advanced: adv });
          } catch { /* tolerable */ }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => { /* autoplay quirks */ });
          setReady(true);
        }
      } catch (e) {
        setError(`Camera unavailable: ${e.message}`);
      }
    };
    start();
    return () => {
      cancelled = true;
      stopStream();
      clearAutoTimer();
    };
  }, []);  // intentional — only run once on mount

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const clearAutoTimer = () => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  // -----------------------------------------------------
  // Auto-capture loop — samples the card-guide outline and snaps when stable.
  // -----------------------------------------------------
  // SCN4: instead of returning the full video frame, crop to the card-guide
  // rectangle (centered, card aspect, 70% of the shorter video edge — the
  // same rectangle the on-screen guide draws). This means every camera-mode
  // capture is automatically framed to JUST the card with a small breathing-
  // room margin, so downstream Haiku + Vision get a clean input.
  //
  // Library-picked photos still go through the auto-crop skill (SCN5) since
  // there's no frame to align to.
  const snap = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;

    const vW = v.videoWidth  || 1920;
    const vH = v.videoHeight || 1080;

    // Compute the crop rectangle in video-pixel space. Matches the on-screen
    // guide: centered, card-aspect, 70% of the shorter edge for the long side.
    // The 4% padding below adds ~0.5" of breathing room around the card edge
    // — Haiku + Vision need a bit of border to detect card corners reliably.
    const PAD = 0.04;
    const shorter = Math.min(vW, vH);
    let boxH = Math.round(shorter * 0.70 * (1 + PAD * 2));
    let boxW = Math.round(boxH * CARD_ASPECT);
    // If the video is landscape with a tall card-frame, ensure we don't go
    // off the edges.
    if (boxW > vW) { boxW = vW; boxH = Math.round(boxW / CARD_ASPECT); }
    if (boxH > vH) { boxH = vH; boxW = Math.round(boxH * CARD_ASPECT); }
    const left = Math.round((vW - boxW) / 2);
    const top  = Math.round((vH - boxH) / 2);

    // Output canvas dimensions = the crop rectangle dimensions. We bake
    // the crop directly during drawImage by sourcing only that region.
    c.width  = boxW;
    c.height = boxH;
    const ctx = c.getContext('2d');
    ctx.drawImage(
      v,
      left, top, boxW, boxH,   // source rect
      0, 0, boxW, boxH         // dest rect
    );
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    stopStream();
    clearAutoTimer();
    onCapture(dataUrl);
  }, [onCapture]);

  useEffect(() => {
    if (!ready || !autoCapture) {
      clearAutoTimer();
      stableFramesRef.current = 0;
      setCountdown(null);
      return undefined;
    }

    autoTimerRef.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const sc = sampleCanvasRef.current || (sampleCanvasRef.current = document.createElement('canvas'));
      const W = 320, H = Math.round(320 / (v.videoWidth / v.videoHeight));
      sc.width = W; sc.height = H;
      const sctx = sc.getContext('2d');
      sctx.drawImage(v, 0, 0, W, H);
      const score = measureEdgeContrast(sctx, W, H);
      setEdgeScore(score);

      if (score >= EDGE_CONTRAST_THRESHOLD) {
        stableFramesRef.current += 1;
      } else {
        stableFramesRef.current = 0;
      }

      if (stableFramesRef.current >= AUTO_FRAMES_REQUIRED) {
        clearAutoTimer();
        // Brief 1-second countdown so the user sees what's about to happen.
        setCountdown(1);
        setTimeout(() => { setCountdown(null); snap(); }, 1000);
      }
    }, AUTO_SAMPLE_INTERVAL_MS);

    return clearAutoTimer;
  }, [ready, autoCapture, snap]);

  // -----------------------------------------------------
  // UI handlers
  // -----------------------------------------------------
  const cancel = () => {
    stopStream();
    clearAutoTimer();
    onCancel();
  };

  // -----------------------------------------------------
  // Render
  // -----------------------------------------------------
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <header
        style={{
          padding: '14px 16px', color: T.textHi, fontSize: SZ.md, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <button
          type="button"
          onClick={cancel}
          style={{
            background: 'transparent', border: 'none', color: T.textMid,
            fontSize: SZ.md, cursor: 'pointer', padding: 4,
          }}
        >
          ✕ Close
        </button>
        <span style={{ fontFamily: T.fontDisplay, letterSpacing: '0.08em' }}>SCAN A CARD</span>
        <label style={{ fontSize: SZ.sm, color: T.textMid, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoCapture}
            onChange={(e) => setAutoCapture(e.target.checked)}
            style={{ accentColor: T.cyan }}
          />
          Auto
        </label>
      </header>

      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 12, position: 'relative', overflow: 'hidden',
        }}
      >
        {error ? (
          <div style={{ maxWidth: 380, width: '100%' }}>
            <ErrorBanner message={error} />
            <div style={{ color: T.textMid, fontSize: SZ.sm, textAlign: 'center', marginTop: 12 }}>
              Try the &quot;Pick from gallery&quot; option instead.
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                borderRadius: 14, background: '#000',
              }}
            />
            <CardGuide active={ready && !error} edgeScore={edgeScore} countdown={countdown} />
            {!ready && !error && (
              <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', gap: 10, color: T.textMid, fontSize: SZ.sm }}>
                <Spinner size={20} /> Starting camera…
              </div>
            )}
          </>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <footer style={{ padding: 16 }}>
        {countdown !== null ? (
          <div style={{
            textAlign: 'center', color: T.cyan, fontSize: SZ.xl,
            fontFamily: T.fontDisplay, letterSpacing: '0.1em', padding: '12px 0',
          }}>
            CAPTURING…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Button variant="outline" onClick={cancel} size="lg">Cancel</Button>
            <Button onClick={snap} disabled={!ready || !!error} size="lg">Capture</Button>
          </div>
        )}
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------------
// Card-aspect guide overlay
// ------------------------------------------------------------------------
function CardGuide({ active, edgeScore, countdown }) {
  // Compute guide dimensions in CSS — 75% of the shorter side, then constrain by card aspect.
  const aligned = edgeScore >= EDGE_CONTRAST_THRESHOLD;
  const cornerColor = aligned ? T.cyan : 'rgba(255,255,255,0.65)';
  const cornerLength = 32;
  const cornerThick = 4;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(70vw, 70vh * 0.715)',
          aspectRatio: String(CARD_ASPECT),
          position: 'relative',
          transition: 'box-shadow 0.2s ease',
          boxShadow: aligned
            ? `0 0 0 2px ${T.cyan}, 0 0 60px ${T.cyanGlow}`
            : '0 0 0 1px rgba(255,255,255,0.25)',
          borderRadius: 16,
        }}
      >
        {/* 4 corner brackets */}
        {[
          { top: -2, left: -2, borderTopLeftRadius: 14 },
          { top: -2, right: -2, borderTopRightRadius: 14 },
          { bottom: -2, left: -2, borderBottomLeftRadius: 14 },
          { bottom: -2, right: -2, borderBottomRightRadius: 14 },
        ].map((pos, i) => (
          <Corner key={i} pos={pos} color={cornerColor} len={cornerLength} thick={cornerThick} />
        ))}

        {active && countdown === null && (
          <div
            style={{
              position: 'absolute', bottom: -42, left: 0, right: 0, textAlign: 'center',
              color: aligned ? T.cyan : 'rgba(255,255,255,0.7)',
              fontSize: SZ.sm, fontFamily: T.fontDisplay, letterSpacing: '0.18em',
              textTransform: 'uppercase', transition: 'color 0.2s',
            }}
          >
            {aligned ? 'Card aligned ✓' : 'Align card inside frame'}
          </div>
        )}
      </div>
    </div>
  );
}

function Corner({ pos, color, len, thick }) {
  const isTop = pos.top !== undefined;
  const isLeft = pos.left !== undefined;
  return (
    <>
      <div style={{
        position: 'absolute', width: len, height: thick, background: color,
        ...(isTop ? { top: pos.top } : { bottom: pos.bottom }),
        ...(isLeft ? { left: pos.left } : { right: pos.right }),
        transition: 'background 0.2s',
      }} />
      <div style={{
        position: 'absolute', width: thick, height: len, background: color,
        ...(isTop ? { top: pos.top } : { bottom: pos.bottom }),
        ...(isLeft ? { left: pos.left } : { right: pos.right }),
        transition: 'background 0.2s',
      }} />
    </>
  );
}

// ------------------------------------------------------------------------
// Edge-contrast metric — samples pixels along where the card guide sits
// in the video frame, returns a 0-255 score. Higher = more high-contrast
// edges aligned with the guide, which is what we want.
// ------------------------------------------------------------------------
function measureEdgeContrast(ctx, W, H) {
  // Sample box: same proportions as the on-screen guide (~70% of shorter side, card aspect).
  const shorter = Math.min(W, H);
  const boxH = Math.round(shorter * 0.7);
  const boxW = Math.round(boxH * CARD_ASPECT);
  const left = Math.round((W - boxW) / 2);
  const top  = Math.round((H - boxH) / 2);

  // Pull the bounding strip — a few pixels wide on each side, sample mid line.
  let totalDelta = 0;
  let samples = 0;

  // Horizontal edges (top + bottom)
  const sampleLine = (y) => {
    const img = ctx.getImageData(left, y - 1, boxW, 3).data;
    for (let x = 0; x < boxW - 4; x += 4) {
      const i = x * 4;
      const g1 = (img[i] + img[i+1] + img[i+2]) / 3;
      const g2 = (img[i + 16] + img[i + 17] + img[i + 18]) / 3;
      totalDelta += Math.abs(g1 - g2);
      samples += 1;
    }
  };
  // Vertical edges (left + right) — sample col by col
  const sampleCol = (x) => {
    const img = ctx.getImageData(x - 1, top, 3, boxH).data;
    const stride = 3 * 4;
    for (let y = 0; y < boxH - 4; y += 4) {
      const i = y * stride + 4; // middle of 3-wide strip
      const g1 = (img[i] + img[i+1] + img[i+2]) / 3;
      const g2 = (img[i + stride * 4] + img[i + stride * 4 + 1] + img[i + stride * 4 + 2]) / 3;
      totalDelta += Math.abs(g1 - g2);
      samples += 1;
    }
  };

  try {
    sampleLine(top);
    sampleLine(top + boxH);
    sampleCol(left);
    sampleCol(left + boxW);
  } catch {
    return 0;
  }

  return samples > 0 ? Math.round(totalDelta / samples) : 0;
}
