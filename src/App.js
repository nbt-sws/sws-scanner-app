// SwibScan v2 — rebuilt with Tailwind + TanStack Query.
// Blueprint: stitch_sws_ecosystem_ui_blueprint

import React, { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { firebaseEnabled } from './firebase';
import { Screen, ScrollView } from './components/ui/Screen';
import { TopBar } from './components/layout/TopBar';
import { BottomNav } from './components/layout/BottomNav';
import SignIn from './screens/SignIn';
import ScanScreen from './screens/v2/ScanScreen';
import ScanResultScreen from './screens/v2/ScanResultScreen';
import VaultScreen from './screens/v2/VaultScreen';
import ActivityScreen from './screens/v2/ActivityScreen';
import ProfileScreen from './screens/v2/ProfileScreen';

export default function App() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('scan');
  const [scanView, setScanView] = useState(null); // { image, result }

  // Restore persisted currency.
  const [currency] = useState('USD');

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <div className="animate-pulse text-primary font-display text-headline-lg">SwibScan</div>
      </Screen>
    );
  }

  // Allow offline exploration if Firebase is not configured.
  if (firebaseEnabled && !user) {
    return <SignIn onSignedIn={() => setTab('scan')} />;
  }

  const renderContent = () => {
    if (scanView) {
      return (
        <ScanResultScreen
          user={user}
          image={scanView.image}
          result={scanView.result}
          onBack={() => setScanView(null)}
          onAdded={() => {
            setScanView(null);
            setTab('vault');
          }}
        />
      );
    }

    switch (tab) {
      case 'scan':
        return (
          <ScanScreen
            user={user}
            onResult={(payload) => setScanView(payload)}
          />
        );
      case 'vault':
        return <VaultScreen user={user} currency={currency} />;
      case 'activity':
        return <ActivityScreen />;
      case 'profile':
        return <ProfileScreen user={user} />;
      default:
        return null;
    }
  };

  return (
    <Screen>
      <TopBar />
      <ScrollView className="pt-14">
        {renderContent()}
      </ScrollView>
      {!scanView && <BottomNav active={tab} onChange={setTab} />}
    </Screen>
  );
}
