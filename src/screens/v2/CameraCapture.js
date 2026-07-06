import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';

function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          const { protocol, hostname } = window.location;
          const insecure = protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1';
          throw new Error(
            insecure
              ? 'Camera requires HTTPS on non-localhost origins.'
              : 'Camera API not available in this browser.'
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4096 },
            height: { ideal: 3072 },
            zoom: { ideal: 1 },
            focusMode: 'continuous',
          },
          audio: false,
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track?.applyConstraints) {
          try {
            const caps = track.getCapabilities?.();
            const advanced = [];
            if (caps?.zoom) advanced.push({ zoom: caps.zoom.min || 1 });
            if (caps?.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
            if (advanced.length) await track.applyConstraints({ advanced });
          } catch { /* tolerable */ }
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        setError(e.message);
      }
    };
    start();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopStream(streamRef.current);
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <button
          onClick={() => {
            stopStream(streamRef.current);
            onCancel();
          }}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-on-surface"
        >
          <Icon name="arrow_back" size={20} />
        </button>
        <div className="font-display text-body-md text-on-surface">Scan Card</div>
        <div className="w-10" />
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/60" />

        {/* Center reticle */}
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="relative w-full max-w-sm aspect-[63/88] rounded-xl border-2 border-primary/60 shadow-[0_0_30px_-5px_rgba(255,178,191,0.3)]">
            <div className="reticle-corner corner-tl" />
            <div className="reticle-corner corner-tr" />
            <div className="reticle-corner corner-bl" />
            <div className="reticle-corner corner-br" />
            <div className="scanner-line" />
          </div>
        </div>

        {/* Hints */}
        <div className="absolute top-24 left-0 right-0 text-center">
          <div className="font-mono text-label-caps text-on-surface/80 tracking-[0.2em] bg-background/40 inline-block px-3 py-1 rounded-full">
            ALIGN CARD WITHIN FRAME
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-10 p-6 pb-10 glass-panel border-t border-white/5">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm text-center">
            {error}
          </div>
        )}
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => {
              stopStream(streamRef.current);
              onCancel();
            }}
            className="w-14 h-14 rounded-full bg-surface-container border border-outline-variant/40 flex items-center justify-center text-on-surface-variant"
          >
            <Icon name="close" size={24} />
          </button>
          <button
            onClick={capture}
            disabled={!ready}
            className="w-20 h-20 rounded-full border-4 border-primary/40 flex items-center justify-center disabled:opacity-50"
          >
            <div className="w-16 h-16 rounded-full bg-primary" />
          </button>
          <div className="w-14" />
        </div>
      </div>
    </div>
  );
}
