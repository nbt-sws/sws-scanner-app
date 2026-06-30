// BoBoa Scanner v12 - by I1NOV
// Single-file React app: splash, sign-in, TCG picker, scanner, AI extraction,
// rarity confirmation, pricing (Raw/Graded x 4 tabs), SwibsVault, settings

import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// THEME - cyberpunk dark blue/pink · night-viewing safe
// ============================================================
const T = {
  bg: '#0F1228',        // deep navy (not pure black - prevents OLED smear)
  surface: '#1A1E3D',
  surface2: '#252A52',
  border: '#2A2F5C',
  border2: '#3A3F6A',
  pink: '#F06AA8',      // primary accent - pricing, active state
  pinkDark: '#1A0A18',  // pink text-on-bg contrast
  blue: '#7B8AF5',      // secondary
  blueBright: '#A6B4FF',
  cyan: '#4FE0D0',      // positive / LIVE / trend up
  amber: '#FFB86C',     // eBay / warning
  red: '#D52B2B',       // SOLD / danger
  redLight: '#FF8080',
  gold: '#FFD84D',      // BGS / DON!!
  cgcBlue: '#85B7EB',
  textHi: '#E8E9F5',
  textMid: '#A6ABD4',
  textLow: '#8E91B8',
  textDim: '#6E719B',
  fontMono: "'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace",
};

// ============================================================
// CURRENCY - 6 options · FX rates fetched from Frankfurter API daily
// ============================================================
const CURRENCIES = {
  THB: { symbol: '฿', name: 'Thai baht', locale: 'th-TH' },
  USD: { symbol: '$', name: 'US dollar', locale: 'en-US' },
  PHP: { symbol: '₱', name: 'Philippine peso', locale: 'en-PH' },
  JPY: { symbol: '¥', name: 'Japanese yen', locale: 'ja-JP' },
  MYR: { symbol: 'RM', name: 'Malaysian ringgit', locale: 'ms-MY' },
  SGD: { symbol: 'S$', name: 'Singapore dollar', locale: 'en-SG' },
};

// fallback FX rates (base THB) - refreshed at runtime from Frankfurter
const DEFAULT_FX = { THB: 1, USD: 0.0286, PHP: 1.66, JPY: 4.32, MYR: 0.128, SGD: 0.0383 };

function fmtMoney(amountTHB, currency, fx) {
  const rate = fx[currency] || DEFAULT_FX[currency];
  const converted = amountTHB * rate;
  const c = CURRENCIES[currency];
  const rounded = currency === 'JPY' ? Math.round(converted) : Math.round(converted);
  return `${c.symbol}${rounded.toLocaleString(c.locale)}`;
}

// ============================================================
// TAG taxonomy - condition + rarity + type + promo + language
// ============================================================
const TAG_STYLES = {
  // Condition tags
  Raw:       { bg: 'rgba(123,138,245,0.15)', c: '#A6B4FF', b: 'rgba(123,138,245,0.3)' },
  'PSA 10':  { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.4)' },
  'PSA 9':   { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.4)' },
  'PSA 8':   { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.4)' },
  'BGS 10':  { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  'BGS 9.5': { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  'BGS 9':   { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  'ARS 10':  { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.4)' },
  'ARS 9':   { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.4)' },
  'CGC 10':  { bg: 'rgba(133,183,235,0.15)', c: '#85B7EB', b: 'rgba(133,183,235,0.4)' },
  'CGC 9.5': { bg: 'rgba(133,183,235,0.15)', c: '#85B7EB', b: 'rgba(133,183,235,0.4)' },
  // Card type (One Piece)
  Leader:    { bg: 'rgba(213,43,43,0.15)',   c: '#FF8080', b: 'rgba(213,43,43,0.35)' },
  Character: { bg: 'rgba(123,138,245,0.15)', c: '#A6B4FF', b: 'rgba(123,138,245,0.3)' },
  Event:     { bg: 'rgba(79,224,208,0.15)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.3)' },
  Stage:     { bg: 'rgba(255,184,108,0.15)', c: '#FFB86C', b: 'rgba(255,184,108,0.3)' },
  'DON!!':   { bg: 'rgba(255,216,77,0.15)',  c: '#FFD84D', b: 'rgba(255,216,77,0.4)' },
  // Language
  EN:        { bg: 'rgba(123,138,245,0.12)', c: '#A6B4FF', b: 'rgba(123,138,245,0.28)' },
  JP:        { bg: 'rgba(79,224,208,0.12)',  c: '#4FE0D0', b: 'rgba(79,224,208,0.28)' },
  AE:        { bg: 'rgba(255,184,108,0.12)', c: '#FFB86C', b: 'rgba(255,184,108,0.28)' },
  // Promo (special bold)
  Promo:     { bg: 'rgba(240,106,168,0.2)',  c: '#F06AA8', b: '#F06AA8' },
  // Default rarity - pink
  _rarity:   { bg: 'rgba(240,106,168,0.15)', c: '#F06AA8', b: 'rgba(240,106,168,0.3)' },
};

const RARITY_TAGS = new Set([
  // YGO rarities
  'Overframe PSE','Prismatic Secret','Quarter Century','Ultimate Rare','Ghost Rare',
  '20th Anniv','Collector Rare','Starlight','Secret Rare','Ultra Rare','Super Rare',
  'Rare','Common','UR','SR','R','C','UC','SCR','URR','CR','GR','QCSR','PSER',
  // One Piece rarities
  'SEC','L','SR','R','UC','C','TR','SP','L-P','SR-P','SEC-P','R-P','C-P','UC-P',
]);

function tagStyle(tag) {
  if (TAG_STYLES[tag]) return TAG_STYLES[tag];
  if (RARITY_TAGS.has(tag)) return TAG_STYLES._rarity;
  return TAG_STYLES._rarity; // fallback to pink
}

function Pill({ tag, size = 'md' }) {
  const s = tagStyle(tag);
  const style = {
    display: 'inline-block',
    background: s.bg,
    color: s.c,
    border: `0.5px solid ${s.b}`,
    fontWeight: 500,
    fontSize: size === 'sm' ? 9 : 10,
    padding: size === 'sm' ? '2px 6px' : '3px 8px',
    borderRadius: 99,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  };
  return <span style={style}>{tag}</span>;
}

function TagStack({ tags, align = 'flex-end', size = 'md' }) {
  const filtered = (tags || []).filter(Boolean);
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      alignItems: align,
      flexShrink: 0,
    }}>
      {filtered.map((t, i) => <Pill key={i} tag={t} size={size} />)}
    </div>
  );
}

// ============================================================
// Mock data - this would come from backend in production
// ============================================================
const MOCK_VAULT = [
  {
    id: 'v1', code: 'LOCH-JP003', nameEn: "Magician's Curtain", nameJp: '黒魔導のカーテン',
    tcg: 'ygo', lang: 'JP', condition: 'Raw', rarity: 'Overframe PSE', type: null,
    promo: false, paid: 12400, current: 18440, sold: null, soldDate: null,
    purchaseDate: '2026-04-15', notes: '', certNumber: null, gradingCompany: null,
  },
  {
    id: 'v2', code: 'OP07-051', nameEn: 'Boa Hancock', nameJp: null,
    tcg: 'op', lang: 'JP', condition: 'Raw', rarity: 'SR', type: 'Character',
    promo: true, paid: 3200, current: 14000, sold: 14000, soldDate: '2026-04-23',
    soldVia: 'SwibSwap', purchaseDate: '2026-04-10',
  },
  {
    id: 'v3', code: 'LOCH-JP003', nameEn: "Magician's Curtain", nameJp: '黒魔導のカーテン',
    tcg: 'ygo', lang: 'JP', condition: 'PSA 10', rarity: 'Overframe PSE', type: null,
    promo: false, paid: 98000, current: 142800, sold: null,
    certNumber: '78142556', gradingCompany: 'PSA', grade: '10',
    purchaseDate: '2026-03-20',
  },
  {
    id: 'v4', code: 'ST30-001', nameEn: 'Luffy & Ace', nameJp: null,
    tcg: 'op', lang: 'JP', condition: 'Raw', rarity: 'L-P', type: 'Leader',
    promo: false, paid: 16500, current: 14352, sold: null,
    purchaseDate: '2026-03-05',
  },
  {
    id: 'v5', code: 'OP09-001', nameEn: 'Shanks', nameJp: 'シャンクス',
    tcg: 'op', lang: 'JP', condition: 'ARS 10', rarity: 'SEC', type: 'Character',
    promo: false, paid: 72000, current: 94200, sold: null,
    certNumber: '78142556', gradingCompany: 'ARS', grade: '10',
    purchaseDate: '2026-02-14',
  },
  {
    id: 'v6', code: 'LOCR-JP001', nameEn: 'Blue-Eyes White Dragon', nameJp: '青眼の白龍',
    tcg: 'ygo', lang: 'JP', condition: 'Raw', rarity: 'Overframe PSE', type: null,
    promo: false, paid: 6800, current: 10080, sold: null,
    purchaseDate: '2026-04-01',
  },
  {
    id: 'v7', code: 'OP03-070', nameEn: 'Roronoa Zoro', nameJp: null,
    tcg: 'op', lang: 'JP', condition: 'Raw', rarity: 'SR-P', type: 'Character',
    promo: false, paid: 5400, current: 7890, sold: null,
    purchaseDate: '2026-04-18',
  },
  {
    id: 'v8', code: 'LOB-EN001', nameEn: 'Dark Magician', nameJp: null,
    tcg: 'ygo', lang: 'AE', condition: 'Raw', rarity: 'Ultra Rare', type: null,
    promo: false, paid: 1200, current: 890, sold: null,
    purchaseDate: '2026-04-19',
  },
];

