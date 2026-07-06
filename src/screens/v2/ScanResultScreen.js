import React, { useState, useMemo } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { usePrices } from '../../hooks/usePrices';
import { useAddVaultItem } from '../../hooks/useVaultMutations';

function fmtCurrency(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ScanResultScreen({ user, image, result, onBack, onAdded }) {
  const card = result?.cards?.[0] || result || {};
  const code = card.code || 'UNKNOWN';
  const rarity = card.rarity || '—';
  const name = card.name || card.nameEn || 'Unknown card';
  const setName = card.set || card.setName || 'Unknown set';
  const language = card.language || card.lang || 'EN';
  const year = card.year || new Date().getFullYear();
  const suggestedGrade = card.suggestedGrade || card.condition || 'Raw';

  const [selectedVariant, setSelectedVariant] = useState(0);
  const [saved, setSaved] = useState(false);

  const variants = useMemo(() => {
    if (result?.variants?.length) return result.variants;
    return [
      { name: card.variantName || name, language, code, confidence: 98 },
      ...(result?.alternatives || []),
    ];
  }, [result, card, name, language]);

  const { data: prices, isLoading: pricesLoading } = usePrices(code, rarity);

  const addVault = useAddVaultItem({
    onSuccess: () => {
      setSaved(true);
      onAdded?.();
    },
  });

  const handleAddToVault = () => {
    if (!user?.uid) return;
    const variant = variants[selectedVariant] || {};
    addVault.mutate({
      uid: user.uid,
      item: {
        code,
        nameEn: name,
        rarity,
        setName,
        language: variant.language || language,
        condition: suggestedGrade,
        image,
        paid: prices?.median || 0,
        current: prices?.median || 0,
        source: 'scan',
      },
    });
  };

  return (
    <div className="flex flex-col min-h-full px-4 pt-16 pb-24 max-w-md mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high"
        >
          <Icon name="arrow_back" size={20} />
        </button>
        <span className="font-display text-headline-lg-mobile text-primary">SwibScan</span>
        <button className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
          <Icon name="more_vert" size={20} />
        </button>
      </div>

      {/* Card image */}
      <div className="relative aspect-[4/3] w-full rounded-3xl bg-surface-container-low border border-outline-variant/30 overflow-hidden mb-5">
        <img src={image} alt={name} className="w-full h-full object-contain" />
      </div>

      {/* Grade */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container border border-outline-variant/30 mb-4">
        <div>
          <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-1">
            AI SUGGESTED GRADE
          </div>
          <div className="font-display text-headline-lg text-on-surface">{suggestedGrade}</div>
        </div>
        <div className="w-14 h-14 rounded-full border-2 border-outline-variant flex items-center justify-center">
          <span className="font-mono text-body-md text-on-surface-variant">
            {String(suggestedGrade).replace(/[^0-9.]/g, '') || '—'}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Chip active>{rarity}</Chip>
        <Chip>{language}</Chip>
      </div>
      <h2 className="font-display text-headline-lg-mobile text-on-surface mb-1">{name}</h2>
      <div className="text-body-sm text-on-surface-variant mb-5">
        Code: {code} • Set: {setName}
      </div>

      {/* Market valuation */}
      <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 mb-5">
        <div className="font-mono text-label-caps text-primary tracking-widest mb-3">
          MARKET VALUATION
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {['low', 'median', 'high'].map((key) => {
            const value = prices?.[key];
            const active = key === 'median';
            return (
              <div
                key={key}
                className={`rounded-xl p-3 text-center border ${
                  active
                    ? 'bg-surface-container-high border-primary/40'
                    : 'bg-surface-dim border-outline-variant/30'
                }`}
              >
                <div className="font-mono text-[10px] uppercase text-on-surface-variant mb-1">{key}</div>
                <div className={`font-display text-body-md ${active ? 'text-primary' : 'text-on-surface'}`}>
                  {pricesLoading ? '…' : fmtCurrency(value)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-body-sm text-on-surface-variant">
          Sources: eBay, TCGPlayer
          {prices?.change30d != null && (
            <span className="ml-2 text-primary">↗ {prices.change30d}% (30d)</span>
          )}
        </div>
      </div>

      {/* Variants */}
      <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-label-caps text-on-surface-variant tracking-widest">
            DETECTED VARIANTS
          </span>
          <span className="font-mono text-label-caps text-on-surface-variant tracking-widest">
            MATCH CONFIDENCE
          </span>
        </div>
        <div className="space-y-3">
          {variants.map((variant, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedVariant(idx)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                selectedVariant === idx
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-surface-dim border-outline-variant/30 hover:bg-surface-container-high'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border ${
                  selectedVariant === idx ? 'bg-primary border-primary' : 'border-outline-variant'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-body-sm text-on-surface truncate">{variant.name || name}</div>
                <div className="font-mono text-label-caps text-on-surface-variant">
                  {variant.code || code} {variant.language || language}
                </div>
              </div>
              <div className="w-20 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${variant.confidence || 0}%` }}
                />
              </div>
              <span className="font-mono text-body-sm text-on-surface-variant w-10 text-right">
                {variant.confidence || 0}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/30">
          <div className="font-mono text-label-caps text-on-surface-variant mb-1">LANGUAGE</div>
          <div className="text-body-md text-on-surface">{language}</div>
        </div>
        <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/30">
          <div className="font-mono text-label-caps text-on-surface-variant mb-1">YEAR</div>
          <div className="text-body-md text-on-surface">{year}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3">
        <Button
          variant="surface"
          size="lg"
          className="gap-2"
          onClick={onBack}
          disabled={addVault.isPending}
        >
          <Icon name="qr_code_scanner" size={20} />
          Scan Again
        </Button>
        <Button
          size="lg"
          className="gap-2"
          onClick={handleAddToVault}
          disabled={!user?.uid || addVault.isPending || saved}
        >
          <Icon name="inventory_2" size={20} />
          {saved ? 'Added to Vault' : addVault.isPending ? 'Adding…' : 'Add to Vault'}
        </Button>
      </div>

      {!user?.uid && (
        <div className="mt-3 text-center text-body-sm text-on-surface-variant">
          Sign in to save cards to your Vault.
        </div>
      )}

      {addVault.error && (
        <div className="mt-3 p-3 rounded-xl bg-error-container text-on-error-container text-body-sm text-center">
          {addVault.error.message}
        </div>
      )}
    </div>
  );
}
