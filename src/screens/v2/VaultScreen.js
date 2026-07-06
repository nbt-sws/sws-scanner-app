import React, { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';

import { useVault } from '../../hooks/useVault';

const FILTERS = ['All Assets', 'Pokémon', 'One Piece', 'Yu-Gi-Oh!', 'Graded', 'Raw'];

function fmtMoney(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function computeTotals(items) {
  let vaultValue = 0;
  let costBasis = 0;
  let realized = 0;
  let soldCount = 0;
  for (const it of items) {
    if (it.sold) {
      realized += (it.soldPrice || it.current || 0) - (it.paid || 0);
      soldCount += 1;
    } else {
      vaultValue += it.current || 0;
      costBasis += it.paid || 0;
    }
  }
  return {
    vaultValue,
    unrealized: vaultValue - costBasis,
    realized,
    itemCount: items.filter((i) => !i.sold).length,
    soldCount,
  };
}

function StatTile({ label, value, tone = 'muted' }) {
  const toneClasses = {
    muted: 'text-on-surface',
    up: 'text-secondary-fixed',
    down: 'text-error',
    accent: 'text-primary-fixed-dim',
  };
  return (
    <div className="glass-card rounded-xl p-3 flex flex-col">
      <h3 className="font-label-caps text-[11px] text-on-surface-variant mb-1 uppercase tracking-widest">
        {label}
      </h3>
      <div className={`font-headline-md text-headline-md ${toneClasses[tone]}`}>
        {value}
      </div>
    </div>
  );
}

export default function VaultScreen({ user, getToken, currency = 'USD', onTabChange, onRescan }) {
  const { items, loading } = useVault(user, getToken);
  const [filter, setFilter] = useState('All Assets');
  const [selectedItem, setSelectedItem] = useState(null);

  const filtered = useMemo(() => {
    if (filter === 'All Assets') return items;
    return items.filter((it) => {
      const tcg = String(it.tcg || it.game || '').toLowerCase();
      const cond = String(it.condition || '').toLowerCase();
      switch (filter) {
        case 'Pokémon':
          return tcg.includes('pokemon') || tcg.includes('pkm');
        case 'One Piece':
          return tcg.includes('op') || tcg.includes('one piece');
        case 'Yu-Gi-Oh!':
          return tcg.includes('ygo') || tcg.includes('yu');
        case 'Graded':
          return cond !== '' && cond !== 'raw';
        case 'Raw':
          return cond === '' || cond === 'raw';
        default:
          return true;
      }
    });
  }, [items, filter]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  if (loading) {
    return (
      <div className="min-h-full flex flex-col font-body-md">
        <main className="flex-1 flex items-center justify-center px-margin-mobile md:px-margin-desktop pt-gutter pb-6">
          <Icon name="progress_activity" size={32} className="animate-spin text-primary-fixed-dim" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col font-body-md">
      <main className="flex-1 min-h-full max-w-7xl mx-auto w-full px-margin-mobile md:px-margin-desktop pb-6">
        {/* Hero Section: Vault Value */}
        <section className="glass-card rounded-xl md:rounded-2xl p-4 md:p-6 mb-4 relative overflow-hidden text-center md:text-left">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed-dim/10 to-transparent pointer-events-none" />
          <h2 className="relative z-10 font-label-caps text-label-caps text-secondary-fixed mb-1 uppercase tracking-widest">
            Total Vault Value
          </h2>
          <div className="relative z-10 font-headline-lg text-headline-lg md:text-headline-xl text-primary-fixed-dim font-extrabold tracking-tighter">
            {fmtMoney(totals.vaultValue, currency)}
          </div>
        </section>

        {/* P/L Tiles */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatTile label="Unrealized P/L" value={fmtMoney(totals.unrealized, currency)} tone={totals.unrealized >= 0 ? 'up' : 'down'} />
          <StatTile label="Realized P/L" value={fmtMoney(totals.realized, currency)} tone={totals.realized >= 0 ? 'up' : 'muted'} />
          <StatTile label="Items" value={totals.itemCount} tone="accent" />
          <StatTile label="Sold" value={totals.soldCount} tone="muted" />
        </section>

        {/* Mobile Filters */}
        <section className="mb-4 md:hidden">
          <div className="flex overflow-x-auto hide-scrollbar gap-base-unit pb-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full font-label-caps text-label-caps uppercase tracking-widest whitespace-nowrap transition-colors ${
                  filter === f
                    ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim border border-primary-fixed-dim/30'
                    : 'bg-surface-container text-on-surface-variant border border-white/5 hover:bg-surface-variant/50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        <div className="md:grid md:grid-cols-12 md:gap-6">
          {/* Desktop Sidebar */}
          <aside className="hidden md:flex md:col-span-3 flex-col gap-6">
            <div className="glass-card rounded-2xl p-3 flex flex-col gap-2 sticky top-6">
              <h3 className="font-label-caps text-[11px] text-secondary uppercase tracking-widest mb-1">Filters</h3>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl font-body-md text-body-md transition-colors ${
                    filter === f
                      ? 'bg-primary-fixed-dim/20 text-primary-fixed-dim border border-primary-fixed-dim/30'
                      : 'text-on-surface-variant hover:bg-white/5'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-secondary-fixed/5 to-transparent pointer-events-none" />
              <h3 className="font-label-caps text-[11px] text-secondary uppercase tracking-widest mb-2 relative z-10">Vault Summary</h3>
              <div className="space-y-3 relative z-10">
                <div className="flex justify-between items-center">
                  <span className="font-body-sm text-on-surface-variant">Total items</span>
                  <span className="font-body-md text-on-surface">{items.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-body-sm text-on-surface-variant">Filtered</span>
                  <span className="font-body-md text-on-surface">{filtered.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-body-sm text-on-surface-variant">Currency</span>
                  <span className="font-label-caps text-primary-fixed-dim">{currency}</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Card List Grid */}
          <section className="md:col-span-9">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center text-on-surface-variant py-16">
                <Icon name="inventory_2" size={48} className="mb-3 opacity-40" />
                <div className="font-headline-lg text-headline-lg text-on-surface mb-1">Vault is empty</div>
                <div className="font-body-sm text-body-sm">Scan your first card to get started.</div>
              </div>
            ) : (
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((item) => (
                  <div key={item.id} onClick={() => setSelectedItem(item)} className="glass-card rounded-xl overflow-hidden group cursor-pointer hover:-translate-y-1 transition-transform duration-200">
                    <div className="h-32 md:h-36 w-full relative bg-surface-container-high">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.nameEn || item.code}
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                          <Icon name="image" size={32} />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-label-caps text-secondary-fixed border border-secondary-fixed/30 uppercase tracking-widest">
                        {item.condition || 'Raw'}
                      </div>
                    </div>
                    <div className="p-2.5 border-t border-white/5">
                      <h4 className="font-body-md text-sm text-on-surface truncate">
                        {item.nameEn || item.code}
                      </h4>
                      <div className="font-label-caps text-sm text-primary-fixed-dim mt-0.5">
                        {fmtMoney(item.current, currency)}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </section>
        </div>
      </main>

      {/* Card detail drawer */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-md p-0 md:p-4 md:justify-end flex"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full md:w-[460px] md:max-w-full h-full md:rounded-2xl bg-surface-container border-r md:border border-white/10 p-4 md:p-5 flex flex-col gap-4 shadow-2xl animate-fade-up overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedItem(null)}
              className="self-start p-2 rounded-full hover:bg-white/5 text-on-surface-variant"
              aria-label="Close"
            >
              <Icon name="close" size={24} />
            </button>

            <div className="glass-panel rounded-xl overflow-hidden aspect-[63/88] max-w-[260px] mx-auto w-full p-3">
              {selectedItem.image ? (
                <img
                  src={selectedItem.image}
                  alt={selectedItem.nameEn || selectedItem.code}
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                  <Icon name="image" size={48} />
                </div>
              )}
            </div>

            <div className="text-center">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface">
                {selectedItem.nameEn || selectedItem.code}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                {selectedItem.code} &bull; {selectedItem.rarity || '—'} &bull; {selectedItem.condition || 'Raw'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel rounded-lg p-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-1 uppercase">Paid</span>
                <span className="font-headline-md text-headline-md text-on-surface">{fmtMoney(selectedItem.paid, currency)}</span>
              </div>
              <div className="glass-panel rounded-lg p-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-1 uppercase">Current</span>
                <span className="font-headline-md text-headline-md text-primary-fixed-dim font-extrabold">{fmtMoney(selectedItem.current, currency)}</span>
              </div>
            </div>

            {selectedItem.language && (
              <div className="glass-panel rounded-lg p-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-1 uppercase">Language</span>
                <span className="font-body-md text-body-md text-on-surface">{selectedItem.language}</span>
              </div>
            )}

            <div className="mt-auto pt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  const item = selectedItem;
                  setSelectedItem(null);
                  onRescan?.(item);
                }}
                disabled={!selectedItem?.image}
                className="w-full py-3 rounded-xl btn-secondary font-label-caps text-label-caps uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name="open_in_new" size={18} />
                Open in SwibScan
              </button>
              <p className="text-center text-body-sm text-on-surface-variant">
                {selectedItem?.image ? 'Open this card in the scanner' : 'No scan image available for this card'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
