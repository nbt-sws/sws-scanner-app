import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/Icon';
import { usePrices } from '../../hooks/usePrices';
import { useAddVaultItem } from '../../hooks/useAddVaultItem';
import { getJson, postJson, proxyImageUrl } from '../../api';
import { AnimatedCurrency } from '../../components/AnimatedCurrency';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { isGradedTier } from '../scanner/helpers';

function parseYear(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (!Number.isNaN(d.getFullYear())) return d.getFullYear();
  const m = String(dateString).match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

const OP_YEAR_MAP = {
  OP01: 2022,
  OP02: 2023,
  OP03: 2023,
  OP04: 2023,
  OP05: 2023,
  OP06: 2024,
  OP07: 2024,
  OP08: 2024,
  OP09: 2024,
  OP10: 2025,
};

function deriveYear(card, details) {
  const fromDate = parseYear(details?.releaseDate);
  if (fromDate) return fromDate;
  const code = card?.code || details?.code || '';
  const match = String(code).match(/^(OP\d{2})/i);
  if (match) return OP_YEAR_MAP[match[1].toUpperCase()] || null;
  return null;
}

function DetailItem({ label, value }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="glass-panel rounded-lg p-4">
      <span className="font-label-caps text-label-caps text-on-surface-variant block mb-1 uppercase">{label}</span>
      <span className="font-body-md text-body-md text-on-surface">{display}</span>
    </div>
  );
}

