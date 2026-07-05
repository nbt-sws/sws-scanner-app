// src/screens/Vault.js — v13.7
// SwibsVault dashboard:
//   - Big VAULT VALUE hero (unsold items, current 30-day median × FX)
//   - Realized P/L and Unrealized P/L as separate tiles
//   - Profitability sparkline (paid → vault-value drift over the months users acquired their cards)
//   - Folder system: items grouped by user-defined folder name (default "All")
//   - Add / move / delete items, mark sold, edit purchase price + date.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../api';
import { T, SZ, fmtMoney } from '../theme';
import { Pill, Spinner, Button } from '../components';
import { useVault, deleteVaultItem, markSold, updateVaultItem, logSale } from '../vault';
import { previewFees } from '../lib/api/fees';
import { useSubscription } from '../hooks/useSubscription';
import { TIER_LABELS } from '../lib/tiers';

export default function Vault({ user, currency, fx, getIdToken }) {
  const { items, loading, error } = useVault(user?.uid);
  const { tier } = useSubscription(user?.uid);
  const [folder, setFolder] = useState('All');
  const [filter, setFilter] = useState('all'); // all | sold | onhold
  // SCN18: grade filter chip — All | Raw | Graded | <specific grade>.
  // "Graded" matches any non-Raw condition; specific grades match exactly.
  const [gradeFilter, setGradeFilter] = useState('All');

  // Folders are stored per-item as the `folder` field; default to "All".
  const folders = useMemo(() => {
    const set = new Set(['All']);
    for (const it of items) if (it.folder) set.add(it.folder);
    return Array.from(set);
  }, [items]);

  // SCN18: available grade chips — always show Raw + Graded, plus any
  // specific grade that exists on at least one card in the vault.
  const gradeChips = useMemo(() => {
    const base = ['All', 'Raw', 'Graded'];
    const specific = new Set();
    for (const it of items) {
      const c = it.condition;
      if (c && c !== 'Raw') specific.add(c);
    }
    return [...base, ...Array.from(specific).sort()];
  }, [items]);

  const folderItems = useMemo(() => {
    if (folder === 'All') return items;
    return items.filter((it) => (it.folder || 'All') === folder);
  }, [items, folder]);

  const gradeFilteredItems = useMemo(() => {
    if (gradeFilter === 'All') return folderItems;
    if (gradeFilter === 'Raw') {
      return folderItems.filter((it) => !it.condition || it.condition === 'Raw');
    }
    if (gradeFilter === 'Graded') {
      return folderItems.filter((it) => it.condition && it.condition !== 'Raw');
    }
    return folderItems.filter((it) => it.condition === gradeFilter);
  }, [folderItems, gradeFilter]);

  const filtered = useMemo(() => {
    if (filter === 'all') return gradeFilteredItems;
    if (filter === 'sold') return gradeFilteredItems.filter((it) => it.sold);
    return gradeFilteredItems.filter((it) => !it.sold);
  }, [gradeFilteredItems, filter]);

  const totals = useMemo(() => computeTotals(folderItems), [folderItems]);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>;
  }

  return (
    <div style={{ padding: '20px 16px 100px', maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{
        fontSize: SZ.xl, fontWeight: 700, margin: '8px 0 22px',
        fontFamily: T.fontDisplay, letterSpacing: '0.06em',
      }}>SWIBSVAULT</h2>

      {error && (
        <div style={{ color: T.redLight, fontSize: SZ.sm, marginBottom: 12 }}>{error.message}</div>
      )}

      {/* Big Vault Value hero */}
      <div style={{
        background: T.gradientPrimary, borderRadius: 16, padding: '20px 18px',
        color: T.bgDeep, marginBottom: 14,
      }}>
        <div style={{ fontSize: SZ.xs, fontWeight: 700, letterSpacing: '0.12em', opacity: 0.7, fontFamily: T.fontDisplay }}>
          VAULT VALUE
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4, fontFamily: T.fontDisplay, lineHeight: 1.1 }}>
          {fmtMoney(totals.vaultValue, currency, fx)}
        </div>
        <div style={{ fontSize: SZ.sm, opacity: 0.75, marginTop: 2, fontFamily: T.fontMono }}>
          {folder !== 'All' ? `${folder} folder · ` : ''}{totals.itemCount} held · {totals.soldCount} sold
        </div>
      </div>

      {/* Realized + Unrealized P/L tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <PnLTile
          label="UNREALIZED P/L"
          value={totals.unrealized}
          currency={currency}
          fx={fx}
        />
        <PnLTile
          label="REALIZED P/L"
          value={totals.realized}
          currency={currency}
          fx={fx}
        />
      </div>

      {/* Sparkline of paid → current trajectory */}
      {folderItems.length > 1 && (
        <ProfitabilitySpark items={folderItems} currency={currency} fx={fx} />
      )}

      {/* Folder picker */}
      <FolderBar
        folders={folders} folder={folder} setFolder={setFolder}
        items={items} user={user}
      />

      {/* SCN18: grade chips — All / Raw / Graded / specific tiers (PSA10, BGS10, …) */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {gradeChips.map((g) => {
          const isActive = gradeFilter === g;
          const count =
            g === 'All' ? folderItems.length :
            g === 'Raw' ? folderItems.filter((it) => !it.condition || it.condition === 'Raw').length :
            g === 'Graded' ? folderItems.filter((it) => it.condition && it.condition !== 'Raw').length :
            folderItems.filter((it) => it.condition === g).length;
          return (
            <button
              key={g}
              onClick={() => setGradeFilter(g)}
              style={{
                flexShrink: 0, padding: '7px 14px', fontSize: SZ.xs, fontWeight: 600,
                background: isActive ? T.gradientPrimary : 'transparent',
                color: isActive ? T.bgDeep : (g === 'Raw' ? T.textMid : T.cyan),
                border: `1px solid ${isActive ? 'transparent' : T.border2}`,
                borderRadius: 999, cursor: 'pointer',
                fontFamily: T.fontDisplay, letterSpacing: '0.06em', whiteSpace: 'nowrap',
              }}
            >
              {g} · {count}
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, marginTop: 10 }}>
        {[
          ['all',    'All'],
          ['onhold', 'Holding'],
          ['sold',   'Sold'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              flex: 1, padding: '10px 0', fontSize: SZ.sm,
              background: filter === k ? T.surface2 : 'transparent',
              color: filter === k ? T.textHi : T.textLow,
              border: `1px solid ${filter === k ? T.border2 : T.border}`,
              borderRadius: 10, cursor: 'pointer',
              fontFamily: T.fontDisplay, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: T.textLow, fontSize: SZ.md }}>
          {filter === 'sold' ? 'No sold cards in this folder.' : 'No cards yet — scan one.'}
        </div>
      ) : (
        filtered.map((item) => (
          <VaultRow
            key={item.id} item={item}
            currency={currency} fx={fx}
            folders={folders}
            getIdToken={getIdToken}
            tier={tier}
          />
        ))
      )}
    </div>
  );
}

