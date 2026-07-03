// src/screens/Market.js
// SwibSwap Market — graphs internal purchase + sale prices recorded by app
// users via /api/transactions. Distinct from the eBay/Mercari pricing card on
// the Scanner: this graph is owned by us and will power SwibSwap.com later.
//
// Lets the user search a code+rarity to view its in-app transaction history.

import React, { useEffect, useState } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../theme';
import { Pill, Spinner, ErrorBanner } from '../components';

export default function Market({ user, currency, fx }) {
  const [code, setCode] = useState('');
  const [rarity, setRarity] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const inputStyle = {
    width: '100%', background: T.surface2, color: T.textHi,
    border: `1px solid ${T.border2}`, borderRadius: 10,
    padding: '12px 14px', fontSize: SZ.md, marginBottom: 10,
    outline: 'none', boxSizing: 'border-box', fontFamily: T.fontMono,
  };

  const run = async () => {
    if (!code || !rarity) { setError('Both Code and Rarity are required'); return; }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/transactions?code=${encodeURIComponent(code)}&rarity=${encodeURIComponent(rarity)}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px 16px 100px', maxWidth: 540, margin: '0 auto' }}>
      <h2 style={{
        fontSize: SZ.xl, fontWeight: 700, margin: '8px 0 22px',
        fontFamily: T.fontDisplay, letterSpacing: '0.06em',
      }}>SWIBSWAP MARKET</h2>

      <div style={{ fontSize: SZ.sm, color: T.textMid, marginBottom: 14, lineHeight: 1.5 }}>
        In-app purchase and sale prices. Aggregated across all SwibSwap users —
        this is the data that will power swibswap.com&apos;s marketplace later.
      </div>

      <ErrorBanner message={error} />

      <FieldLabel>CARD CODE</FieldLabel>
      <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="OP07-051" />

      <FieldLabel>RARITY</FieldLabel>
      <input style={inputStyle} value={rarity} onChange={(e) => setRarity(e.target.value)} placeholder="MR" />

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={run}
          disabled={loading || !code || !rarity}
          style={{
            width: '100%', padding: '14px 18px',
            background: T.gradientPrimary, color: T.bgDeep,
            border: 'none', borderRadius: 14,
            fontSize: SZ.md, fontWeight: 600,
            letterSpacing: '0.09em', textTransform: 'uppercase',
            fontFamily: T.fontDisplay,
            cursor: (loading || !code || !rarity) ? 'not-allowed' : 'pointer',
            opacity: (loading || !code || !rarity) ? 0.45 : 1,
          }}
        >
          {loading ? <Spinner size={16} color={T.bgDeep} /> : 'Look up'}
        </button>
      </div>

      {data && <MarketResult data={data} currency={currency} fx={fx} />}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.08em',
      marginBottom: 6, fontFamily: T.fontDisplay, fontWeight: 600,
    }}>{children}</div>
  );
}

function MarketResult({ data, currency, fx }) {
  const s = data.summary || {};
  const items = data.items || [];
  const toUserCurr = (thb) => {
    const rate = (fx && fx[currency]) || 1;
    const c = CURRENCIES[currency] || CURRENCIES.THB;
    return `${c.symbol}${Math.round(thb * rate).toLocaleString(c.locale)}`;
  };
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 16, padding: 18, marginTop: 18,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, letterSpacing: '0.08em', fontSize: SZ.sm, color: T.textLow }}>
          90-DAY ACTIVITY
        </div>
        <Pill tag={`${items.length} events`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ background: T.surface2, padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.06em' }}>
            SALES ({s.saleCount || 0})
          </div>
          <div style={{ fontSize: SZ.lg, color: T.cyan, fontFamily: T.fontMono, fontWeight: 700, marginTop: 4 }}>
            {toUserCurr(s.saleMedianTHB || 0)}
          </div>
          <div style={{ fontSize: SZ.xs, color: T.textDim }}>median sale</div>
        </div>
        <div style={{ background: T.surface2, padding: 12, borderRadius: 10 }}>
          <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.06em' }}>
            PURCHASES ({s.purchaseCount || 0})
          </div>
          <div style={{ fontSize: SZ.lg, color: T.magenta, fontFamily: T.fontMono, fontWeight: 700, marginTop: 4 }}>
            {toUserCurr(s.purchaseMedianTHB || 0)}
          </div>
          <div style={{ fontSize: SZ.xs, color: T.textDim }}>median purchase</div>
        </div>
      </div>

      {items.length > 1 && <TxSparkline items={items} currency={currency} fx={fx} />}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
          RECENT
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: SZ.sm, color: T.textMid }}>No SwibSwap transactions for this card yet.</div>
        ) : (
          items.slice(0, 12).map((it) => (
            <div key={it.id} style={{
              display: 'grid', gridTemplateColumns: '90px 90px 1fr', gap: 8,
              padding: '10px 0', borderBottom: `1px solid ${T.border}`,
              fontSize: SZ.sm, fontFamily: T.fontMono,
            }}>
              <div style={{ color: T.textDim }}>{it.at ? new Date(it.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–'}</div>
              <div style={{ color: it.kind === 'sale' ? T.cyan : T.magenta, fontWeight: 600 }}>
                {it.kind.toUpperCase()}
              </div>
              <div style={{ color: T.textHi, fontWeight: 600, textAlign: 'right' }}>
                {toUserCurr(it.amountTHB || 0)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TxSparkline({ items, currency, fx }) {
  const sorted = [...items].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  if (sorted.length < 2) return null;
  const W = 480, H = 80, pad = 6;
  const rate = (fx && fx[currency]) || 1;
  const ys = sorted.map((i) => (i.amountTHB || 0) * rate);
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  const range = max - min || 1;
  const xs = sorted.map((_, i) => pad + (i / (sorted.length - 1)) * (W - pad * 2));
  const pts = sorted.map((it, i) => `${xs[i].toFixed(1)},${(H - pad - ((ys[i] - min) / range) * (H - pad * 2)).toFixed(1)}`);
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="txFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.magenta} stopOpacity="0.4" />
          <stop offset="100%" stopColor={T.magenta} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`${pad},${H - pad} ${pts.join(' ')} ${W - pad},${H - pad}`}
        fill="url(#txFill)" stroke="none"
      />
      <polyline points={pts.join(' ')} fill="none" stroke={T.magenta} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* dots — purchases magenta, sales cyan */}
      {sorted.map((it, i) => (
        <circle
          key={it.id || i}
          cx={xs[i]}
          cy={H - pad - ((ys[i] - min) / range) * (H - pad * 2)}
          r="3"
          fill={it.kind === 'sale' ? T.cyan : T.magenta}
        />
      ))}
    </svg>
  );
}