// ============================================================
// Utility hooks
// ============================================================
function useFxRates() {
  const [fx, setFx] = useState(DEFAULT_FX);
  useEffect(() => {
    // Frankfurter API - free, no auth, daily rates, base THB
    fetch('https://api.frankfurter.app/latest?base=THB&symbols=USD,PHP,JPY,MYR,SGD')
      .then(r => r.json())
      .then(data => {
        if (data && data.rates) setFx({ THB: 1, ...data.rates });
      })
      .catch(() => {/* keep defaults */});
  }, []);
  return fx;
}

// ============================================================
// Shared components
// ============================================================
function Screen({ children, style = {} }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      color: T.textHi,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatTile({ label, value, color = T.textHi, gradient = false, sub = null }) {
  const bg = gradient
    ? `linear-gradient(135deg, ${T.pink}, ${T.blue})`
    : T.surface;
  const border = gradient ? 'none' : `0.5px solid ${T.border}`;
  const labelColor = gradient ? T.pinkDark : T.textLow;
  const valueColor = gradient ? T.pinkDark : color;
  return (
    <div style={{
      background: bg,
      border,
      borderRadius: 10,
      padding: '10px 10px',
    }}>
      <div style={{
        fontSize: 9,
        color: labelColor,
        fontWeight: 500,
        letterSpacing: '0.05em',
        opacity: gradient ? 0.82 : 1,
      }}>{label}</div>
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        color: valueColor,
        marginTop: 3,
        fontFamily: T.fontMono,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: T.textDim, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Button({ onClick, variant = 'primary', children, style = {}, disabled = false }) {
  const variants = {
    primary: { bg: T.pink, color: T.pinkDark, border: 'none' },
    outline: { bg: 'transparent', color: T.textMid, border: `0.5px solid ${T.border2}` },
    surface: { bg: T.surface, color: T.textMid, border: `0.5px solid ${T.border}` },
    danger:  { bg: T.red, color: '#fff', border: 'none' },
  };
  const v = variants[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: v.bg,
        color: v.color,
        border: v.border,
        borderRadius: 12,
        padding: '11px 16px',
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: '100%',
        transition: 'opacity 0.15s',
        ...style,
      }}>
      {children}
    </button>
  );
}

// ============================================================
// Splash screen
// ============================================================
function Splash({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <Screen style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
      <div style={{
        width: 96, height: 96, borderRadius: 24,
        background: `linear-gradient(135deg, ${T.pink}, ${T.blue})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        fontSize: 36, fontWeight: 500, color: T.pinkDark,
      }}>BB</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: T.textHi, marginBottom: 6 }}>BoBoa Scanner</div>
      <div style={{ fontSize: 11, color: T.textLow, letterSpacing: '0.2em', fontFamily: T.fontMono }}>
        SCAN · PRICE · COLLECT
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', marginTop: 80 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: `2px solid rgba(240,106,168,0.2)`,
          borderTopColor: T.pink,
          animation: 'spin 1s linear infinite',
          marginBottom: 14,
        }}/>
      </div>
      <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '0.15em' }}>
        by <span style={{ color: T.textMid, fontWeight: 500 }}>I1NOV</span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Screen>
  );
}

// ============================================================
// Sign in
// ============================================================
function SignIn({ onDone }) {
  return (
    <Screen style={{ padding: '50px 24px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: `linear-gradient(135deg, ${T.pink}, ${T.blue})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 22, fontSize: 24, fontWeight: 500, color: T.pinkDark,
      }}>BB</div>
      <div style={{ fontSize: 26, fontWeight: 500, color: T.textHi, marginBottom: 6 }}>Welcome</div>
      <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 30 }}>
        Scan TCG cards · Track your collection · See real-time market prices
      </div>
      <SignInRow icon="A" iconBg="#fff" iconColor="#000" label="Continue with Apple" onClick={onDone}/>
      <SignInRow icon="G" iconBg="#fff" iconColor="#4285F4" label="Continue with Google" onClick={onDone}/>
      <SignInRow icon="@" iconBg="rgba(240,106,168,0.15)" iconColor={T.pink} label="Continue with email" onClick={onDone}/>
      <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 26, textAlign: 'center', lineHeight: 1.7 }}>
        By continuing you accept our<br/>
        <span style={{ color: T.pink }}>terms</span> and <span style={{ color: T.pink }}>privacy policy</span>
      </div>
    </Screen>
  );
}

function SignInRow({ icon, iconBg, iconColor, label, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: T.surface,
      border: `0.5px solid ${T.border}`,
      borderRadius: 13,
      padding: 11,
      marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 500,
      }}>{icon}</div>
      <div style={{ flex: 1, color: T.textHi, fontSize: 13, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ============================================================
// TCG + language picker
// ============================================================
function TcgPicker({ onDone }) {
  const [tcg, setTcg] = useState(null);
  const [lang, setLang] = useState(null);
  const [step, setStep] = useState(1);

  const next = () => {
    if (step === 1 && tcg) setStep(2);
    else if (step === 2 && lang) onDone({ tcg, lang });
  };

  const langOptions = tcg === 'ygo'
    ? [
        { key: 'JP', title: 'Japanese (OCG)', sub: 'JP printing · Overframe PSE etc' },
        { key: 'AE', title: 'Asian-English', sub: 'AE printing · 1st edition' },
        { key: 'EN', title: 'English (TCG)', sub: 'NA / EU printing' },
      ]
    : [
        { key: 'JP', title: 'Japanese', sub: 'JP printing · original release' },
        { key: 'EN', title: 'English', sub: 'International release' },
      ];

  return (
    <Screen style={{ padding: '30px 22px' }}>
      <div style={{ fontSize: 10, color: T.textLow, letterSpacing: '0.1em', fontWeight: 500, marginBottom: 5 }}>
        STEP {step} / 2
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: T.textHi, lineHeight: 1.15, marginBottom: 22 }}>
        {step === 1 ? 'Pick your game' : 'Card language'}
      </div>

      {step === 1 && (
        <>
          <PickerRow selected={tcg === 'op'} onClick={() => setTcg('op')}
            icon="⚓" title="One Piece TCG" sub="JP · EN · DON!! · Promo"/>
          <PickerRow selected={tcg === 'ygo'} onClick={() => setTcg('ygo')}
            icon="⚔" title="Yu-Gi-Oh!" sub="JP (OCG) · Asian-English · Promo"/>
        </>
      )}

      {step === 2 && langOptions.map(o => (
        <PickerRow key={o.key} selected={lang === o.key} onClick={() => setLang(o.key)}
          icon={o.key === 'JP' ? '日' : o.key} title={o.title} sub={o.sub}/>
      ))}

      <div style={{ position: 'fixed', bottom: 20, left: 22, right: 22, display: 'flex', gap: 8 }}>
        {step === 2 && (
          <Button variant="outline" onClick={() => setStep(1)} style={{ flex: 1 }}>← back</Button>
        )}
        <Button onClick={next} disabled={step === 1 ? !tcg : !lang} style={{ flex: 2 }}>
          {step === 1 ? 'Next' : 'Start scanning →'}
        </Button>
      </div>
    </Screen>
  );
}

function PickerRow({ selected, onClick, icon, title, sub }) {
  return (
    <div onClick={onClick} style={{
      background: selected ? `linear-gradient(135deg, ${T.pink}, #C04D88)` : T.surface,
      border: selected ? 'none' : `0.5px solid ${T.border}`,
      borderRadius: 16, padding: '14px 15px',
      display: 'flex', alignItems: 'center', gap: 12,
      marginBottom: 10,
      cursor: 'pointer',
      color: selected ? T.pinkDark : T.textHi,
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 11,
        background: selected ? 'rgba(26,10,24,0.16)' : 'rgba(123,138,245,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, fontWeight: 500,
        color: selected ? 'inherit' : T.blue,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 10.5, opacity: 0.8 }}>{sub}</div>
      </div>
      {selected && <div style={{ fontSize: 18 }}>✓</div>}
    </div>
  );
}

