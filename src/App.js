// SwibScan v2 — rebuilt with Tailwind + TanStack Query.
// Blueprint: stitch_sws_ecosystem_ui_blueprint

import React, { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { firebaseEnabled } from './firebase';
import { Screen } from './components/ui/Screen';
import { TopBar } from './components/layout/TopBar';
import { BottomNav } from './components/layout/BottomNav';
import SignIn from './screens/SignIn';
import ScanScreen from './screens/v2/ScanScreen';
import ScanResultScreen from './screens/v2/ScanResultScreen';
import VaultScreen from './screens/v2/VaultScreen';
import ProfileScreen from './screens/v2/ProfileScreen';
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  const { user, loading, getIdToken } = useAuth();
  const [tab, setTab] = useState('scan');
  const [scanView, setScanView] = useState(null); // { image, result }

  // Restore persisted currency.
  const [currency, setCurrency] = useState(() => {
    try { return localStorage.getItem('sws_currency') || 'USD'; } catch { return 'USD'; }
  });
  const handleCurrencyChange = (next) => {
    setCurrency(next);
    try { localStorage.setItem('sws_currency', next); } catch {}
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  if (loading) {
    return (
      <Screen className="flex items-center justify-center">
        <div className="animate-pulse text-primary font-display text-headline-lg">SwibScan</div>
      </Screen>
    );
  }

  // Allow offline exploration if Firebase is not configured.
  if (firebaseEnabled && !user) {
    return <SignIn onSignedIn={() => setTab('scan')} />;
  }

  // Full-screen scan result overlay.
  if (scanView) {
    return (
      <Screen>
        <ScanResultScreen
          key={scanView.image || 'result'}
          user={user}
          getToken={getIdToken}
          image={scanView.image}
          result={scanView.result}
          currency={currency}
          game={scanView.result?.game || 'op'}
          onBack={() => setScanView(null)}
          onAdded={() => {
            setScanView(null);
            setTab('vault');
          }}
        />
      </Screen>
    );
  }

  const renderTab = () => {
    switch (tab) {
      case 'scan':
        return (
          <ScanScreen
            user={user}
            onResult={(payload) => setScanView(payload)}
          />
        );
      case 'vault':
        return (
          <VaultScreen
            user={user}
            getToken={getIdToken}
            currency={currency}
            onTabChange={setTab}
            onRescan={(item) =>
              setScanView({
                image: item.image,
                result: {
                  card: {
                    code: item.code,
                    name: item.nameEn || item.name,
                    nameEn: item.nameEn || item.name,
                    rarity: item.rarity,
                    lang: item.language || 'EN',
                    language: item.language || 'EN',
                    condition: item.condition,
                    setName: item.setName,
                    type: item.type,
                  },
                  game: item.type || 'op',
                },
              })
            }
          />
        );
      case 'settings':
        return (
          <ProfileScreen
            user={user}
            getToken={getIdToken}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      <Screen>
        <TopBar user={user} />

        {/* Scrollable content area between the fixed header and bottom nav */}
        <main className="fixed inset-x-0 top-16 bottom-[72px] overflow-y-scroll">
          <div key={tab} className="min-h-full animate-fade-up">
            {renderTab()}
          </div>
        </main>

        <BottomNav active={tab} onChange={setTab} />
      </Screen>
    </ToastProvider>
  );
}
