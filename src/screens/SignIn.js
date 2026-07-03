// src/screens/SignIn.js — sign-in / sign-up screen.

import React, { useState } from 'react';
import { T, SZ } from '../theme';
import { Screen, Button, ErrorBanner } from '../components';
import {
  signInEmail,
  signUpEmail,
  signInWithGoogle,
  signInWithApple,
} from '../auth';
import { firebaseEnabled } from '../firebase';
import Logo from '../Logo';

export default function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password, displayName);
      }
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const oauth = (fn) => async () => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onSignedIn?.();
    } catch (err) {
      setError(err.message || 'OAuth failed');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%',
    background: T.surface2,
    color: T.textHi,
    border: `1px solid ${T.border2}`,
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: SZ.md,
    marginBottom: 12,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: T.fontBody,
  };

  return (
    <Screen style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Logo height={64} tagline />
          <div style={{ fontSize: SZ.md, color: T.textLow, marginTop: 18 }}>
            {mode === 'signin' ? 'Welcome back.' : 'Create your account.'}
          </div>
        </div>

        <ErrorBanner message={error} />

        {!firebaseEnabled && (
          <div style={{ fontSize: SZ.sm, color: T.amber, marginBottom: 14, textAlign: 'center' }}>
            Running in offline mode — Firebase keys not set. Sign-in is disabled.
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
          <Button type="submit" disabled={busy || !firebaseEnabled}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </Button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0', color: T.textDim, fontSize: SZ.sm }}>
          <div style={{ flex: 1, height: 1, background: T.border }} />
          <span>or</span>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* LINE is wired up code-side but the Firebase + LINE Developer Console
              setup hasn't shipped yet. Button is shown so the layout matches
              the intended final design, but tapping it opens a "Coming soon"
              note instead of firing signInWithLine. Flip back on after the
              steps in AUTH-SETUP-LINE.md are done. */}
          <Button
            variant="outline"
            onClick={() => setError('LINE sign-in is coming soon — use Google, Apple, or email for now.')}
            disabled={busy}
          >
            Continue with LINE  ·  coming soon
          </Button>
          <Button variant="outline" onClick={oauth(signInWithGoogle)} disabled={busy || !firebaseEnabled}>
            Continue with Google
          </Button>
          <Button variant="outline" onClick={oauth(signInWithApple)} disabled={busy || !firebaseEnabled}>
            Continue with Apple
          </Button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 28, fontSize: SZ.sm, color: T.textLow }}>
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                style={{ background: 'none', border: 'none', color: T.cyan, cursor: 'pointer', fontSize: SZ.sm, fontWeight: 600, padding: 0 }}
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                style={{ background: 'none', border: 'none', color: T.cyan, cursor: 'pointer', fontSize: SZ.sm, fontWeight: 600, padding: 0 }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