// ============================================================
// Scanner - camera preview with code hint position
// ============================================================
function Scanner({ tcg, lang, onCapture, onBack }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreaming(true);
        }
      } catch (e) {
        setError('Camera access denied. Use upload instead.');
      }
    }
    startCamera();
    const videoEl = videoRef.current;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (videoEl?.srcObject) {
        videoEl.srcObject.getTracks().forEach(t => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(b64);
  }

  function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture(reader.result);
    reader.readAsDataURL(file);
  }

  // Code hint position per TCG
  const hintPos = tcg === 'ygo'
    ? { top: '42%', right: 10, width: 80, label: 'code here ↗', labelTop: '38%' }
    : { bottom: 10, right: 10, width: 70, label: 'code here ↘', labelBottom: 42 };

  return (
    <Screen style={{ background: '#05060F' }}>
      <div style={{ padding: '16px 16px 12px', display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="outline" onClick={onBack} style={{ width: 'auto', padding: '5px 11px', fontSize: 11 }}>← back</Button>
        <Pill tag={`${tcg === 'ygo' ? 'Yu-Gi-Oh!' : 'One Piece'} · ${lang}`}/>
      </div>
      <div style={{ padding: '0 24px', marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.pink, marginBottom: 4 }}>
          AI reads code from {tcg === 'ygo' ? 'top-right (above text box)' : 'bottom-right corner'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
          {tcg === 'ygo' ? 'Above the card description text' : 'DON!! cards have no code — fill frame'}
        </div>
      </div>

      <div style={{ position: 'relative', height: '55vh', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
        {streaming && !error ? (
          <div style={{ position: 'relative', maxWidth: 260, width: '70%', aspectRatio: '0.72' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}/>
            {/* Frame corners */}
            {['tl','tr','bl','br'].map(c => (
              <div key={c} style={{
                position: 'absolute',
                [c[0]==='t'?'top':'bottom']: -1,
                [c[1]==='l'?'left':'right']: -1,
                width: 28, height: 28,
                [`border${c[0]==='t'?'Top':'Bottom'}`]: `3px solid ${T.pink}`,
                [`border${c[1]==='l'?'Left':'Right'}`]: `3px solid ${T.pink}`,
              }}/>
            ))}
            {/* Code hint rectangle */}
            <div style={{
              position: 'absolute', ...hintPos,
              height: 26,
              border: `2px solid ${T.cyan}`,
              background: 'rgba(79,224,208,0.1)',
              borderRadius: 3,
            }}/>
          </div>
        ) : (
          <div style={{ color: T.textMid, textAlign: 'center' }}>
            {error || 'Starting camera…'}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 22px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 14 }}>
          <label style={{ color: T.textMid, fontSize: 10, textAlign: 'center', cursor: 'pointer' }}>
            <input type="file" accept="image/*" onChange={uploadFile} style={{ display: 'none' }}/>
            <div style={{ fontSize: 18 }}>⤓</div>
            upload
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div onClick={capture} style={{
            width: 64, height: 64, borderRadius: '50%',
            border: `3px solid rgba(240,106,168,0.3)`,
            padding: 3, cursor: 'pointer',
          }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: T.pink }}/>
          </div>
        </div>
      </div>
    </Screen>
  );
}

// ============================================================
// AI extraction - send image to backend, show progress
// ============================================================
function Extracting({ imageData, tcg, lang, onDone, onFail }) {
  const [status, setStatus] = useState({
    code: null, nameJp: null, nameEn: null, rarity: null, db: null,
  });

  useEffect(() => {
    async function extract() {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageData, tcg, lang }),
        });
        const data = await res.json();
        if (!data.ok) { onFail(data.error); return; }
        // Animate progress
        setStatus(s => ({ ...s, code: data.card.code }));
        await sleep(300);
        setStatus(s => ({ ...s, nameJp: data.card.nameJp || '—' }));
        await sleep(300);
        setStatus(s => ({ ...s, nameEn: data.card.nameEn }));
        await sleep(300);
        setStatus(s => ({ ...s, rarity: `${data.card.rarity} · ${data.card.confidence}%` }));
        await sleep(500);
        setStatus(s => ({ ...s, db: 'matched' }));
        await sleep(500);
        onDone(data.card);
      } catch (e) {
        onFail(e.message);
      }
    }
    extract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = [
    { label: 'Card code', value: status.code, mono: true },
    { label: 'Name (JP)', value: status.nameJp },
    { label: 'Name (EN)', value: status.nameEn },
    { label: 'Rarity', value: status.rarity, color: T.pink },
    { label: 'Database match', value: status.db, isSpinner: !status.db },
  ];

  return (
    <Screen style={{ padding: '30px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: T.textHi, marginBottom: 4 }}>
          Reading your card…
        </div>
        <div style={{ fontSize: 11, color: T.textLow }}>AI extracting details</div>
      </div>

      <div style={{
        background: T.surface, border: `0.5px solid ${T.border}`,
        borderRadius: 12, padding: '12px 14px',
      }}>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 0',
            borderBottom: i < rows.length - 1 ? `0.5px solid ${T.border}` : 'none',
          }}>
            <span style={{ fontSize: 12, color: T.textHi }}>{r.label}</span>
            {r.isSpinner ? (
              <span style={{
                display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                border: `2px solid rgba(240,106,168,0.3)`,
                borderTopColor: T.pink,
                animation: 'spin 1s linear infinite',
              }}/>
            ) : (
              <span style={{
                fontSize: 12, color: r.color || T.cyan, fontWeight: 500,
                fontFamily: r.mono ? T.fontMono : 'inherit',
              }}>
                {r.value ? `${r.value} ✓` : '—'}
              </span>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Screen>
  );
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// Pricing page - Raw/Graded toggle + 4 tabs
// ============================================================
function Pricing({ card, currency, fx, onBack, onAddToVault }) {
  const [mode, setMode] = useState('raw'); // raw | graded
  const [tab, setTab] = useState('listing'); // listing | sold | chart | info

  const stats = mode === 'raw'
    ? { high: 27033, low: 8435, trend: '↑ 8.2%', current: 18440 }
    : { high: 236000, low: 24200, trend: '↑ 14.1%', current: 68200 };

  return (
    <Screen>
      {/* Header */}
      <div style={{
        background: T.surface, borderBottom: `0.5px solid ${T.border}`, padding: '11px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <Button variant="outline" onClick={onBack} style={{ width: 'auto', padding: '4px 9px', fontSize: 11 }}>← scan</Button>
          <div style={{ display: 'flex', gap: 4 }}>
            <Pill tag="Raw" size="sm"/>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <div style={{
            width: 58, height: 80, borderRadius: 6,
            background: `linear-gradient(135deg, #4A2D7A, #8A4DB8)`,
            flexShrink: 0,
            border: `0.5px solid rgba(240,106,168,0.35)`,
          }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.pink, fontWeight: 500, letterSpacing: '0.1em', marginBottom: 3 }}>
              {card.code}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.textHi, lineHeight: 1.2, marginBottom: 3 }}>
              {card.nameEn}
            </div>
            {card.nameJp && (
              <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textMid, marginBottom: 6 }}>
                {card.nameJp}
              </div>
            )}
            <TagStack
              tags={[card.rarity, card.type, card.lang, card.promo && 'Promo'].filter(Boolean)}
              align="flex-start"/>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ padding: '10px 12px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        <StatTile label="HIGHEST" value={fmtMoney(stats.high, currency, fx)} color={T.pink}/>
        <StatTile label="LOWEST" value={fmtMoney(stats.low, currency, fx)} color={T.blue}/>
        <StatTile label="30-DAY TREND" value={stats.trend} color={T.cyan}/>
        <StatTile label="CURRENT PRICE" value={fmtMoney(stats.current, currency, fx)}/>
      </div>

      {/* Raw/Graded toggle */}
      <div style={{ padding: '8px 12px' }}>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 10, padding: 3, display: 'flex',
        }}>
          {['raw', 'graded'].map(m => (
            <div key={m} onClick={() => setMode(m)} style={{
              flex: 1,
              background: mode === m ? T.pink : 'transparent',
              color: mode === m ? T.pinkDark : T.textMid,
              fontSize: 12, padding: 6,
              borderRadius: 7, textAlign: 'center', fontWeight: mode === m ? 500 : 400,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}>{m}</div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderTop: `0.5px solid ${T.border}`, background: T.surface }}>
        {['listing', 'sold', 'chart', 'info'].map(t => (
          <div key={t} onClick={() => setTab(t)} style={{
            flex: 1, textAlign: 'center', padding: '9px 2px',
            fontSize: 11, fontWeight: tab === t ? 500 : 400,
            color: tab === t ? T.pink : T.textMid,
            borderBottom: tab === t ? `2px solid ${T.pink}` : 'none',
            marginBottom: tab === t ? -1 : 0,
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}>{t === 'sold' ? 'Last Sold' : t}</div>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '11px 12px', background: T.bg, minHeight: 200 }}>
        {tab === 'listing' && <ListingsTab mode={mode} currency={currency} fx={fx}/>}
        {tab === 'sold' && <SoldTab mode={mode} currency={currency} fx={fx}/>}
        {tab === 'chart' && <ChartTab mode={mode}/>}
        {tab === 'info' && <InfoTab card={card}/>}

        {/* Japanese buying price CTA */}
        <JpBuyCta/>

        {/* Add to vault */}
        <div style={{ marginTop: 10 }}>
          <Button onClick={() => onAddToVault(card, mode)}>
            + Add to SwibsVault
          </Button>
        </div>
      </div>
    </Screen>
  );
}

function ListingsTab({ mode, currency, fx }) {
  const items = mode === 'raw' ? RAW_LISTINGS : GRADED_COMPANIES;
  if (mode === 'graded') {
    return (
      <div>
        <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.08em', fontWeight: 500, marginBottom: 8 }}>
          BY GRADING COMPANY
        </div>
        {items.map((c, i) => (
          <div key={i} style={{
            background: T.surface, border: `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '10px 11px', marginBottom: 5,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 5,
                background: c.badgeBg, border: c.badgeBorder,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.badgeColor, fontSize: 9, fontWeight: 500,
              }}>{c.name}</div>
              <div>
                <div style={{ fontSize: 12, color: T.textHi, fontWeight: 500 }}>
                  {c.name}
                  {c.extra && <span style={{ color: T.cyan, fontSize: 9, fontWeight: 400, marginLeft: 4 }}>{c.extra}</span>}
                </div>
                <div style={{ fontSize: 9.5, color: T.textLow }}>{c.grades}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T.pink, fontWeight: 500, fontFamily: T.fontMono }}>
              {fmtMoney(c.peak, currency, fx)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {items.map((l, i) => (
        <ListingCard key={i} listing={l} currency={currency} fx={fx} isSold={false}/>
      ))}
    </div>
  );
}

function SoldTab({ mode, currency, fx }) {
  return (
    <div>
      {SOLD_LISTINGS.map((l, i) => (
        <ListingCard key={i} listing={l} currency={currency} fx={fx} isSold={true}/>
      ))}
    </div>
  );
}

function ChartTab({ mode }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {['7D', '30D', '90D', '1Y'].map(r => (
          <div key={r} style={{
            background: r === '30D' ? T.pink : T.surface,
            color: r === '30D' ? T.pinkDark : T.textMid,
            border: r === '30D' ? 'none' : `0.5px solid ${T.border2}`,
            fontSize: 10.5, padding: '4px 9px', borderRadius: 99,
            fontWeight: r === '30D' ? 500 : 400, cursor: 'pointer',
          }}>{r}</div>
        ))}
      </div>
      <svg viewBox="0 0 320 170" width="100%" style={{ background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: 10, padding: 8 }}>
        <line x1="30" y1="30" x2="310" y2="30" stroke={T.border} strokeDasharray="2,3"/>
        <line x1="30" y1="90" x2="310" y2="90" stroke={T.border} strokeDasharray="2,3"/>
        <text x="24" y="34" fontSize="8" fill={T.textDim} textAnchor="end">30k</text>
        <text x="24" y="94" fontSize="8" fill={T.textDim} textAnchor="end">10k</text>
        <path d="M30,120 L60,115 L90,108 L120,100 L150,92 L180,95 L210,82 L240,72 L270,58 L300,42"
          stroke={T.pink} strokeWidth="1.5" fill="none"/>
        <circle cx="300" cy="42" r="3.5" fill={T.pink} stroke="#fff" strokeWidth="0.8"/>
      </svg>
      <div style={{
        marginTop: 12,
        background: 'rgba(79,224,208,0.08)',
        border: `0.5px solid rgba(79,224,208,0.3)`,
        borderRadius: 10, padding: '9px 11px',
      }}>
        <div style={{ fontSize: 11, color: T.cyan, fontWeight: 500, marginBottom: 2 }}>Grading premium</div>
        <div style={{ fontSize: 10.5, color: T.textMid, lineHeight: 1.5 }}>
          PSA 10 sells for <strong style={{ color: T.pink, fontWeight: 500 }}>~7.7×</strong> raw.
        </div>
      </div>
    </div>
  );
}

function InfoTab({ card }) {
  return (
    <div style={{ background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: 11, padding: '12px 13px' }}>
      <Info label="Set code" value={card.code}/>
      <Info label="Name (EN)" value={card.nameEn}/>
      {card.nameJp && <Info label="Name (JP)" value={card.nameJp}/>}
      <Info label="Rarity" value={card.rarity}/>
      <Info label="Language" value={card.lang}/>
      {card.type && <Info label="Type" value={card.type}/>}
      {card.promo && <Info label="Promo" value="Yes"/>}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `0.5px solid ${T.border}`, fontSize: 12 }}>
      <span style={{ color: T.textLow }}>{label}</span>
      <span style={{ color: T.textHi, fontWeight: 500, fontFamily: T.fontMono, fontSize: 11.5 }}>{value}</span>
    </div>
  );
}

function ListingCard({ listing, currency, fx, isSold }) {
  return (
    <div style={{
      background: T.surface, border: `0.5px solid ${T.border}`,
      borderRadius: 10, padding: 9,
      display: 'flex', gap: 9, marginBottom: 7,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: 6,
        background: `linear-gradient(135deg, ${listing.thumbA}, ${listing.thumbB})`,
        flexShrink: 0, position: 'relative',
      }}>
        {isSold && (
          <div style={{
            position: 'absolute', top: 2, left: 2,
            background: T.pink, color: T.pinkDark,
            fontSize: 7, padding: '1px 3px', borderRadius: 2, fontWeight: 500,
          }}>SOLD</div>
        )}
        {!isSold && (
          <div style={{
            position: 'absolute', top: 2, left: 2,
            background: T.cyan, color: '#0A2220',
            fontSize: 7, padding: '1px 3px', borderRadius: 2, fontWeight: 500,
          }}>LIVE</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: T.textHi, lineHeight: 1.35, marginBottom: 3 }}>
          {listing.title}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.pink, fontFamily: T.fontMono }}>
              {fmtMoney(listing.priceTHB, currency, fx)}
            </div>
            <div style={{ fontSize: 9.5, color: T.textLow }}>{listing.meta}</div>
          </div>
          <Pill tag={listing.source}/>
        </div>
      </div>
    </div>
  );
}

function JpBuyCta() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${T.surface2}, ${T.surface})`,
      border: `1px solid ${T.pink}`,
      borderRadius: 12, padding: '11px 13px', marginBottom: 8,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer',
    }} onClick={() => window.open('https://buyee.jp/?referralCode=I1NOV', '_blank')}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.pink }}>See Japanese Buying Price</div>
        <div style={{ fontSize: 10, color: T.textMid }}>Buyee · Mercari · Yuyu-tei buyback</div>
      </div>
      <div style={{
        background: T.pink, color: T.pinkDark,
        fontSize: 16, width: 26, height: 26, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500,
      }}>↗</div>
    </div>
  );
}

// mock data
const RAW_LISTINGS = [
  { title: "Magician's Curtain Overframe PSE mint", priceTHB: 18440, meta: 'listed 2 days', source: 'eBay',
    thumbA: '#4A2D7A', thumbB: '#8A4DB8' },
  { title: '遊戯王 LOCH-JP003 美品 オーバーフレーム', priceTHB: 19280, meta: '¥79,800 · 5d', source: 'Mercari',
    thumbA: '#E0B0E8', thumbB: '#A070B8' },
];
const SOLD_LISTINGS = [
  { title: '遊戯王 LOCH-JP003 プリズマ', priceTHB: 27033, meta: 'sold today', source: 'Mercari',
    thumbA: '#B090D8', thumbB: '#5030A0' },
  { title: "LOCH-JP003 Prismatic Secret", priceTHB: 17222, meta: 'sold 21 Mar', source: 'Yahoo',
    thumbA: '#D0A8E0', thumbB: '#7050A0' },
];
const GRADED_COMPANIES = [
  { name: 'PSA', grades: '10 · 9 · 8 · 12 listings', peak: 142800, badgeBg: '#D52B2B', badgeBorder: 'none', badgeColor: '#fff' },
  { name: 'BGS', grades: 'BL · 9.5 · 9 · 7 listings', peak: 236000, badgeBg: '#1A1A1A', badgeBorder: `0.5px solid ${T.gold}`, badgeColor: T.gold },
  { name: 'ARS', grades: '10 PR · 10 · 9 · 9 listings', peak: 187200, badgeBg: '#0A2940', badgeBorder: `0.5px solid ${T.cyan}`, badgeColor: T.cyan, extra: 'preferred JP' },
  { name: 'CGC', grades: '10 PR · 9.5 · 9 · 5 listings', peak: 118400, badgeBg: '#1A3E75', badgeBorder: 'none', badgeColor: T.cgcBlue },
];

// ============================================================
// SwibsVault - collection manager
// ============================================================
function SwibsVault({ items, currency, setCurrency, fx, onBack, onOpen, onAdd }) {
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('expanded'); // expanded | compact
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  const filtered = items.filter(it => {
    if (filter === 'all') return true;
    if (filter === 'held') return !it.sold;
    if (filter === 'sold') return it.sold;
    if (filter === 'graded') return it.condition !== 'Raw';
    return true;
  });

  const totalValue = items.reduce((s, it) => s + (it.sold || it.current), 0);
  const totalPaid = items.reduce((s, it) => s + it.paid, 0);
  const totalPL = totalValue - totalPaid;
  const plPct = totalPaid > 0 ? ((totalPL / totalPaid) * 100).toFixed(1) : 0;
  const soldCount = items.filter(it => it.sold).length;

  return (
    <Screen>
      {showCurrencyModal && (
        <CurrencyModal
          current={currency}
          onSelect={c => { setCurrency(c); setShowCurrencyModal(false); }}
          onClose={() => setShowCurrencyModal(false)}/>
      )}

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `0.5px solid ${T.border}`, padding: '14px 14px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500, color: T.textHi, lineHeight: 1 }}>SwibsVault</div>
            <div style={{ fontSize: 10, color: T.textLow, marginTop: 3 }}>my collection · {items.length} cards</div>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <div onClick={() => setShowCurrencyModal(true)} style={{
              background: T.surface2, border: `0.5px solid ${T.border2}`,
              borderRadius: 9, padding: '5px 9px',
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: T.pink, fontFamily: T.fontMono }}>{currency}</span>
              <span style={{ fontSize: 9, color: T.textLow }}>▾</span>
            </div>
            <div onClick={onBack} style={{
              width: 30, height: 30, borderRadius: 9, background: T.surface2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: T.textMid, cursor: 'pointer',
            }}>←</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          <StatTile label="VALUE" value={fmtMoney(totalValue, currency, fx)} gradient/>
          <StatTile label="CARDS" value={items.length} sub={soldCount ? `${soldCount} sold` : null}/>
          <StatTile label="P/L" value={`${totalPL >= 0 ? '+' : ''}${fmtMoney(totalPL, currency, fx)}`}
            color={totalPL >= 0 ? T.cyan : T.redLight} sub={`${totalPL >= 0 ? '↑' : '↓'} ${Math.abs(plPct)}%`}/>
        </div>
      </div>

      {/* Filters + view toggle */}
      <div style={{
        padding: '10px 14px', background: T.surface,
        borderBottom: `0.5px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      }}>
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', flex: 1, minWidth: 0 }}>
          {[
            { k: 'all', label: `All · ${items.length}` },
            { k: 'held', label: `Held · ${items.length - soldCount}` },
            { k: 'sold', label: `Sold · ${soldCount}` },
            { k: 'graded', label: `Graded · ${items.filter(i => i.condition !== 'Raw').length}` },
          ].map(f => (
            <div key={f.k} onClick={() => setFilter(f.k)} style={{
              flexShrink: 0,
              background: filter === f.k ? T.pink : T.surface2,
              color: filter === f.k ? T.pinkDark : T.textMid,
              fontSize: 10.5, padding: '5px 10px', borderRadius: 99,
              fontWeight: filter === f.k ? 500 : 400, cursor: 'pointer',
            }}>{f.label}</div>
          ))}
        </div>
        <div style={{
          display: 'flex', background: T.surface2, border: `0.5px solid ${T.border2}`,
          borderRadius: 8, padding: 2, flexShrink: 0,
        }}>
          <div onClick={() => setView('expanded')} style={{
            padding: '4px 8px', borderRadius: 6,
            background: view === 'expanded' ? T.pink : 'transparent',
            cursor: 'pointer',
          }}>
            <svg width="14" height="10" viewBox="0 0 14 10">
              <rect x="0" y="0" width="14" height="3" rx="1" fill={view === 'expanded' ? T.pinkDark : T.textMid}/>
              <rect x="0" y="4" width="14" height="3" rx="1" fill={view === 'expanded' ? T.pinkDark : T.textMid} opacity="0.6"/>
              <rect x="0" y="7" width="14" height="3" rx="1" fill={view === 'expanded' ? T.pinkDark : T.textMid} opacity="0.6"/>
            </svg>
          </div>
          <div onClick={() => setView('compact')} style={{
            padding: '4px 8px', borderRadius: 6,
            background: view === 'compact' ? T.pink : 'transparent',
            cursor: 'pointer',
          }}>
            <svg width="14" height="10" viewBox="0 0 14 10">
              <rect x="0" y="0" width="6" height="4" rx="1" fill={view === 'compact' ? T.pinkDark : T.textMid}/>
              <rect x="8" y="0" width="6" height="4" rx="1" fill={view === 'compact' ? T.pinkDark : T.textMid}/>
              <rect x="0" y="6" width="6" height="4" rx="1" fill={view === 'compact' ? T.pinkDark : T.textMid}/>
              <rect x="8" y="6" width="6" height="4" rx="1" fill={view === 'compact' ? T.pinkDark : T.textMid}/>
            </svg>
          </div>
        </div>
      </div>

      {/* Card list */}
      <div style={{ padding: 12, background: T.bg }}>
        {filtered.map(it =>
          view === 'expanded'
            ? <VaultCardExpanded key={it.id} item={it} currency={currency} fx={fx} onClick={() => onOpen(it)}/>
            : <VaultCardCompact key={it.id} item={it} currency={currency} fx={fx} onClick={() => onOpen(it)}/>
        )}
      </div>

      {/* FAB */}
      <div onClick={onAdd} style={{
        position: 'fixed', bottom: 22, right: 18,
        width: 54, height: 54, borderRadius: '50%',
        background: `linear-gradient(135deg, ${T.pink}, ${T.blue})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: T.pinkDark, fontSize: 28, fontWeight: 500,
        border: `2px solid ${T.bg}`, cursor: 'pointer',
      }}>+</div>
    </Screen>
  );
}

function VaultCardExpanded({ item, currency, fx, onClick }) {
  const isSold = !!item.sold;
  const pl = (item.sold || item.current) - item.paid;
  // eslint-disable-next-line no-unused-vars
  const plPct = item.paid > 0 ? ((pl / item.paid) * 100).toFixed(1) : 0;
  const tags = [
    item.condition,
    item.rarity,
    item.type,
    item.lang,
    item.promo && 'Promo',
  ].filter(Boolean);

  if (isSold) {
    return (
      <div onClick={onClick} style={{
        background: T.surface, border: `0.5px solid ${T.red}`,
        borderRadius: 11, overflow: 'hidden', marginBottom: 8, cursor: 'pointer',
      }}>
        <div style={{
          background: T.red, color: '#fff', padding: '4px 10px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.15em' }}>SOLD</div>
          <div style={{ fontSize: 11, fontWeight: 500, fontFamily: T.fontMono }}>
            {fmtMoney(item.sold, currency, fx)} · {fmtDate(item.soldDate)}
          </div>
        </div>
        <div style={{ padding: 10, display: 'flex', gap: 10 }}>
          <CardThumb item={item} sold/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <CardHeader item={item} muted/>
              </div>
              <TagStack tags={tags}/>
            </div>
            <PriceRow paid={item.paid} sold={item.sold} pl={pl} currency={currency} fx={fx} isSold/>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `0.5px solid ${T.border}`,
      borderRadius: 11, padding: 10,
      display: 'flex', gap: 10, marginBottom: 8, cursor: 'pointer',
    }}>
      <CardThumb item={item}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <CardHeader item={item}/>
          </div>
          <TagStack tags={tags}/>
        </div>
        <PriceRow paid={item.paid} current={item.current} pl={pl} currency={currency} fx={fx}/>
      </div>
    </div>
  );
}

function VaultCardCompact({ item, currency, fx, onClick }) {
  const isSold = !!item.sold;
  const pl = (item.sold || item.current) - item.paid;
  // compact uses abbreviated tag names
  const abbrev = (t) => {
    const m = { 'Overframe PSE': 'PSE', 'Character': 'Char', 'Secret Rare': 'SEC', 'Ultra Rare': 'UR', 'Super Rare': 'SR', 'Prismatic Secret': 'PSe' };
    return m[t] || t;
  };
  const tags = [item.condition, abbrev(item.rarity), item.type && abbrev(item.type), item.lang, item.promo && 'Promo'].filter(Boolean);

  if (isSold) {
    return (
      <div onClick={onClick} style={{
        background: T.surface, border: `0.5px solid ${T.red}`,
        borderRadius: 9, overflow: 'hidden', marginBottom: 5, cursor: 'pointer',
      }}>
        <div style={{
          background: T.red, color: '#fff', padding: '2px 9px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.15em' }}>SOLD</div>
          <div style={{ fontSize: 10, fontWeight: 500, fontFamily: T.fontMono }}>
            {fmtMoney(item.sold, currency, fx)} · {fmtDate(item.soldDate)}
          </div>
        </div>
        <div style={{ padding: '7px 9px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <CardThumb item={item} compact sold/>
          <CompactRow item={item} tags={tags} pl={pl} currency={currency} fx={fx} muted/>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onClick} style={{
      background: T.surface, border: `0.5px solid ${T.border}`,
      borderRadius: 9, padding: '7px 9px',
      display: 'flex', gap: 9, marginBottom: 5, alignItems: 'center',
      cursor: 'pointer',
    }}>
      <CardThumb item={item} compact/>
      <CompactRow item={item} tags={tags} pl={pl} currency={currency} fx={fx}/>
    </div>
  );
}

function CompactRow({ item, tags, pl, currency, fx, muted }) {
  const isSold = !!item.sold;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 6 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 9, color: muted ? T.textLow : T.pink, fontWeight: 500, fontFamily: T.fontMono }}>{item.code}</div>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: muted ? T.textMid : T.textHi, lineHeight: 1.2 }}>{item.nameEn}</div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 150 }}>
          {tags.map((t, i) => <Pill key={i} tag={t} size="sm"/>)}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: T.fontMono }}>
        <span style={{ color: T.textLow }}>{fmtMoney(item.paid, currency, fx)}</span>
        <span style={{ color: isSold ? T.redLight : T.pink }}>{fmtMoney(item.sold || item.current, currency, fx)}</span>
        <span style={{ color: pl >= 0 ? T.cyan : T.redLight }}>{pl >= 0 ? '+' : ''}{fmtMoney(pl, currency, fx)}</span>
      </div>
    </div>
  );
}

