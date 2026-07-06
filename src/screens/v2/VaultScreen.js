import React, { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Card, CardContent } from '../../components/ui/Card';
import { Chip } from '../../components/ui/Chip';
import { useVault } from '../../hooks/useVault';

const CATEGORIES = ['All Assets', 'Pokémon', 'One Piece', 'Yu-Gi-Oh!'];

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

export default function VaultScreen({ user, getToken }) {
  const { items, loading } = useVault(user, getToken);
  const [category, setCategory] = useState('All Assets');

  const filtered = useMemo(() => {
    if (category === 'All Assets') return items;
    return items.filter((it) => {
      const tcg = String(it.tcg || it.game || '').toLowerCase();
      if (category === 'Pokémon') return tcg.includes('pokemon') || tcg.includes('pkm');
      if (category === 'One Piece') return tcg.includes('op') || tcg.includes('one piece');
      if (category === 'Yu-Gi-Oh!') return tcg.includes('ygo') || tcg.includes('yu');
      return true;
    });
  }, [items, category]);

  const totals = useMemo(() => computeTotals(filtered), [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-full pt-24">
        <Icon name="progress_activity" size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 pt-16 pb-24 max-w-md mx-auto">
      <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-2">
        SWIBSVAULT
      </div>

      {/* Value hero */}
      <div className="relative p-5 rounded-3xl bg-gradient-to-br from-primary to-midnight-rose text-on-primary mb-4 overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20">
          <Icon name="account_balance_wallet" size={64} />
        </div>
        <div className="relative z-10">
          <div className="font-mono text-label-caps tracking-widest opacity-80 mb-1">
            TOTAL VAULT VALUE
          </div>
          <div className="font-display text-headline-xl">{fmtMoney(totals.vaultValue)}</div>
          <div className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-white/20 font-mono text-label-caps">
            <Icon name="trending_up" size={14} />
            +4.2% (24h)
          </div>
        </div>
      </div>

      {/* P/L tiles */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30">
          <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-2">
            UNREALIZED P/L
          </div>
          <div className="font-display text-headline-lg-mobile text-on-surface">
            {fmtMoney(totals.unrealized)}
          </div>
          <svg viewBox="0 0 100 24" className="w-full h-8 mt-2 text-primary" preserveAspectRatio="none">
            <path
              d="M0,20 Q20,18 30,12 T60,14 T100,4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/30">
          <div className="font-mono text-label-caps text-on-surface-variant tracking-widest mb-2">
            REALIZED P/L
          </div>
          <div className="font-display text-headline-lg-mobile text-on-surface">
            {fmtMoney(totals.realized)}
          </div>
          <svg viewBox="0 0 100 24" className="w-full h-8 mt-2 text-secondary" preserveAspectRatio="none">
            <path
              d="M0,18 Q25,16 40,20 T70,10 T100,12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
        {CATEGORIES.map((cat) => (
          <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
            {cat}
          </Chip>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-on-surface-variant py-12">
          <Icon name="inventory_2" size={48} className="mb-3 opacity-40" />
          <div className="font-display text-headline-lg-mobile text-on-surface mb-1">
            Vault is empty
          </div>
          <div className="text-body-sm">Scan your first card to get started.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => (
            <Card key={item.id} className="group">
              <div className="relative aspect-square bg-surface-dim">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.nameEn || item.code}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                    <Icon name="image" size={32} />
                  </div>
                )}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-surface-container/90 border border-outline-variant/40 font-mono text-[10px] text-on-surface">
                  {item.condition || 'Raw'}
                </div>
              </div>
              <CardContent className="p-3">
                <div className="font-display text-body-sm text-on-surface truncate mb-0.5">
                  {item.nameEn || item.code}
                </div>
                <div className="font-mono text-[10px] text-on-surface-variant truncate mb-2">
                  {item.code}
                </div>
                <div className="font-display text-body-md text-primary">
                  {fmtMoney(item.current)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
