// src/Logo.js
// Two shapes:
//   <Logo />      — full horizontal SWIBSWAP wordmark
//   <Logo mark /> — just the S-arrow icon (square)
// Both pull from /public PNGs so they survive build-time imports.

import React from 'react';
import { T, SZ, FONTS } from './theme';

export default function Logo({
  mark = false,
  height = 40,
  tagline = false,
  style = {},
}) {
  const src = mark ? '/swibswap-mark.png' : '/swibswap-full.png';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', ...style }}>
      <img
        src={src}
        alt="SwibSwap"
        style={{
          height,
          width: 'auto',
          display: 'block',
          filter: 'drop-shadow(0 4px 18px rgba(93, 213, 240, 0.25))',
        }}
      />
      {tagline && !mark && (
        <div
          style={{
            marginTop: 6,
            fontFamily: FONTS.display,
            fontSize: Math.max(SZ.xs - 2, 10),
            letterSpacing: '0.32em',
            color: T.textLow,
            fontWeight: 600,
          }}
        >
          TRUSTED COLLECTIBLES TRADING
        </div>
      )}
    </div>
  );
}