function CardThumb({ item, compact = false, sold = false }) {
  const w = compact ? 40 : 62;
  const h = compact ? 56 : 86;
  const gradMap = {
    ygo: ['#4A2D7A', '#8A4DB8'],
    op: ['#F0906A', '#C86040'],
  };
  const [a, b] = gradMap[item.tcg] || ['#4A2D7A', '#8A4DB8'];
  const hasGrade = item.condition !== 'Raw';
  const gradeLabel = item.condition;

  const style = {
    width: w, height: h,
    borderRadius: compact ? 4 : 6,
    background: sold ? '#2A2A2A' : `linear-gradient(135deg, ${a}, ${b})`,
    flexShrink: 0, position: 'relative', overflow: 'hidden',
    filter: sold ? 'grayscale(1) brightness(0.6)' : 'none',
    border: hasGrade ? `${compact ? 1.5 : 2}px solid ${gradeBorderColor(item.gradingCompany)}` : 'none',
  };

  return (
    <div style={style}>
      {hasGrade && !sold && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: gradeBgColor(item.gradingCompany),
          color: gradeTextColor(item.gradingCompany),
          fontSize: compact ? 5 : 6,
          textAlign: 'center', padding: 1, fontWeight: 500,
        }}>{gradeLabel}</div>
      )}
    </div>
  );
}