// ===========================================================
// Tiles
// ===========================================================
function PnLTile({ label, value, currency, fx }) {
  const positive = value >= 0;
  const color = positive ? T.cyan : T.redLight;
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: '14px 14px',
    }}>
      <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: SZ.xl - 2, fontWeight: 700, color, marginTop: 4, fontFamily: T.fontMono }}>
        {positive ? '+' : ''}{fmtMoney(value, currency, fx)}
      </div>
    </div>
  );
}

function ProfitabilitySpark({ items, currency, fx }) {
  // Order by purchaseDate, build a running cumulative paid vs running
  // cumulative vault value series — overlay them on one sparkline.
  const sorted = [...items]
    .filter((it) => it.purchaseDate && (it.paid || it.current || it.sold))
    .sort((a, b) => new Date(a.purchaseDate) - new Date(b.purchaseDate));
  if (sorted.length < 2) return null;
  const W = 480, H = 100, pad = 6;
  const rate = (fx && fx[currency]) || 1;
  let cumPaid = 0;
  let cumVal = 0;
  const series = sorted.map((it) => {
    cumPaid += (it.paid || 0);
    cumVal += (it.sold || it.current || 0);
    return { date: it.purchaseDate, paid: cumPaid * rate, val: cumVal * rate };
  });
  const allY = [...series.map((s) => s.paid), ...series.map((s) => s.val)];
  const maxY = Math.max(...allY, 1);
  const minY = Math.min(...allY, 0);
  const range = maxY - minY || 1;
  const xs = series.map((_, i) => pad + (i / (series.length - 1)) * (W - pad * 2));
  const y = (v) => H - pad - ((v - minY) / range) * (H - pad * 2);
  const paidPts = series.map((s, i) => `${xs[i].toFixed(1)},${y(s.paid).toFixed(1)}`).join(' ');
  const valPts  = series.map((s, i) => `${xs[i].toFixed(1)},${y(s.val).toFixed(1)}`).join(' ');
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontDisplay, fontWeight: 600, letterSpacing: '0.08em' }}>
          PROFITABILITY
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono }}>
          <span><span style={{ color: T.magenta }}>●</span> Paid</span>
          <span><span style={{ color: T.cyan }}>●</span> Value</span>
        </div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <polyline points={paidPts} fill="none" stroke={T.magenta} strokeWidth="2" />
        <polyline points={valPts}  fill="none" stroke={T.cyan} strokeWidth="2" />
      </svg>
    </div>
  );
}

