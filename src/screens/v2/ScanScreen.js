import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { useScan } from '../../hooks/useScan';
import { useToast } from '../../components/ui/Toast';
import { getJson } from '../../api';
import { compressImageSafe } from '../../lib/image';
import CameraCapture from './CameraCapture';
import LanguageModal from './LanguageModal';

const TYPES = [
  { key: 'op', label: 'One Piece' },
  { key: 'ygo', label: 'Yu-Gi-Oh!' },
  { key: 'pokemon', label: 'Pokémon' },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function RecentThumb({ item, onClick }) {
  return (
    <div
      onClick={onClick}
      className="snap-start flex-shrink-0 w-32 glass-panel rounded-xl p-2 flex flex-col gap-2 relative overflow-hidden group hover:border-primary-fixed-dim/50 transition-colors cursor-pointer"
    >
      <div className="w-full h-20 rounded-lg overflow-hidden bg-surface-container-high relative">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
            <Icon name="image" size={24} />
          </div>
        )}
        <div className="absolute top-1 right-1 bg-surface-container-highest/80 backdrop-blur-md rounded px-1.5 py-0.5 border border-white/10">
          <span className="font-label-caps text-[10px] leading-tight text-secondary-fixed">
            {item.typeLabel || item.type?.toUpperCase() || 'OP'}
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="font-label-caps text-[11px] text-primary-fixed-dim truncate">
          #{item.code}
        </span>
        <span className="font-body-sm text-[12px] text-on-surface-variant truncate">
          {item.name}
        </span>
      </div>
    </div>
  );
}