function gradeBorderColor(co) {
  return { PSA: T.red, BGS: T.gold, ARS: T.cyan, CGC: T.cgcBlue }[co] || T.red;
}
function gradeBgColor(co) {
  return { PSA: T.red, BGS: '#1A1A1A', ARS: '#0A2940', CGC: '#1A3E75' }[co] || T.red;
}
function gradeTextColor(co) {
  return { PSA: '#fff', BGS: T.gold, ARS: T.cyan, CGC: T.cgcBlue }[co] || '#fff';
}

function CardHeader({ item, muted = false }) {
  return (
    <>
      <div style={{ fontSize: 9, color: muted ? T.textLow : T.pink, fontWeight: 500, fontFamily: T.fontMono, marginBottom: 2 }}>
        {item.code}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: muted ? T.textMid : T.textHi, lineHeight: 1.2, marginBottom: 1 }}>
        {item.nameEn}
      </div>
      {item.nameJp && (
        <div style={{ fontSize: 9, color: T.textLow, fontFamily: T.fontMono }}>{item.nameJp}</div>
      )}
    </>
  );
}

function PriceRow({ paid, current, sold, pl, currency, fx, isSold = false }) {
  const cols = [
    { label: 'PAID', value: fmtMoney(paid, currency, fx), color: isSold ? T.textMid : T.textHi, labelColor: T.textLow },
    isSold
      ? { label: 'SOLD FOR', value: fmtMoney(sold, currency, fx), color: T.redLight, labelColor: T.redLight }
      : { label: 'CURRENT', value: fmtMoney(current, currency, fx), color: T.pink, labelColor: T.textLow },
    { label: 'P/L', value: `${pl >= 0 ? '+' : ''}${fmtMoney(pl, currency, fx)}`, color: pl >= 0 ? T.cyan : T.redLight, labelColor: pl >= 0 ? T.cyan : T.redLight },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
      {cols.map((c, i) => (
        <div key={i} style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, color: c.labelColor, letterSpacing: '0.05em', fontWeight: 500 }}>{c.label}</div>
          <div style={{ fontSize: 12.5, color: c.color, fontWeight: 500, marginTop: 1, fontFamily: T.fontMono }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
}

// ============================================================
// Currency modal
// ============================================================
function CurrencyModal({ current, onSelect, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,6,15,0.72)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      paddingBottom: 10, zIndex: 50,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'calc(100% - 20px)', maxWidth: 420, margin: '0 10px',
        background: T.surface, border: `0.5px solid ${T.border}`,
        borderRadius: 18, padding: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.textHi }}>Display currency</div>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 2 }}>
              applies to paid · current · sold · P/L
            </div>
          </div>
          <div onClick={onClose} style={{
            width: 26, height: 26, borderRadius: '50%', background: T.surface2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textMid, fontSize: 13, cursor: 'pointer',
          }}>×</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {Object.entries(CURRENCIES).map(([code, c]) => {
            const isActive = code === current;
            return (
              <div key={code} onClick={() => onSelect(code)} style={{
                background: isActive ? 'rgba(240,106,168,0.12)' : T.surface2,
                border: isActive ? `1.5px solid ${T.pink}` : `0.5px solid ${T.border}`,
                borderRadius: 11, padding: '10px 11px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: isActive ? T.pink : T.textHi, fontWeight: 500, fontFamily: T.fontMono }}>
                    {code}
                  </div>
                  <div style={{ fontSize: 9.5, color: T.textMid }}>{c.name} · {c.symbol}</div>
                </div>
                {isActive && (
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: T.pink, color: T.pinkDark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 500,
                  }}>✓</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Add to Vault form
// ============================================================
function AddToVault({ card, currency, fx, onSave, onCancel }) {
  const [condition, setCondition] = useState('raw');
  const [company, setCompany] = useState('PSA');
  const [grade, setGrade] = useState('10');
  const [certNumber, setCertNumber] = useState('');
  const [paid, setPaid] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const isGraded = condition === 'graded';
  const conditionTag = isGraded ? `${company} ${grade}` : 'Raw';
  const tags = [
    conditionTag,
    card.rarity,
    card.type,
    card.lang,
    card.promo && 'Promo',
  ].filter(Boolean);

  function save() {
    const newItem = {
      id: 'v' + Date.now(),
      code: card.code,
      nameEn: card.nameEn,
      nameJp: card.nameJp,
      tcg: card.tcg,
      lang: card.lang,
      condition: conditionTag,
      rarity: card.rarity,
      type: card.type,
      promo: card.promo,
      paid: parseFloat(paid.replace(/,/g, '')) || 0,
      current: card.currentPrice || 0,
      sold: null,
      purchaseDate: date,
      notes,
      certNumber: isGraded ? certNumber : null,
      gradingCompany: isGraded ? company : null,
      grade: isGraded ? grade : null,
    };
    onSave(newItem);
  }

  return (
    <Screen>
      <div style={{ background: T.surface, borderBottom: `0.5px solid ${T.border}`, padding: '11px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <Button variant="outline" onClick={onCancel} style={{ width: 'auto', padding: '4px 9px', fontSize: 10.5 }}>× cancel</Button>
          <Pill tag="Add to vault"/>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 50, height: 70, borderRadius: 6,
            background: `linear-gradient(135deg, #4A2D7A, #8A4DB8)`,
            flexShrink: 0,
            border: isGraded ? `2px solid ${gradeBorderColor(company)}` : `0.5px solid rgba(240,106,168,0.35)`,
            position: 'relative', overflow: 'hidden',
          }}>
            {isGraded && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                background: gradeBgColor(company),
                color: gradeTextColor(company),
                fontSize: 6, textAlign: 'center', padding: 1, fontWeight: 500,
              }}>{company} {grade}</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 9.5, color: T.pink, fontWeight: 500, marginBottom: 2 }}>{card.code}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: T.textHi, marginBottom: 4 }}>{card.nameEn}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {tags.map((t, i) => <Pill key={i} tag={t}/>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 14px 20px' }}>
        <Label>CARD CONDITION</Label>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 11, padding: 3, display: 'flex', marginBottom: 14,
        }}>
          {['raw', 'graded'].map(m => (
            <div key={m} onClick={() => setCondition(m)} style={{
              flex: 1,
              background: condition === m ? T.pink : 'transparent',
              color: condition === m ? T.pinkDark : T.textMid,
              fontSize: 12, padding: 8, borderRadius: 8, textAlign: 'center',
              fontWeight: condition === m ? 500 : 400, cursor: 'pointer',
              textTransform: 'capitalize',
            }}>{m}</div>
          ))}
        </div>

        {isGraded && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <Label>COMPANY</Label>
                <select value={company} onChange={e => setCompany(e.target.value)}
                  style={selectStyle}>
                  {['PSA', 'BGS', 'ARS', 'CGC'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>GRADE</Label>
                <select value={grade} onChange={e => setGrade(e.target.value)}
                  style={selectStyle}>
                  {['10', '9.5', '9', '8', '7'].map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <Label>CERTIFICATION NUMBER</Label>
            <div style={{
              background: T.surface, border: `0.5px solid ${T.border}`,
              borderRadius: 10, padding: '9px 12px', marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ color: T.textLow, fontSize: 13 }}>#</div>
              <input value={certNumber} onChange={e => setCertNumber(e.target.value)}
                placeholder="78142556"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, color: T.textHi, fontFamily: T.fontMono,
                  letterSpacing: '0.03em',
                }}/>
            </div>
            <div style={{ fontSize: 9.5, color: T.textDim, marginBottom: 14 }}>
              cert # on slab label · used for slab verification
            </div>
          </>
        )}

        <Label>PURCHASE PRICE · {currency}</Label>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 11, padding: '11px 13px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <div style={{ fontSize: 15, color: T.textLow, fontFamily: T.fontMono, fontWeight: 500 }}>
              {CURRENCIES[currency].symbol}
            </div>
            <input value={paid} onChange={e => setPaid(e.target.value)}
              placeholder="0"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 22, fontWeight: 500, color: T.textHi,
                fontFamily: T.fontMono, letterSpacing: '0.02em',
              }}/>
          </div>
          <div style={{ fontSize: 9.5, color: T.textDim, marginTop: 4 }}>
            what you paid — stored as cost basis
          </div>
        </div>

        <Label>PURCHASE DATE</Label>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 11, padding: '10px 13px', marginBottom: 14,
        }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontSize: 13, color: T.textHi, fontFamily: 'inherit',
              colorScheme: 'dark',
            }}/>
        </div>

        <Label>NOTES (OPTIONAL)</Label>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 11, padding: '10px 13px', marginBottom: 18,
        }}>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder='e.g. "MBK mall Sunday market"'
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontSize: 13, color: T.textHi,
            }}/>
        </div>

        <Button onClick={save} disabled={!paid}>
          Save to SwibsVault →
        </Button>
      </div>
    </Screen>
  );
}