// ===========================================================
// Folder bar — pick + create
// ===========================================================
function FolderBar({ folders, folder, setFolder, items, user }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const createFolder = () => {
    const n = name.trim();
    if (!n) return;
    setFolder(n);
    setName('');
    setCreating(false);
    // Folder existence is implicit — items get folder=n when moved.
  };
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 4 }}>
        {folders.map((f) => (
          <button
            key={f}
            onClick={() => setFolder(f)}
            style={{
              flexShrink: 0, padding: '8px 14px',
              background: folder === f ? T.gradientPrimary : 'transparent',
              color: folder === f ? T.bgDeep : T.textMid,
              border: `1px solid ${folder === f ? 'transparent' : T.border2}`,
              borderRadius: 999, fontSize: SZ.sm, fontWeight: 600,
              cursor: 'pointer', fontFamily: T.fontBody, whiteSpace: 'nowrap',
            }}
          >{f}</button>
        ))}
        {creating ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); }}
              placeholder="Folder name"
              style={{
                background: T.surface2, color: T.textHi,
                border: `1px solid ${T.border2}`, borderRadius: 999,
                padding: '6px 12px', fontSize: SZ.sm, outline: 'none',
              }}
            />
            <button onClick={createFolder} style={miniBtn(T.cyan)}>OK</button>
            <button onClick={() => { setCreating(false); setName(''); }} style={miniBtn(T.textDim)}>×</button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            style={{
              flexShrink: 0, padding: '8px 12px',
              background: 'transparent', color: T.cyan,
              border: `1px dashed ${T.border2}`, borderRadius: 999,
              fontSize: SZ.sm, fontWeight: 600, cursor: 'pointer',
            }}
          >+ New folder</button>
        )}
      </div>
    </div>
  );
}

function miniBtn(color) {
  return {
    background: 'transparent', color, border: 'none', cursor: 'pointer',
    fontSize: SZ.sm, padding: '4px 6px', fontWeight: 600,
  };
}

