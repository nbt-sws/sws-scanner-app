import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { useScan } from '../../hooks/useScan';
import CameraCapture from '../../CameraCapture';

const LANGUAGES = ['EN', 'JP', 'CN'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScanScreen({ user, onResult }) {
  const [language, setLanguage] = useState('EN');
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef(null);
  const scan = useScan();

  // Persist recent scan codes locally for the blueprint "Recent Scans" list.
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sws_recent_scans') || '[]');
    } catch {
      return [];
    }
  });

  const saveRecent = useCallback((code, name, image) => {
    setRecent((prev) => {
      const next = [{ code, name, image, at: Date.now() }, ...prev].slice(0, 10);
      try { localStorage.setItem('sws_recent_scans', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const runScan = useCallback(async (imageBase64) => {
    try {
      const result = await scan.mutateAsync({ imageBase64, language, game: 'op' });
      const code = result?.code || result?.cards?.[0]?.code || 'UNKNOWN';
      const name = result?.name || result?.cards?.[0]?.name || 'Unknown card';
      saveRecent(code, name, imageBase64);
      onResult({ image: imageBase64, result });
    } catch (err) {
      // Surface error inline.
    }
  }, [scan, language, onResult, saveRecent]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    await runScan(b64);
  }, [runScan]);

  if (capturing) {
    return (
      <CameraCapture
        onCapture={(dataUrl) => {
          setCapturing(false);
          runScan(dataUrl);
        }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 pt-16 pb-24">
      {/* Header */}
      <div className="mb-6">
        <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-1">
          SCAN — SWIBScan v2.4
        </div>
        <h1 className="font-display text-headline-lg-mobile text-on-surface">
          Align asset within frame
        </h1>
      </div>

      {/* Viewfinder */}
      <div className="relative aspect-[3/4] w-full max-w-md mx-auto rounded-3xl border border-primary/30 bg-surface-container-low overflow-hidden mb-6">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-3/4 aspect-[63/88] rounded-xl border-2 border-primary/60">
            <div className="reticle-corner corner-tl" />
            <div className="reticle-corner corner-tr" />
            <div className="reticle-corner corner-bl" />
            <div className="reticle-corner corner-br" />
            <div className="scanner-line" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Icon name="center_focus_weak" size={48} className="text-on-surface/30" />
        </div>
        <div className="absolute top-4 left-0 right-0 text-center font-mono text-label-caps text-on-surface-variant tracking-[0.2em]">
          ALIGN ASSET WITHIN FRAME
        </div>
      </div>

      {/* Language toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-container border border-outline-variant/40">
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-4 py-1.5 rounded-full font-mono text-label-caps transition-colors ${
                language === lang
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Recent scans */}
      {recent.length > 0 && (
        <div className="mb-6">
          <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-3">
            RECENT SCANS
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {recent.slice(0, 6).map((item, idx) => (
              <div
                key={idx}
                className="flex-shrink-0 w-32 rounded-2xl bg-surface-container border border-outline-variant/30 overflow-hidden"
              >
                {item.image && (
                  <div className="aspect-square bg-surface-dim">
                    <img src={item.image} alt="" className="w-full h-full object-cover opacity-80" />
                  </div>
                )}
                <div className="p-2">
                  <div className="font-mono text-[10px] text-primary truncate">#{item.code}</div>
                  <div className="text-body-sm text-on-surface truncate">{item.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-3 max-w-md mx-auto w-full">
        <Button
          size="lg"
          className="gap-2"
          onClick={() => setCapturing(true)}
          disabled={scan.isPending}
        >
          <Icon name="qr_code_scanner" size={20} />
          {scan.isPending ? 'Scanning...' : 'Initiate Scan'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          variant="surface"
          size="lg"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={scan.isPending}
        >
          <Icon name="upload" size={20} />
          Upload Image
        </Button>
      </div>

      {scan.error && (
        <div className="mt-4 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm text-center max-w-md mx-auto">
          {scan.error.message}
        </div>
      )}
    </div>
  );
}