const selectStyle = {
  background: T.surface, border: `0.5px solid ${T.border}`,
  borderRadius: 10, padding: '9px 11px',
  fontSize: 12, color: T.textHi,
  width: '100%', outline: 'none', cursor: 'pointer',
  colorScheme: 'dark',
};

function Label({ children }) {
  return (
    <div style={{
      fontSize: 10, color: T.textLow, letterSpacing: '0.08em',
      fontWeight: 500, marginBottom: 7,
    }}>{children}</div>
  );
}

// ============================================================
// Card detail (for sold state)
// ============================================================
function CardDetail({ item, currency, fx, onBack, onMarkSold, onUndoSold }) {
  const isSold = !!item.sold;
  const pl = (item.sold || item.current) - item.paid;
  const plPct = item.paid > 0 ? ((pl / item.paid) * 100).toFixed(1) : 0;
  const tags = [item.condition, item.rarity, item.type, item.lang, item.promo && 'Promo'].filter(Boolean);

  return (
    <Screen>
      {isSold && (
        <div style={{
          background: T.red, padding: '8px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', letterSpacing: '0.2em' }}>SOLD</div>
            <div style={{ width: '0.5px', height: 14, background: 'rgba(255,255,255,0.4)' }}/>
            <div style={{ fontSize: 11, color: '#fff', fontWeight: 500, fontFamily: T.fontMono }}>{fmtDate(item.soldDate)} 2026</div>
          </div>
          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500, fontFamily: T.fontMono }}>
            {fmtMoney(item.sold, currency, fx)}
          </div>
        </div>
      )}

      <div style={{ background: T.surface, borderBottom: `0.5px solid ${T.border}`, padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
          <Button variant="outline" onClick={onBack} style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }}>← vault</Button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ transform: 'scale(1.3)', transformOrigin: 'top left', marginRight: 18 }}>
            <CardThumb item={item} sold={isSold}/>
          </div>
          <div style={{ flex: 1, marginLeft: 10 }}>
            <div style={{ fontFamily: T.fontMono, fontSize: 10, color: isSold ? T.textLow : T.pink, fontWeight: 500, letterSpacing: '0.1em', marginBottom: 4 }}>
              {item.code}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: isSold ? T.textMid : T.textHi, lineHeight: 1.15, marginBottom: 3 }}>
              {item.nameEn}
            </div>
            {item.nameJp && (
              <div style={{ fontFamily: T.fontMono, fontSize: 10.5, color: T.textLow, marginBottom: 8 }}>{item.nameJp}</div>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {tags.map((t, i) => <Pill key={i} tag={t}/>)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: 14, background: T.bg }}>
        <Label>{isSold ? `REALIZED · ${currency}` : `POSITION · ${currency}`}</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: 10, padding: '11px 10px' }}>
            <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.05em', fontWeight: 500, marginBottom: 3 }}>PAID</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: isSold ? T.textMid : T.textHi, fontFamily: T.fontMono }}>
              {fmtMoney(item.paid, currency, fx)}
            </div>
          </div>
          <div style={{
            background: T.surface,
            border: isSold ? `1.5px solid ${T.red}` : `0.5px solid ${T.border}`,
            borderRadius: 10, padding: '11px 10px',
          }}>
            <div style={{ fontSize: 9, color: isSold ? T.redLight : T.textLow, letterSpacing: '0.05em', fontWeight: 500, marginBottom: 3 }}>
              {isSold ? 'SOLD FOR' : 'CURRENT'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: isSold ? T.redLight : T.pink, fontFamily: T.fontMono }}>
              {fmtMoney(item.sold || item.current, currency, fx)}
            </div>
          </div>
          <div style={{
            background: 'rgba(79,224,208,0.1)',
            border: `0.5px solid rgba(79,224,208,0.35)`,
            borderRadius: 10, padding: '11px 10px',
          }}>
            <div style={{ fontSize: 9, color: T.cyan, letterSpacing: '0.05em', fontWeight: 500, marginBottom: 3 }}>
              {isSold ? 'REALIZED' : 'P/L'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: pl >= 0 ? T.cyan : T.redLight, fontFamily: T.fontMono }}>
              {pl >= 0 ? '+' : ''}{fmtMoney(pl, currency, fx)}
            </div>
            <div style={{ fontSize: 9, color: pl >= 0 ? T.cyan : T.redLight, opacity: 0.75, marginTop: 2 }}>
              {pl >= 0 ? '+' : ''}{plPct}%
            </div>
          </div>
        </div>

        {item.gradingCompany && (
          <div style={{ background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: 11, padding: '12px 13px', marginBottom: 14 }}>
            <Label>SLAB DETAILS</Label>
            <Info label="Grading company" value={item.gradingCompany}/>
            <Info label="Grade" value={item.grade}/>
            {item.certNumber && <Info label="Cert #" value={item.certNumber}/>}
          </div>
        )}

        {isSold ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" onClick={() => onUndoSold(item)} style={{ flex: 1 }}>Undo sold</Button>
            <Button variant="surface" onClick={onBack} style={{ flex: 1 }}>Edit</Button>
            <Button onClick={onBack} style={{ flex: 1 }}>Scan new</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => onMarkSold(item)} style={{ flex: 1 }}>Mark as sold</Button>
            <Button variant="surface" onClick={onBack} style={{ flex: 1 }}>See prices →</Button>
          </div>
        )}
      </div>
    </Screen>
  );
}