export default function ScanScreen({ user, onResult }) {
  const [type, setType] = useState('op');
  const [capturing, setCapturing] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const fileInputRef = useRef(null);
  const scan = useScan();
  const { showToast } = useToast();

  const typeLabel = TYPES.find((t) => t.key === type)?.label || 'One Piece';

  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sws_recent_scans') || '[]');
    } catch {
      return [];
    }
  });

  const saveRecent = useCallback((code, name, rarity, language, image, scanType, scanTypeLabel) => {
    setRecent((prev) => {
      const next = [
        { code, name, rarity, language, image, type: scanType, typeLabel: scanTypeLabel, at: Date.now() },
        ...prev,
      ].slice(0, 10);
      try { localStorage.setItem('sws_recent_scans', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const runScan = useCallback(async (imageBase64, scanLanguage) => {
    try {
      let result = await scan.mutateAsync({ imageBase64, language: scanLanguage, game: type });
      if (result?.ok === false) {
        throw new Error(result.error || 'Scan failed');
      }
      // Enrich scanned card with the language used for the scan.
      const scannedCard = result?.card || {};
      const card = { ...scannedCard, lang: scannedCard.lang || scanLanguage };
      result = { ...result, card, game: type };
      const code = card.code || 'UNKNOWN';
      const name = card.nameEn || card.name || 'Unknown card';

      // Only One Piece has the official-sample bounce-out check for now.
      if (type === 'op') {
        const details = await getJson(
          `/op-details?code=${encodeURIComponent(code)}&lang=${encodeURIComponent(scanLanguage)}`
        );
        const hasOfficial = !!details?.details?.sampleImageUrl || !!details?.details?.imageUrl;
        if (!hasOfficial) {
          throw new Error('Official sample not found. Scan rejected.');
        }
      }

      saveRecent(code, name, card.rarity, scanLanguage, imageBase64, type, typeLabel);
      onResult({ image: imageBase64, result });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Scan failed',
        message: err.message || 'Scan failed',
        duration: 6000,
      });
    }
  }, [scan, type, typeLabel, onResult, saveRecent, showToast]);

  const handleImageReady = useCallback(async (b64) => {
    const compressed = await compressImageSafe(b64, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.85,
    });
    setPendingImage(compressed);
  }, []);

  const handleScanClick = useCallback(() => {
    if (!pendingImage) return;
    setShowLangModal(true);
  }, [pendingImage]);

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await fileToBase64(file);
    try { e.target.value = ''; } catch { /* ignore */ }
    handleImageReady(b64);
  }, [handleImageReady]);

  const handleLanguageSelect = useCallback((lang) => {
    setShowLangModal(false);
    if (pendingImage) {
      runScan(pendingImage, lang);
      setPendingImage(null);
    }
  }, [pendingImage, runScan]);

  const handleLanguageCancel = useCallback(() => {
    setShowLangModal(false);
  }, []);

  useEffect(() => {
    const onStorage = () => {
      try {
        setRecent(JSON.parse(localStorage.getItem('sws_recent_scans') || '[]'));
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (capturing) {
    return (
      <CameraCapture
        onCapture={(dataUrl) => {
          setCapturing(false);
          handleImageReady(dataUrl);
        }}
        onCancel={() => setCapturing(false)}
      />
    );
  }

  return (
    <div className="min-h-full flex flex-col font-body-sm relative overflow-hidden">
      <main className="flex-grow relative w-full min-h-full flex flex-col pb-6">
        {/* Camera Viewfinder Area */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-surface-container-low via-background to-background" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,178,191,0.08),transparent_50%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/90" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full min-h-full flex flex-col md:flex-row md:items-center md:gap-16 md:px-margin-desktop">
          {/* Desktop left panel — tips & recent scans */}
          <section className="hidden md:flex md:w-5/12 flex-col gap-8 self-center">
            <div>
              <h1 className="font-headline-xl text-headline-xl text-secondary">Scan a card</h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-md">
                Point your camera at a card. We’ll identify it, pull the official sample when available, and show market pricing.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed-dim/5 to-transparent pointer-events-none" />
              <h3 className="font-label-caps text-label-caps text-secondary uppercase tracking-widest mb-4 relative z-10">Scan tips</h3>
              <ul className="space-y-3 relative z-10">
                {[
                  'Use good, even lighting',
                  'Keep the card flat and centered',
                  'Hold steady until the frame locks',
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-3 text-body-md text-on-surface-variant">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                      {i + 1}
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {recent.length > 0 && (
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-3 uppercase tracking-widest">
                  Recent scans
                </h3>
                <div className="flex flex-col gap-3">
                  {recent.slice(0, 4).map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => onResult({ image: item.image, result: { card: { code: item.code, name: item.name, rarity: item.rarity, lang: item.language }, game: item.type } })}
                      className="w-full glass-panel rounded-xl p-3 flex items-center gap-4 hover:border-primary-fixed-dim/30 transition-colors text-left"
                    >
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                            <Icon name="image" size={18} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-body-md text-on-surface truncate">{item.name}</div>
                        <div className="font-label-caps text-[11px] text-primary-fixed-dim truncate">
                          #{item.code} · {item.rarity} · {item.language}
                        </div>
                      </div>
                      <Icon name="chevron_right" size={18} className="text-on-surface-variant shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Scanner stage — mobile-first, centered on desktop */}
          <section className="w-full md:w-7/12 flex flex-col items-center justify-start pt-10 md:pt-12 md:pb-6 px-margin-mobile md:px-0 min-h-full">
            <div className="text-center mb-3 md:hidden">
              <h1 className="font-headline-md text-headline-md text-secondary">Scan a card</h1>
              <p className="font-body-sm text-on-surface-variant mt-1">Take a photo or pick from gallery</p>
            </div>

            <div className="relative w-full max-w-[280px] aspect-[63/88] md:max-w-[340px] mx-auto">
              {/* Ambient glow behind reticle */}
              <div className="absolute -inset-10 bg-primary/10 rounded-[40%] blur-3xl z-0 animate-pulse-soft" />

              {/* Reticle Box */}
              <div className={`absolute inset-0 border border-white/10 overflow-hidden ${pendingImage ? 'bg-black/20' : 'bg-white/5 backdrop-blur-[2px]'}`}>
                {pendingImage && (
                  <img
                    src={pendingImage}
                    alt="Selected card"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              {/* Corners */}
              <div className="reticle-corner corner-tl" />
              <div className="reticle-corner corner-tr" />
              <div className="reticle-corner corner-bl" />
              <div className="reticle-corner corner-br" />

              {!pendingImage && (
                <>
                  {/* Scanning Line */}
                  <div className="scanner-line" />
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center w-full">
                    <p className="font-label-caps text-label-caps text-primary-fixed-dim/80 mb-2">
                      ALIGN ASSET WITHIN FRAME
                    </p>
                    <Icon name="center_focus_weak" size={40} className="text-primary-fixed-dim/50 animate-pulse" />
                  </div>
                </>
              )}

              {pendingImage && (
                <button
                  onClick={() => setPendingImage(null)}
                  disabled={scan.isPending}
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-surface-container-high/90 backdrop-blur-md flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                  aria-label="Clear selected image"
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>

            {/* Type Selector */}
            <div className="mt-8 mb-8 md:mt-5 md:mb-5 glass-panel rounded-full p-1 flex items-center w-max mx-auto shadow-[0_0_15px_rgba(255,178,191,0.1)]">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`px-4 py-1.5 rounded-full font-label-caps text-label-caps transition-colors ${
                    type === t.key
                      ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Bottom UI Area */}
            <div className="relative z-20 w-full max-w-3xl mx-auto px-margin-mobile md:px-0 pb-[16px] mt-auto md:mt-5">
              {/* Recent Scans — mobile only */}
              {recent.length > 0 && (
                <div className="mb-6 md:hidden">
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant mb-[8px] ml-1">
                    RECENT SCANS
                  </h3>
                  <div className="flex gap-[16px] overflow-x-auto no-scrollbar pb-2 snap-x">
                    {recent.slice(0, 5).map((item, idx) => (
                      <RecentThumb
                        key={idx}
                        item={item}
                        onClick={() => onResult({ image: item.image, result: { card: { code: item.code, name: item.name, rarity: item.rarity, lang: item.language }, game: item.type } })}
                      />
                    ))}
                    <div className="snap-start flex-shrink-0 w-32 glass-panel rounded-xl p-2 flex flex-col gap-2 relative overflow-hidden opacity-50">
                      <div className="w-full h-20 rounded-lg overflow-hidden flex items-center justify-center border border-dashed border-white/20">
                        <Icon name="history" size={24} className="text-on-surface-variant" />
                      </div>
                      <div className="flex flex-col items-center justify-center h-full">
                        <span className="font-label-caps text-[10px] text-on-surface-variant">VIEW ALL</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

              {/* Primary Action Buttons */}
              <div className="flex flex-col md:flex-row gap-3 md:justify-center">
                <button
                  onClick={() => setCapturing(true)}
                  disabled={scan.isPending}
                  className="w-full md:w-auto md:min-w-[160px] py-3 rounded-xl glass-panel text-on-surface-variant font-label-caps text-label-caps hover:bg-white/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Icon name="photo_camera" size={20} filled />
                  Take photo
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scan.isPending}
                  className="w-full md:w-auto md:min-w-[160px] py-3 rounded-xl glass-panel text-on-surface-variant font-label-caps text-label-caps hover:bg-white/5 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Icon name="image" size={20} />
                  Pick from gallery
                </button>
              </div>

              <button
                onClick={handleScanClick}
                disabled={!pendingImage || scan.isPending}
                className="mt-3 w-full md:w-auto md:min-w-[336px] mx-auto py-4 rounded-xl bg-primary-fixed-dim text-on-primary-fixed-variant font-label-caps text-[14px] font-bold tracking-widest shadow-[0_0_20px_rgba(255,178,191,0.3)] hover:shadow-[0_0_30px_rgba(255,178,191,0.5)] transition-shadow active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Icon name="document_scanner" size={20} filled />
                {scan.isPending ? 'SCANNING…' : 'Scan'}
              </button>
            </div>
          </section>
        </div>

      </main>

      <LanguageModal
        isOpen={showLangModal}
        onSelect={handleLanguageSelect}
        onCancel={handleLanguageCancel}
      />
    </div>
  );
}
