// BoBoa Scanner / SwibSwap v13 — root App container.
// Routes between SignIn / Scanner / Vault / Settings based on auth state.
// FX rates fetched at boot from Frankfurter (free, no auth).

import { apiUrl } from './api';
import React, { useEffect, useState } from 'react';
import { T, SZ, DEFAULT_FX } from './theme';
import { Screen, Spinner } from './components';
import { useAuth } from './auth';
import { firebaseEnabled } from './firebase';
import SignIn from './screens/SignIn';
import Scanner from './screens/Scanner';
import Vault from './screens/Vault';
import Market from './screens/Market';
import Settings from './screens/Settings';
import Logo from './Logo';

// Market hidden for now — code remains; uncomment when ready to re-launch.
const TABS = [
  { key: 'scan',     label: 'Scan' },
  { key: 'vault',    label: 'Vault' },
  // { key: 'market',   label: 'Market' },
  { key: 'settings', label: 'Settings' },
];

export default function App() {
  const { user, loading, getIdToken } = useAuth();
  const [tab, setTab] = useState('scan');
  const [currency, setCurrency] = useState('THB');
  const [currency2, setCurrency2] = useState('USD');
  const [fx, setFx] = useState(DEFAULT_FX);

  // Restore persisted currency choices.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('swib_currency');
      const saved2 = window.localStorage.getItem('swib_currency2');
      if (saved && saved in DEFAULT_FX) setCurrency(saved);
      if (saved2 && saved2 in DEFAULT_FX) setCurrency2(saved2);
    } catch { /* ignore */ }
  }, []);

  // Persist currency choices.
  useEffect(() => {
    try { window.localStorage.setItem('swib_currency', currency); } catch { /* ignore */ }
  }, [currency]);
  useEffect(() => {
    try { window.localStorage.setItem('swib_currency2', currency2); } catch { /* ignore */ }
  }, [currency2]);

  // FX rates on boot — via our /api/fx proxy (Frankfurter blocks browser CORS).
  useEffect(() => {
    fetch(apiUrl('/fx'))
      .then((r) => r.json())
      .then((data) => {
        if (data && data.rates) setFx({ THB: 1, ...data.rates });
      })
      .catch(() => { /* keep defaults from theme.js */ });
  }, []);

  if (loading) {
    return (
      <Screen style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={28} />
      </Screen>
    );
  }

  // If Firebase isn't configured, skip auth and let the user explore in offline mode.
  if (firebaseEnabled && !user) {
    return <SignIn onSignedIn={() => setTab('scan')} />;
  }

  return (
    <Screen>
      <TopBar />
      <div style={{ paddingTop: 56, paddingBottom: 72 }}>
        {tab === 'scan' && (
          <Scanner
            user={user}
            getIdToken={getIdToken}
            currency={currency}
            currency2={currency2}
            fx={fx}
          />
        )}
        {tab === 'vault' && <Vault user={user} currency={currency} fx={fx} />}
        {tab === 'market' && <Market user={user} currency={currency} fx={fx} />}
        {tab === 'settings' && (
          <Settings
            user={user}
            currency={currency}
            currency2={currency2}
            onCurrencyChange={setCurrency}
            onCurrency2Change={setCurrency2}
            fx={fx}
          />
        )}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </Screen>
  );
}

function TopBar() {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        background: 'rgba(10, 15, 46, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <Logo height={26} />
    </header>
  );
}

function TabBar({ active, onChange }) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(10, 15, 46, 0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: `1px solid ${T.border}`,
        display: 'flex',
        zIndex: 10,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              padding: '16px 0 14px',
              background: 'transparent',
              border: 'none',
              borderTop: isActive ? `2px solid ${T.cyan}` : '2px solid transparent',
              color: isActive ? T.cyan : T.textLow,
              fontSize: SZ.sm,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              fontFamily: T.fontDisplay,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transition: 'color 0.2s, border-color 0.2s',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