// ============================================================
// Mark as sold form
// ============================================================
function MarkAsSold({ item, currency, fx, onSave, onCancel }) {
  const [soldPrice, setSoldPrice] = useState(String(item.current));
  const [soldDate, setSoldDate] = useState(new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = useState('SwibSwap');

  const soldNum = parseFloat(soldPrice.replace(/,/g, '')) || 0;
  const profit = soldNum - item.paid;
  const profitPct = item.paid > 0 ? ((profit / item.paid) * 100).toFixed(1) : 0;

  return (
    <Screen>
      <div style={{ background: T.surface, borderBottom: `0.5px solid ${T.border}`, padding: '11px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
          <Button variant="outline" onClick={onCancel} style={{ width: 'auto', padding: '4px 9px', fontSize: 10.5 }}>× cancel</Button>
          <Pill tag="Mark sold" size="md"/>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <CardThumb item={item}/>
          <div style={{ flex: 1 }}>
            <CardHeader item={item}/>
            <div style={{ fontSize: 10.5, color: T.textLow, marginTop: 3 }}>
              paid {fmtMoney(item.paid, currency, fx)} · market ~{fmtMoney(item.current, currency, fx)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 14px 20px' }}>
        <Label>SOLD PRICE · {currency}</Label>
        <div style={{
          background: T.surface, border: `1.5px solid ${T.red}`,
          borderRadius: 11, padding: '12px 13px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <div style={{ fontSize: 16, color: T.textLow, fontFamily: T.fontMono, fontWeight: 500 }}>
              {CURRENCIES[currency].symbol}
            </div>
            <input value={soldPrice} onChange={e => setSoldPrice(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 26, fontWeight: 500, color: T.redLight, fontFamily: T.fontMono,
              }}/>
          </div>
        </div>

        <Label>SOLD DATE</Label>
        <div style={{
          background: T.surface, border: `0.5px solid ${T.border}`,
          borderRadius: 11, padding: '10px 13px', marginBottom: 16,
        }}>
          <input type="date" value={soldDate} onChange={e => setSoldDate(e.target.value)}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontSize: 13, color: T.textHi, colorScheme: 'dark',
            }}/>
        </div>

        <Label>SOLD VIA</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
          {['SwibSwap', 'Mercari', 'eBay', 'Yahoo', 'In person', 'Other'].map(c => (
            <div key={c} onClick={() => setChannel(c)} style={{
              background: channel === c ? T.pink : T.surface,
              color: channel === c ? T.pinkDark : T.textMid,
              border: channel === c ? 'none' : `0.5px solid ${T.border}`,
              borderRadius: 9, padding: '7px 5px', textAlign: 'center',
              fontSize: 11, fontWeight: channel === c ? 500 : 400, cursor: 'pointer',
            }}>{c}</div>
          ))}
        </div>

        <div style={{
          background: 'rgba(79,224,208,0.1)',
          border: `0.5px solid rgba(79,224,208,0.35)`,
          borderRadius: 11, padding: '12px 13px', marginBottom: 14,
        }}>
          <Info label="Paid" value={fmtMoney(item.paid, currency, fx)}/>
          <Info label="Sold for" value={fmtMoney(soldNum, currency, fx)}/>
          <div style={{ height: '0.5px', background: 'rgba(79,224,208,0.3)', margin: '6px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: 12, color: T.cyan, fontWeight: 500 }}>Profit</span>
            <span style={{ fontSize: 15, color: profit >= 0 ? T.cyan : T.redLight, fontWeight: 500, fontFamily: T.fontMono }}>
              {profit >= 0 ? '+' : ''}{fmtMoney(profit, currency, fx)}
              <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 4 }}>{profit >= 0 ? '+' : ''}{profitPct}%</span>
            </span>
          </div>
        </div>

        <Button variant="danger" onClick={() => onSave({ ...item, sold: soldNum, soldDate, soldVia: channel })}>
          CONFIRM SOLD
        </Button>
      </div>
    </Screen>
  );
}

// ============================================================
// Settings
// ============================================================
function Settings({ onBack }) {
  return (
    <Screen>
      <div style={{
        background: T.surface, borderBottom: `0.5px solid ${T.border}`,
        padding: '14px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: T.textHi }}>Settings</div>
        <div onClick={onBack} style={{ fontSize: 13, color: T.pink, fontWeight: 500, cursor: 'pointer' }}>done</div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: T.surface, borderBottom: `0.5px solid ${T.border}` }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: `linear-gradient(135deg, ${T.pink}, ${T.blue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.pinkDark, fontWeight: 500, fontSize: 15,
        }}>B</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: T.textHi }}>BoBoBoA</div>
          <div style={{ fontSize: 10.5, color: T.textLow }}>Pro yearly · renews 15 Jun 2026</div>
        </div>
        <div style={{ fontSize: 16, color: T.textMid }}>›</div>
      </div>

      <Section title="ACCOUNT">
        <Row label="Account"/>
        <Row label="Subscription" value="active" valueColor={T.cyan}/>
        <Row label="Notifications"/>
        <Row label="Appearance" value="dark"/>
      </Section>

      <Section title="LEGAL">
        <Row label="Terms of service"/>
        <Row label="Privacy policy"/>
        <Row label="Data sources"/>
        <Row label="Restore purchase"/>
        <Row label="Delete my account" color={T.pink}/>
      </Section>

      <Section title="ABOUT">
        <Row label="Version" value="1.0.0 build 42" mono/>
        <Row label="Developer" value="I1NOV" valueColor={T.pink}/>
        <Row label="Contact support"/>
        <Row label="Rate on App Store"/>
      </Section>

      <div style={{ textAlign: 'center', padding: '22px 0 10px' }}>
        <div style={{ fontSize: 10.5, color: T.textDim, letterSpacing: '0.1em' }}>
          BoBoa Scanner · by I1NOV
        </div>
        <div style={{ fontSize: 9, color: '#4A4C6A', marginTop: 3 }}>
          © 2026 · made in Bangkok
        </div>
      </div>
    </Screen>
  );
}

function Section({ title, children }) {
  return (
    <>
      <div style={{
        padding: '16px 16px 6px',
        fontSize: 9.5, color: T.textDim,
        fontWeight: 500, letterSpacing: '0.1em',
      }}>{title}</div>
      <div style={{ background: T.bg }}>
        {children}
      </div>
    </>
  );
}

function Row({ label, value, valueColor = T.textMid, color = T.textHi, mono = false }) {
  return (
    <div style={{
      padding: '11px 16px',
      borderBottom: `0.5px solid ${T.surface}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer',
    }}>
      <span style={{ fontSize: 13, color }}>{label}</span>
      {value
        ? <span style={{ fontSize: 11, color: valueColor, fontFamily: mono ? T.fontMono : 'inherit' }}>{value}</span>
        : <span style={{ fontSize: 14, color: T.textDim }}>›</span>}
    </div>
  );
}

// ============================================================
// Root app
// ============================================================
export default function App() {
  const [screen, setScreen] = useState('splash');
  const [tcg, setTcg] = useState(null);
  const [lang, setLang] = useState(null);
  const [scannedCard, setScannedCard] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [vault, setVault] = useState(MOCK_VAULT);
  const [currentVaultItem, setCurrentVaultItem] = useState(null);
  const [currency, setCurrency] = useState('THB');
  const fx = useFxRates();

  const screens = {
    splash: <Splash onDone={() => setScreen('signin')}/>,
    signin: <SignIn onDone={() => setScreen('tcg')}/>,
    tcg: <TcgPicker onDone={({ tcg, lang }) => {
      setTcg(tcg); setLang(lang); setScreen('scanner');
    }}/>,
    scanner: <Scanner tcg={tcg} lang={lang}
      onBack={() => setScreen('tcg')}
      onCapture={(img) => { setCapturedImage(img); setScreen('extracting'); }}/>,
    extracting: <Extracting imageData={capturedImage} tcg={tcg} lang={lang}
      onDone={(card) => { setScannedCard(card); setScreen('pricing'); }}
      onFail={() => setScreen('scanner')}/>,
    pricing: <Pricing card={scannedCard || {}} currency={currency} fx={fx}
      onBack={() => setScreen('scanner')}
      onAddToVault={(card, mode) => setScreen('addToVault')}/>,
    addToVault: <AddToVault card={scannedCard || {}} currency={currency} fx={fx}
      onSave={(item) => { setVault([...vault, item]); setScreen('vault'); }}
      onCancel={() => setScreen('pricing')}/>,
    vault: <SwibsVault items={vault} currency={currency} setCurrency={setCurrency} fx={fx}
      onBack={() => setScreen('tcg')}
      onOpen={(it) => { setCurrentVaultItem(it); setScreen('detail'); }}
      onAdd={() => setScreen('tcg')}/>,
    detail: <CardDetail item={currentVaultItem} currency={currency} fx={fx}
      onBack={() => setScreen('vault')}
      onMarkSold={() => setScreen('markSold')}
      onUndoSold={(item) => {
        const updated = { ...item, sold: null, soldDate: null };
        setVault(vault.map(v => v.id === item.id ? updated : v));
        setCurrentVaultItem(updated);
      }}/>,
    markSold: <MarkAsSold item={currentVaultItem} currency={currency} fx={fx}
      onSave={(updated) => {
        setVault(vault.map(v => v.id === updated.id ? updated : v));
        setCurrentVaultItem(updated);
        setScreen('detail');
      }}
      onCancel={() => setScreen('detail')}/>,
    settings: <Settings onBack={() => setScreen('vault')}/>,
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', minHeight: '100vh', background: T.bg, position: 'relative' }}>
      {screens[screen] || screens.splash}
      {/* Global nav - visible on vault/settings/pricing */}
      {['vault', 'settings', 'pricing'].includes(screen) && (
        <NavBar current={screen} onNav={setScreen}/>
      )}
    </div>
  );
}

function NavBar({ current, onNav }) {
  const items = [
    { k: 'tcg', label: 'Scan', icon: '⬢' },
    { k: 'vault', label: 'Vault', icon: '◰' },
    { k: 'settings', label: 'Settings', icon: '⚙' },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      maxWidth: 440, margin: '0 auto',
      background: T.surface, borderTop: `0.5px solid ${T.border}`,
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map(it => (
        <div key={it.k} onClick={() => onNav(it.k)} style={{
          flex: 1, textAlign: 'center', padding: '12px 0',
          cursor: 'pointer',
          color: current === it.k ? T.pink : T.textLow,
        }}>
          <div style={{ fontSize: 18 }}>{it.icon}</div>
          <div style={{ fontSize: 10, marginTop: 2 }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