// ===========================================================
// VaultRow — single item card
// ===========================================================
function VaultRow({ item, currency, fx, folders, getIdToken, tier = 'user' }) {
  const [busy, setBusy] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [sellSheetOpen, setSellSheetOpen] = useState(false);
  const pl = (item.sold || item.current || 0) - (item.paid || 0);
  const plPct = item.paid ? Math.round((pl / item.paid) * 100) : 0;

  const onDelete = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this card from your vault?')) return;
    setBusy(true);
    try {
      await deleteVaultItem(item.id);
    } finally {
      setBusy(false);
    }
  };

  // Open the Mark Sold sheet — replaces the v13 prompt() flow with a proper
  // fee-preview-aware modal per A5.
  const onSold = () => setSellSheetOpen(true);

  // Commit handler called by MarkSoldSheet on confirm. Stores the NET sale
  // amount in the vault doc so realized P/L is net-of-fees, and logs the
  // full fee breakdown to /transactions for analytics.
  const commitSale = async ({ gross, net, currency: payCurrency, txType, deliveryMode, payment, fees }) => {
    setBusy(true);
    try {
      const rate = (fx && fx[payCurrency]) || 1;
      const netTHB   = Math.round(net   / rate);
      const grossTHB = Math.round(gross / rate);
      // Vault doc records the SELLER's net receipts so P/L is honest.
      // Gross + fees stored alongside for future audit / dispute trail.
      await markSold(item.id, netTHB, 'SwibSwap', {
        soldGrossTHB: grossTHB,
        soldFees: fees,            // { bsa, shipping, payment, vat, gross, net }
        soldTxType: txType,
        soldDeliveryMode: deliveryMode,
        soldPayment: payment,
      });
      // Fire-and-forget transaction event for the future SwibSwap market.
      // We log gross (the price the buyer paid before our fees) so the
      // market-graph reflects what the card actually traded for.
      await logSale({
        code: item.code, rarity: item.rarity, lang: item.lang, tcg: item.tcg,
        amount: gross, currency: payCurrency, getIdToken,
      });
      setSellSheetOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const moveToFolder = async (f) => {
    setShowFolderMenu(false);
    setBusy(true);
    try {
      await updateVaultItem(item.id, { folder: f === 'All' ? null : f });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 12, marginBottom: 10,
      display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {item.photoUrl || item.opDetailsImageUrl ? (
        <img
          src={item.photoUrl || apiUrl(`/proxy-image?url=${encodeURIComponent(item.opDetailsImageUrl)}`)}
          alt=""
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 6 }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: T.surface2, borderRadius: 6 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono }}>{item.code}</div>
        <div style={{ fontSize: SZ.md, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.nameEn}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          {item.rarity && <Pill tag={item.rarity} size="sm" />}
          {item.condition && item.condition !== 'Raw' && <Pill tag={item.condition} size="sm" />}
          {item.lang && <Pill tag={item.lang} size="sm" />}
          {item.sold && <Pill tag="Sold" size="sm" />}
        </div>
        {item.purchaseDate && (
          <div style={{ fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>
            bought {new Date(item.purchaseDate).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', position: 'relative' }}>
        <div style={{ fontSize: SZ.md, fontFamily: T.fontMono, color: pl >= 0 ? T.cyan : T.redLight, fontWeight: 600 }}>
          {pl >= 0 ? '+' : ''}{plPct}%
        </div>
        <div style={{ fontSize: SZ.xs, color: T.textLow, fontFamily: T.fontMono }}>
          {fmtMoney(item.sold || item.current || 0, currency, fx)}
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
          {!item.sold && <button onClick={onSold} disabled={busy} style={miniBtn(T.cyan)}>sell</button>}
          <button onClick={() => setShowFolderMenu((s) => !s)} disabled={busy} style={miniBtn(T.textMid)}>⋯</button>
          <button onClick={onDelete} disabled={busy} style={miniBtn(T.red)}>del</button>
        </div>
        {showFolderMenu && (
          <div
            onMouseLeave={() => setShowFolderMenu(false)}
            style={{
              position: 'absolute', right: 0, top: '100%',
              background: T.surface2, border: `1px solid ${T.border2}`,
              borderRadius: 10, padding: 6, zIndex: 10,
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)', minWidth: 140,
            }}
          >
            <div style={{ fontSize: SZ.xs, color: T.textDim, padding: '4px 8px', fontFamily: T.fontDisplay, letterSpacing: '0.06em' }}>
              MOVE TO
            </div>
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => moveToFolder(f)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  padding: '8px 10px', color: T.textMid,
                  fontSize: SZ.sm, cursor: 'pointer', borderRadius: 6,
                }}
              >{f}</button>
            ))}
          </div>
        )}
      </div>
    </div>
    {sellSheetOpen && (
      <MarkSoldSheet
        item={item}
        currency={currency}
        fx={fx}
        tier={tier}
        onCancel={() => setSellSheetOpen(false)}
        onConfirm={commitSale}
      />
    )}
    </>
  );
}

// ===========================================================
// MarkSoldSheet — fee-preview modal opened from a VaultRow's Sell button.
//
// Flow:
//   1. User enters sale price (in their primary currency)
//   2. Picks tx type (Buy-Sell vs Auction), delivery (Deliver vs Consign),
//      and payment method (CC vs PromptPay)
//   3. We POST {price, buyerTier, sellerTier, txType, deliveryMode, payment}
//      to /api/transactions?action=preview-fees (debounced 300 ms)
//   4. Server returns the full calc() breakdown — we render every line item
//   5. Confirm calls onConfirm({gross, net, fees, ...}) so VaultRow stores
//      the NET amount as realized P/L and logs the full breakdown
//
// Tier handling: until A2 (Membership UI) lands, every user is treated as
// `user` tier on both buyer + seller sides — i.e. the highest BSA fee.
// We surface this as a note so the user understands they'll see lower fees
// once tier upgrades are wired.
// ===========================================================
function MarkSoldSheet({ item, currency, fx, tier = 'user', onCancel, onConfirm }) {
  const rate = (fx && fx[currency]) || 1;
  // Default price = current vault valuation in user's currency, rounded to 2 dp.
  const initialPrice = Math.round((item.current || 0) * rate * 100) / 100;
  const [price, setPrice] = useState(initialPrice || '');
  const [txType, setTxType] = useState('buysell');       // 'buysell' | 'auction'
  const [deliveryMode, setDeliveryMode] = useState('deliver'); // 'deliver' | 'consign'
  const [payment, setPayment] = useState('pp');          // 'cc' | 'pp'
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Debounced fee preview — fire 300 ms after the last input change.
  // Uses the live tier from useSubscription (passed via VaultRow). A
  // Platinum user sees the platinum BSA rate; a free user sees the user
  // bracket. Both buyer + seller are set to the current user's tier since
  // the seller is the one looking at this sheet (typical case — the buyer
  // tier will become a separate input once SwibSwap.com listing wraps in).
  const debounceRef = useRef(null);
  useEffect(() => {
    const priceTHB = (Number(price) || 0) / rate;
    if (priceTHB <= 0) { setPreview(null); setPreviewErr(null); return; }
    clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await previewFees({
          price: priceTHB,
          buyerTier: tier,
          sellerTier: tier,
          txType,
          deliveryMode,
          payment,
          sellerCost: item.paid || 0,
        });
        setPreview(result);
        setPreviewErr(null);
      } catch (e) {
        setPreview(null);
        setPreviewErr(e.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [price, txType, deliveryMode, payment, rate, item.paid, tier]);

  const fmt = (thb) => fmtMoney(thb, currency, fx);

  const onSubmit = async () => {
    if (!preview || submitting) return;
    setSubmitting(true);
    try {
      const grossTHB = preview.input.price;
      const netTHB   = preview.seller.receives;
      await onConfirm({
        gross: Number(price),                        // user-currency amount typed
        net:   netTHB * rate,                        // user-currency net after fees
        currency,
        txType, deliveryMode, payment,
        fees: {
          bsaSellerTHB:    preview.seller.feeShare,
          consignPayback:  preview.seller.consignPayback,
          buyerFeeTHB:     preview.buyer.feeShare,
          shippingTHB:     preview.buyer.shipping,
          consignExtraTHB: preview.buyer.consignExtra,
          paymentFeeTHB:   preview.platform.paymentFee,
          vatTHB:          preview.platform.vatOnFee,
          grossTHB,
          netTHB,
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        background: T.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        width: '100%', maxWidth: 520, padding: 20, maxHeight: '92vh',
        overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: SZ.xs, color: T.cyan, fontFamily: T.fontDisplay, letterSpacing: '0.12em', fontWeight: 700 }}>
              MARK SOLD
            </div>
            <div style={{ fontSize: SZ.lg, color: T.textHi, fontWeight: 600, marginTop: 2 }}>
              {item.nameEn}
            </div>
            <div style={{ fontSize: SZ.sm, color: T.textLow, fontFamily: T.fontMono }}>
              {item.code} · {item.rarity} · {item.lang}
            </div>
          </div>
          <button
            onClick={onCancel} disabled={submitting}
            style={{
              background: 'transparent', border: 'none', color: T.textLow,
              fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1,
            }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Sale price input */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.06em', fontFamily: T.fontDisplay, fontWeight: 600 }}>
            SALE PRICE ({currency})
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            style={{
              width: '100%', padding: '12px 14px', marginTop: 6,
              fontSize: SZ.xl, fontFamily: T.fontMono, fontWeight: 600,
              background: T.bgDeep, color: T.textHi,
              border: `1px solid ${T.border2}`, borderRadius: 10,
            }}
          />
          {item.paid > 0 && (
            <div style={{ fontSize: SZ.xs, color: T.textDim, marginTop: 4, fontFamily: T.fontMono }}>
              Cost basis: {fmt(item.paid)}
            </div>
          )}
        </div>

        {/* Tx type + delivery + payment toggles */}
        <ToggleRow label="LISTING TYPE" value={txType} setValue={setTxType}
          options={[['Buy / Sell', 'buysell'], ['Auction', 'auction']]} />
        <ToggleRow label="DELIVERY" value={deliveryMode} setValue={setDeliveryMode}
          options={[['Deliver', 'deliver'], ['Consign', 'consign']]} />
        <ToggleRow label="PAYMENT" value={payment} setValue={setPayment}
          options={[['PromptPay', 'pp'], ['Card', 'cc']]} />

        {/* Fee breakdown */}
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 12,
          background: T.bgDeep, border: `1px solid ${T.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.08em', fontFamily: T.fontDisplay, fontWeight: 700 }}>
              FEE BREAKDOWN · NBT RATE 3
            </div>
            {loading && <Spinner size={14} />}
          </div>

          {previewErr && (
            <div style={{ fontSize: SZ.sm, color: T.red, padding: '8px 0' }}>
              {previewErr}
            </div>
          )}

          {preview ? (
            <>
              <FeeRow label="Sale price" value={fmt(preview.input.price)} />
              <FeeRow label="− BSA fee (seller)" value={`−${fmt(preview.seller.feeShare)}`} muted />
              {preview.seller.consignPayback > 0 && (
                <FeeRow label="+ Consign payback" value={`+${fmt(preview.seller.consignPayback)}`} accent />
              )}
              <FeeRowSeparator />
              <FeeRow label="Net to seller" value={fmt(preview.seller.receives)} big accent />
              {item.paid > 0 && (
                <FeeRow
                  label="Realized P/L (net)"
                  value={`${preview.seller.profit >= 0 ? '+' : ''}${fmt(preview.seller.profit)}`}
                  accent={preview.seller.profit >= 0}
                  danger={preview.seller.profit < 0}
                />
              )}

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: SZ.xs, color: T.textDim, marginBottom: 8, fontFamily: T.fontMono }}>
                  What the buyer pays
                </div>
                <FeeRow label="Sale price" value={fmt(preview.input.price)} muted small />
                <FeeRow label="+ BSA fee (buyer)" value={`+${fmt(preview.buyer.feeShare)}`} muted small />
                {preview.buyer.consignExtra > 0 && (
                  <FeeRow label="+ Consign extra" value={`+${fmt(preview.buyer.consignExtra)}`} muted small />
                )}
                <FeeRow label="+ Shipping" value={`+${fmt(preview.buyer.shipping)}`} muted small />
                {preview.buyer.ppDiscount > 0 && (
                  <FeeRow label="− PromptPay discount" value={`−${fmt(preview.buyer.ppDiscount)}`} muted small accent />
                )}
                <FeeRow label="Buyer total" value={fmt(preview.buyer.total)} small />
              </div>
            </>
          ) : (
            <div style={{ fontSize: SZ.sm, color: T.textLow, padding: '8px 0' }}>
              Enter a sale price to preview fees.
            </div>
          )}

          {preview && (
            <div style={{
              marginTop: 12, padding: '8px 10px', borderRadius: 8,
              background: tier === 'platinum'
                ? 'rgba(166,180,255,0.10)'   // platinum-tinted
                : tier === 'gold'
                  ? 'rgba(255,216,77,0.08)'  // gold-tinted
                  : 'rgba(93,213,240,0.06)', // cyan default
              border: `1px solid ${T.border}`,
              fontSize: SZ.xs, color: T.textDim, fontFamily: T.fontMono, lineHeight: 1.5,
            }}>
              Your tier:{' '}
              <strong style={{ color: TIER_LABELS[tier]?.color || T.textMid }}>
                {TIER_LABELS[tier]?.name || 'User'}
              </strong>
              {tier === 'user' && (
                <>
                  {' '}· Silver members pay ~50% less BSA. Upgrade in Settings → Membership.
                </>
              )}
              {tier === 'platinum' && (
                <>
                  {' '}· You&apos;re paying the lowest possible BSA. Nice.
                </>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Button variant="surface" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!preview || submitting} style={{ flex: 1 }}>
            {submitting ? <Spinner size={16} color={T.bgDeep} /> :
              preview ? `Confirm sale · receive ${fmt(preview.seller.receives)}` : 'Enter price'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, setValue, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.06em',
        fontFamily: T.fontDisplay, fontWeight: 600, marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(([lbl, val]) => {
          const active = value === val;
          return (
            <button
              key={val} type="button" onClick={() => setValue(val)}
              style={{
                flex: 1, padding: '10px 0',
                background: active ? T.gradientPrimary : 'transparent',
                color: active ? T.bgDeep : T.textMid,
                border: `1px solid ${active ? 'transparent' : T.border2}`,
                borderRadius: 999, fontSize: SZ.sm, fontWeight: 600,
                fontFamily: T.fontBody, cursor: 'pointer',
              }}
            >{lbl}</button>
          );
        })}
      </div>
    </div>
  );
}

function FeeRow({ label, value, big, small, muted, accent, danger }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0',
      fontSize: big ? SZ.lg : small ? SZ.xs : SZ.sm,
      fontWeight: big ? 700 : 500,
      color: danger ? T.red : accent && big ? T.cyan : accent ? T.cyan : muted ? T.textLow : T.textMid,
      fontFamily: small ? T.fontMono : T.fontBody,
    }}>
      <span>{label}</span>
      <span style={{ fontFamily: T.fontMono, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
function FeeRowSeparator() {
  return <div style={{ height: 1, background: T.border, margin: '8px 0' }} />;
}

function computeTotals(items) {
  let paid = 0;
  let unsoldVal = 0;     // sum of current vault-value for held items
  let soldVal = 0;       // realized sale proceeds
  let itemCount = 0;
  let soldCount = 0;
  let paidOfSold = 0;
  let paidOfHeld = 0;
  for (const it of items) {
    paid += it.paid || 0;
    if (it.sold) {
      soldVal += it.sold;
      paidOfSold += it.paid || 0;
      soldCount += 1;
    } else {
      unsoldVal += it.vaultValue || it.current || 0;
      paidOfHeld += it.paid || 0;
      itemCount += 1;
    }
  }
  return {
    paid,
    vaultValue: unsoldVal,                  // Vault Value = current value of held items
    unrealized: unsoldVal - paidOfHeld,     // Held items' market value minus what was paid
    realized: soldVal - paidOfSold,         // Sold items' proceeds minus what was paid
    itemCount,
    soldCount,
  };
}