function fmtCurrency(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

const CORNER_KEYS = [
  ['topLeft', 'Top-Left'],
  ['topRight', 'Top-Right'],
  ['bottomLeft', 'Bottom-Left'],
  ['bottomRight', 'Bottom-Right'],
];

function useScanExtras(image, code, rarity, lang, enabled, qualityEnabled, currency = 'USD') {
  const watermark = useQuery({
    queryKey: ['watermark', image],
    queryFn: async () => {
      const data = await postJson('/watermark', { image });
      if (data?.ok === false) throw new Error(data.error || 'watermark failed');
      return data;
    },
    enabled: enabled && !!image,
    retry: false,
  });

  const quality = useQuery({
    queryKey: ['quality', image],
    queryFn: async () => {
      const data = await postJson('/quality', { image, tcg: 'op' });
      if (data?.ok === false) throw new Error(data.error || 'quality failed');
      return data;
    },
    enabled: enabled && qualityEnabled && !!image,
    retry: false,
  });

  const pricingRaw = useQuery({
    queryKey: ['prices-raw', code, rarity, lang, currency],
    queryFn: async () => {
      const params = new URLSearchParams({ code, rarity, lang });
      const data = await getJson(`/prices?${params.toString()}`);
      if (data?.ok === false) throw new Error(data.error || 'pricing failed');
      return data;
    },
    enabled: enabled && !!code && !!rarity && rarity !== '—',
    retry: false,
  });

  return { watermark, quality, pricingRaw };
}

function PricingSection({ pricing, currency = 'USD' }) {
  const [activeTab, setActiveTab] = useState('All');
  const fmt = (v) => fmtCurrency(v, currency);
  if (!pricing) return null;

  const overall = pricing.overall;
  const allItems = overall?.items || [];
  const gradedItems = allItems.filter((i) => isGradedTier(i.conditionTier));
  const rawItems = allItems.filter((i) => !isGradedTier(i.conditionTier));

  const tabData =
    activeTab === 'Graded'
      ? { ...overall, items: gradedItems, median: medianOf(gradedItems), lowest: lowestOf(gradedItems), highest: highestOf(gradedItems) }
      : activeTab === 'Raw'
      ? { ...overall, items: rawItems, median: medianOf(rawItems), lowest: lowestOf(rawItems), highest: highestOf(rawItems) }
      : overall;

  const tabs = [
    ['All', allItems.length],
    ['Graded', gradedItems.length],
    ['Raw', rawItems.length],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-label-caps text-primary-fixed-dim uppercase">
          {pricing.sourceType === 'active' ? 'ACTIVE LISTINGS · EBAY' : 'SOLD HISTORY · EBAY'}
        </span>
        <span className="font-label-caps text-label-caps text-on-surface-variant">
          {pricing.totalSold || 0} {pricing.sourceType === 'active' ? 'listed' : 'sold'}
        </span>
      </div>

      {pricing.sourceType === 'active' && (
        <div className="font-body-sm text-body-sm text-on-surface-variant italic">
          Active listings (no recent sold-history on eBay US).
        </div>
      )}

      {pricing.fallbackLinks?.ebaySold && (
        <div className="grid grid-cols-2 gap-4">
          <a
            href={pricing.fallbackLinks.ebaySold}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary font-label-caps text-label-caps uppercase px-4 py-3 rounded-xl flex items-center justify-center gap-2"
          >
            Sold History ↗
          </a>
          {pricing.fallbackLinks.ebayActive && (
            <a
              href={pricing.fallbackLinks.ebayActive}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary font-label-caps text-label-caps uppercase px-4 py-3 rounded-xl flex items-center justify-center gap-2"
            >
              Current Listings ↗
            </a>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {tabs.map(([t, count]) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2.5 rounded-full font-label-caps text-label-caps uppercase tracking-widest transition-colors ${
                isActive
                  ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim border border-primary-fixed-dim/30'
                  : 'bg-surface-container text-on-surface-variant border border-white/5 hover:bg-surface-variant/50'
              }`}
            >
              {t} ({count})
            </button>
          );
        })}
      </div>

      {tabData && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center p-3 bg-surface-container-lowest rounded-lg border border-white/5">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Low</span>
              <span className="font-headline-lg text-headline-lg text-on-surface">{fmt(tabData.lowest)}</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-surface-container-lowest rounded-lg border border-primary-fixed-dim/30 glow-accent relative overflow-hidden">
              <div className="absolute inset-0 bg-primary-fixed-dim/5" />
              <span className="font-label-caps text-label-caps text-primary-fixed-dim uppercase relative z-10">Median</span>
              <span className="font-headline-lg text-headline-lg text-secondary relative z-10">{fmt(tabData.median)}</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-surface-container-lowest rounded-lg border border-white/5">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">High</span>
              <span className="font-headline-lg text-headline-lg text-on-surface">{fmt(tabData.highest)}</span>
            </div>
          </div>

          {tabData.lastSold && (
            <div className="flex justify-between items-center bg-surface-container-high/50 rounded-lg p-3 border border-white/5">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">Last Sold</span>
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary-fixed-dim">
                {fmt(tabData.lastSold.priceUSD)} · {fmtDate(tabData.lastSold.date || tabData.lastSold.soldDate)}
              </span>
            </div>
          )}

          {tabData.items && tabData.items.length > 0 && (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto no-scrollbar">
              {tabData.items.slice(0, 50).map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-colors border border-white/5"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="font-body-sm text-body-sm text-on-surface truncate">{item.title}</div>
                    <div className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
                      {item.conditionTier || item.condition || '—'} · {fmtDate(item.soldDate || item.date)}
                    </div>
                  </div>
                  <div className="font-label-caps text-sm text-primary-fixed-dim whitespace-nowrap">
                    {fmt(item.priceUSD || item.price)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <div className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">
        {pricing.source} · query: &quot;{pricing.query || pricing.canonicalQuery}&quot;
      </div>
    </div>
  );
}

function medianOf(items) {
  if (!items?.length) return 0;
  const vals = items.map((i) => i.priceUSD || i.price || 0).filter((v) => v > 0).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}
function lowestOf(items) {
  if (!items?.length) return 0;
  return Math.min(...items.map((i) => i.priceUSD || i.price || 0).filter((v) => v > 0));
}
function highestOf(items) {
  if (!items?.length) return 0;
  return Math.max(...items.map((i) => i.priceUSD || i.price || 0).filter((v) => v > 0));
}

export default function ScanResultScreen({ user, getToken, image, result, currency = 'USD', game = 'op', onBack, onAdded }) {
  const isOp = game === 'op';
  const card = result?.card || result || {};
  const code = card.code || 'UNKNOWN';
  const [selectedRarity, setSelectedRarity] = useState(card.rarity || '');
  const [scoreQuality, setScoreQuality] = useState(false);
  const rarity = selectedRarity || card.rarity || '—';
  const name = card.nameEn || card.name || 'Unknown card';
  const language = card.lang || card.language || 'EN';
  const suggestedGrade = card.suggestedGrade || card.condition || 'Raw';
  const reasoning = result?.card?.reasoning || result?.reasoning || '';

  const opDetails = useQuery({
    queryKey: ['op-details', code, language],
    queryFn: async () => {
      const params = new URLSearchParams({ code, lang: language });
      const data = await getJson(`/op-details?${params.toString()}`);
      if (data?.ok === false) throw new Error(data.error || 'op-details failed');
      return data;
    },
    enabled: isOp && !!code,
    retry: false,
  });

  const hasOfficial = isOp && (!!opDetails.data?.details?.sampleImageUrl || !!opDetails.data?.details?.imageUrl);
  const extrasEnabled = isOp && opDetails.isSuccess && hasOfficial;

  const details = opDetails.data?.details || {};
  const setName = details.setName || card.set || card.setName || '—';
  const year = deriveYear(card, details);
  const type = details.type || card.type || '—';
  const color = details.color || card.color || '—';
  const cost = details.cost ?? card.cost;
  const power = details.power ?? card.power;
  const counter = details.counter ?? card.counter;
  const life = details.life ?? card.life;
  const attribute = details.attribute || card.attribute || '—';
  const effect = details.effect || card.effect || '';
  const releaseDate = details.releaseDate || '';

  const { data: prices, isLoading: pricesLoading } = usePrices(code, rarity, {
    enabled: isOp && !!code && !!rarity && rarity !== '—',
  });
  const { watermark, quality, pricingRaw } = useScanExtras(image, code, rarity, language, extrasEnabled, scoreQuality, currency);

  const variants = useQuery({
    queryKey: ['op-variants', code, language],
    queryFn: async () => {
      const data = await getJson(`/op-variants?code=${encodeURIComponent(code)}&lang=${encodeURIComponent(language)}`);
      if (data?.ok === false) throw new Error(data.error || 'variants failed');
      return data.variants || [];
    },
    enabled: isOp && !!code && !!language,
    retry: false,
  });

  useEffect(() => {
    if (variants.data?.length === 1 && !selectedRarity) {
      setSelectedRarity(variants.data[0].rarity);
    }
  }, [variants.data, selectedRarity]);

  const addVault = useAddVaultItem(user, getToken, {
    onSuccess: () => {
      onAdded?.();
    },
  });

  const handleAddToVault = () => {
    if (!user?.uid) return;
    addVault.mutate({
      item: {
        code,
        nameEn: name,
        name,
        rarity,
        setName,
        language,
        condition: suggestedGrade,
        image,
        paid: prices?.median || 0,
        current: prices?.median || 0,
        tcg: game,
        game,
        year,
        type,
        releaseDate,
        currency,
        source: 'scan',
      },
    });
  };

  const rawSampleUrl = opDetails.data?.details?.sampleImageUrl || opDetails.data?.details?.imageUrl;
  const sampleImageUrl = proxyImageUrl(rawSampleUrl);
  const officialName = opDetails.data?.details?.name || opDetails.data?.details?.officialName;
  const officialSet = opDetails.data?.details?.setName || opDetails.data?.details?.officialSetName;

  // If the official sample cannot be found, bounce out — no further lookups.
  if (isOp && opDetails.isSuccess && !hasOfficial) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-margin-mobile pb-24">
        <div className="glass-panel rounded-xl p-8 max-w-md w-full text-center flex flex-col items-center">
          <Icon name="search_off" size={48} className="text-error mb-4" />
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">Official sample not found</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            We couldn&apos;t locate an official reference for <strong className="text-primary-fixed-dim">{code}</strong>. No further lookups will be performed.
          </p>
          <button
            onClick={onBack}
            className="btn-primary font-label-caps text-label-caps uppercase px-8 py-4 rounded-xl flex items-center justify-center gap-2 w-full"
          >
            <Icon name="document_scanner" size={18} />
            Scan Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-y-scroll">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/80 dark:bg-background/80 backdrop-blur-md border-b border-white/5 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-7xl mx-auto h-full grid grid-cols-3 items-center">
          <button onClick={onBack} className="flex items-center justify-start text-primary-fixed-dim p-2 rounded-full hover:bg-white/5 w-max">
            <Icon name="arrow_back" size={20} />
          </button>
          <div className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg font-extrabold text-primary-fixed-dim tracking-tighter text-center flex items-center justify-center gap-2">
            SwibScan
            <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[10px] font-label-caps uppercase tracking-wider border border-secondary/30">
              demo
            </span>
          </div>
          <div />
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-grow px-margin-mobile md:px-margin-desktop py-6 md:py-10 pt-20 pb-40 md:pb-32 max-w-7xl mx-auto w-full">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Left column */}
          <div className="w-full md:w-5/12 flex flex-col gap-6 md:sticky md:top-28 md:self-start">
            {/* Scanned image */}
            <section className="relative animate-fade-up stagger-1">
              <div className="absolute -inset-6 bg-primary/10 rounded-[40%] blur-3xl z-0 animate-pulse-soft" />
              <div className="glass-panel rounded-xl md:rounded-2xl overflow-hidden aspect-[3/4] relative flex items-center justify-center p-4 md:p-6">
                <img src={image} alt={name} className="w-full h-full object-contain filter drop-shadow-2xl rounded-lg" />
              </div>
            </section>

            {/* Header Info */}
            <section className="flex flex-col gap-2 animate-fade-up stagger-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-1 bg-surface-container-high rounded-full font-label-caps text-label-caps text-on-surface-variant border border-white/5 uppercase">{rarity}</span>
                <span className="px-2 py-1 bg-surface-container-high rounded-full font-label-caps text-label-caps text-on-surface-variant border border-white/5 uppercase">{language}</span>
                {result?.identifiedBy && (
                  <span className="px-2 py-1 bg-surface-container-high rounded-full font-label-caps text-label-caps text-on-surface-variant border border-white/5 uppercase">
                    {result.identifiedBy.replace(/haiku/gi, 'AI').replace(/-/g, ' ')}
                  </span>
                )}
              </div>
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-secondary mt-1">{name}</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">Code: {code} &bull; Set: {setName}</p>
              {reasoning && (
                <div className="mt-2 p-3 rounded-xl bg-surface-container-low border border-white/5">
                  <p className="font-body-sm text-body-sm text-on-surface-variant italic leading-relaxed">{reasoning}</p>
                </div>
              )}
            </section>

            {/* Card Details */}
            <section className="flex flex-col gap-4 animate-fade-up stagger-3">
              <span className="font-label-caps text-label-caps text-secondary-container uppercase">Card Details</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <DetailItem label="Code" value={code} />
                <DetailItem label="Rarity" value={rarity} />
                <DetailItem label="Language" value={language} />
                <DetailItem label="Year" value={year} />
                <DetailItem label="Release" value={releaseDate} />
                <DetailItem label="Type" value={type} />
                <DetailItem label="Color" value={color} />
                <DetailItem label="Cost" value={cost} />
                <DetailItem label="Power" value={power} />
                <DetailItem label="Counter" value={counter} />
                <DetailItem label="Life" value={life} />
                <DetailItem label="Attribute" value={attribute} />
                <DetailItem label="Set" value={setName} />
              </div>
              {effect && (
                <div className="glass-panel rounded-lg p-4">
                  <span className="font-label-caps text-label-caps text-on-surface-variant block mb-2 uppercase">Effect</span>
                  <p className="font-body-md text-body-md text-on-surface whitespace-pre-wrap leading-relaxed">{effect}</p>
                </div>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="w-full md:w-7/12 flex flex-col gap-6">
            {isOp && (
              // Official Sample
              <section className="glass-panel rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col min-h-[320px] md:min-h-[480px] animate-fade-up stagger-2">
                <span className="font-label-caps text-label-caps text-secondary-container uppercase mb-3">Official Sample</span>
                {sampleImageUrl ? (
                  <div className="relative w-full flex-1 min-h-0">
                    <img
                      src={sampleImageUrl}
                      alt={officialName || name}
                      className="absolute inset-0 w-full h-full object-contain rounded-lg"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-md">
                    {opDetails.isLoading ? 'Loading sample…' : 'No official sample available'}
                  </div>
                )}
                {(officialName || officialSet) && (
                  <div className="mt-3 font-body-sm text-on-surface-variant">
                    {officialName && <div className="text-on-surface font-medium">{officialName}</div>}
                    {officialSet && <div>Set: {officialSet}</div>}
                  </div>
                )}
              </section>
            )}

            {/* Variant picker */}
            {isOp && variants.data && variants.data.length > 1 && (
              <section className="glass-panel rounded-xl p-4 flex flex-col gap-4 animate-fade-up stagger-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-label-caps text-secondary-container uppercase">Select Matching Variant</span>
                  <span className="font-label-caps text-label-caps text-on-surface-variant">{variants.data.length} found</span>
                </div>
                <p className="font-body-sm text-on-surface-variant">
                  This code has multiple printings. Tap the one that matches your physical card — your selection locks the rarity used for pricing.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {variants.data.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedRarity(v.rarity)}
                      className={`flex flex-col items-center gap-2 p-2 rounded-xl border transition-colors ${
                        selectedRarity === v.rarity
                          ? 'border-primary-fixed-dim bg-primary-fixed-dim/10'
                          : 'border-white/10 bg-surface-container-low hover:bg-surface-container-high'
                      }`}
                    >
                      <img
                        src={proxyImageUrl(v.imageUrl)}
                        alt={v.rarity || 'variant'}
                        className="w-full aspect-[63/88] object-contain rounded-lg"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span className="font-label-caps text-label-caps text-on-surface uppercase">{v.rarity || '—'}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Score quality trigger */}
            {isOp && !quality.data?.quality && !quality.isLoading && extrasEnabled && (
              <button
                onClick={() => setScoreQuality(true)}
                className="w-full py-4 rounded-xl btn-secondary font-label-caps text-label-caps uppercase tracking-widest flex items-center justify-center gap-2 animate-fade-up stagger-3"
              >
                <Icon name="verified" size={20} />
                Score quality
              </button>
            )}

            {/* Quality */}
            {isOp && quality.data?.quality && (
              <section className="glass-panel rounded-xl p-4 flex flex-col gap-4 animate-fade-up stagger-3">
                <span className="font-label-caps text-label-caps text-secondary-container uppercase">Quality Grade</span>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-headline-md text-headline-md text-secondary font-extrabold">
                      <AnimatedNumber value={quality.data.quality.grade} decimals={1} />
                    </div>
                    {quality.data.quality.estimatedTier && (
                      <div className="font-body-md text-on-surface-variant">{quality.data.quality.estimatedTier}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-label-caps text-label-caps text-on-surface-variant">
                    {quality.data.quality.subscores && Object.entries(quality.data.quality.subscores).map(([k, v]) => (
                      <div key={k} className="capitalize">{k}: <span className="text-on-surface">{v}</span></div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Corner crops */}
            {isOp && watermark.data?.corners && (
              <section className="glass-panel rounded-xl p-4 flex flex-col gap-4 animate-fade-up stagger-4">
                <span className="font-label-caps text-label-caps text-secondary-container uppercase">Card Crops &middot; Auto-Exposed</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {CORNER_KEYS.map(([key, label]) => {
                    const src = watermark.data.corners[key];
                    if (!src) return null;
                    return (
                      <div key={key} className="flex flex-col gap-2">
                        <img src={src} alt={label} className="w-full rounded-lg border border-white/10" />
                        <span className="font-label-caps text-[10px] text-on-surface-variant text-center uppercase tracking-wider">{label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="font-body-sm text-on-surface-variant italic">
                  Watermark is applied when you save this card to your vault.
                </p>
              </section>
            )}

            {/* Market valuation */}
            {isOp && <section className="glass-panel rounded-xl p-4 flex flex-col gap-4 animate-fade-up stagger-5">
              <span className="font-label-caps text-label-caps text-primary-fixed-dim uppercase border-b border-white/10 pb-2">
                Market Valuation
              </span>
              {pricesLoading ? (
                <div className="flex items-center justify-center gap-3 py-8 rounded-lg border border-white/5 bg-surface-container-lowest">
                  <Icon name="sync" size={20} className="text-primary-fixed-dim animate-spin" />
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Loading market data…</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mt-2">
                  {['low', 'median', 'high'].map((key) => {
                    const value = prices?.[key];
                    const active = key === 'median';
                    return (
                      <div
                        key={key}
                        className={`flex flex-col items-center p-4 rounded-lg border transition-colors ${
                          active
                            ? 'bg-surface-container-lowest border-primary-fixed-dim/30 shadow-[0_0_20px_rgba(255,178,191,0.08)] relative overflow-hidden'
                            : 'bg-surface-container-lowest border-white/5'
                        }`}
                      >
                        {active && <div className="absolute inset-0 bg-primary-fixed-dim/5" />}
                        <span className={`font-label-caps text-label-caps mb-1 relative z-10 uppercase ${active ? 'text-primary-fixed-dim' : 'text-on-surface-variant'}`}>
                          {key}
                        </span>
                        <span className={`font-headline-md text-headline-md relative z-10 ${active ? 'text-primary-fixed-dim font-extrabold' : 'text-on-surface'}`}>
                          <AnimatedCurrency value={value} currency={currency} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>}

            {/* Full pricing sources */}
            {isOp && (
              <section className="glass-panel rounded-xl p-4 flex flex-col gap-4 animate-fade-up stagger-5">
                <PricingSection pricing={pricingRaw.data} currency={currency} />
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 w-full z-40 bg-gradient-to-t from-background via-background/90 to-transparent p-margin-mobile pt-10 flex gap-6 justify-center items-center pb-8 md:static md:mt-8 md:mb-12 md:w-full md:max-w-none md:bg-transparent md:backdrop-blur-none md:border-0 md:shadow-none md:p-0 md:pt-0 md:pb-0">
        <div className="w-full max-w-7xl mx-auto flex flex-col md:flex-row gap-4 md:justify-end">
          <button
            onClick={onBack}
            disabled={addVault.isPending}
            className="btn-secondary font-label-caps text-label-caps uppercase px-6 py-4 rounded-xl flex items-center justify-center gap-2 w-full md:w-auto"
          >
            <Icon name="document_scanner" size={18} />
            Scan Again
          </button>
          <button
            onClick={handleAddToVault}
            disabled={!user?.uid || addVault.isPending || pricesLoading}
            className="btn-primary font-label-caps text-label-caps uppercase px-8 py-4 rounded-xl flex items-center justify-center gap-2 w-full md:w-auto disabled:opacity-60"
          >
            <Icon name="inventory_2" size={18} />
            {addVault.isPending ? 'Adding…' : pricesLoading ? 'Loading prices…' : 'Add to Vault'}
          </button>
        </div>
      </div>

      {!user?.uid && (
        <div className="fixed bottom-28 left-0 right-0 text-center text-body-sm text-on-surface-variant z-40 px-4 md:static md:mt-4 md:mb-12 md:text-center md:px-0">
          Sign in to save cards to your Vault.
        </div>
      )}

      {addVault.error && (
        <div className="fixed bottom-28 left-4 right-4 z-50 p-3 rounded-xl bg-error-container/20 border border-error-container/40 text-error text-body-sm text-center md:static md:mt-4 md:mb-12 md:mx-0">
          {addVault.error.message}
        </div>
      )}
    </div>
  );
}
