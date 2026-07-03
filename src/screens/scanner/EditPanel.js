// src/screens/scanner/EditPanel.js — SCN86 extracted from Scanner.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { T, SZ, CURRENCIES, fmtMoney } from '../../theme';
import { Card, Pill, Button, Spinner, LoadingCard, SectionLabel } from '../../components';
import { OP_RARITIES, YGO_RARITIES } from '../../rarities';
import { sortedSetsForLang, formatSetForQuery, setGroupLabel, inferSetFromCode } from '../../sets';
import * as helpers from './helpers';
const { isGradedTier, rawConditionGuess, pickGradedTwoPerTier, classifyTitleClient,
        convertCurrency, medianTHB, isDonCard, isCnAnnivCard, expandRarityTags,
        compactCondition, buildSummary } = helpers;

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: SZ.xs, color: T.textLow, letterSpacing: '0.08em',
      marginBottom: 6, fontFamily: T.fontDisplay, fontWeight: 600,
    }}>{children}</div>
  );
}

export default function EditPanel({ tcg, card, onCancel, onSave }) {
  const [code, setCode]     = useState(card.code || '');
  const [nameEn, setNameEn] = useState(card.nameEn || '');
  const [nameJp, setNameJp] = useState(card.nameJp || '');
  const [rarity, setRarity] = useState(card.rarity || '');
  const [type, setType]     = useState(card.type || '');
  // SCN50 — Promo dropped from UI. The set name already carries that signal.
  // Kept as a const so any downstream callers still get the original value.
  const promo = !!card.promo;
  const [cardLang, setCardLang] = useState(card.lang || 'EN');
  const [setCode_, setSetCode_] = useState(() => {
    if (card.setCode) return card.setCode;
    const inferred = inferSetFromCode(card.code, card.lang || 'EN');
    return inferred?.code || '';
  });

  // SCN110 — When user types a different code in Edit Fields, fetch
  // optcgapi via /api/op-details and auto-fill name/rarity/type so the
  // displayed card matches the new code (instead of showing the original
  // scanned card's metadata against the corrected code).
  useEffect(() => {
    if (!code || code === (card.code || '')) return;
    if (!/^[A-Z]+-?\d/i.test(code)) return;   // skip until format looks valid
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/op-details?code=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const d = data?.details;
          if (!d) return;
          // Only overwrite when the field is empty OR still matches the
          // original (so we don't clobber the user's manual edits).
          if (d.name && (!nameEn || nameEn === (card.nameEn || ''))) setNameEn(d.name);
          if (d.nameJp && (!nameJp || nameJp === (card.nameJp || ''))) setNameJp(d.nameJp);
          if (d.rarity && (!rarity || rarity === (card.rarity || ''))) setRarity(d.rarity);
          if (d.type && (!type || type === (card.type || ''))) setType(d.type);
        })
        .catch(() => {});
    }, 500);   // debounce 500ms after typing stops
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line
  }, [code]);

  // Re-infer set when the code or language changes (user might paste a new code).
  useEffect(() => {
    if (!setCode_ && code) {
      const inferred = inferSetFromCode(code, cardLang);
      if (inferred) setSetCode_(inferred.code);
    }
  }, [code, cardLang, setCode_]);

  // Sets ordered by category (Booster → Starter → Extra → Sealed → Anniversary → …)
  // so the most common picks surface first. Grouped by category in the <select>.
  const setOptionsByGroup = useMemo(() => {
    const list = sortedSetsForLang(cardLang);
    const groups = {};
    for (const s of list) {
      const k = s.type;
      if (!groups[k]) groups[k] = [];
      groups[k].push(s);
    }
    return groups;
  }, [cardLang]);

  // Look up which rarities actually exist for this code, so the dropdown
  // only shows valid options. Empty = unknown → show everything.
  const [knownRarities, setKnownRarities] = useState([]);
  useEffect(() => {
    if (!code) { setKnownRarities([]); return; }
    fetch(`/api/op-variants?lightweight=1&code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => setKnownRarities(Array.isArray(data?.rarities) ? data.rarities : []))
      .catch(() => setKnownRarities([]));
  }, [code]);

  const rarityOptions = useMemo(() => {
    const dict = tcg === 'ygo' ? YGO_RARITIES : OP_RARITIES;
    let entries = Object.entries(dict);
    if (knownRarities.length > 0) {
      // Filter to only those we know exist for this code.
      // Match case-insensitively + allow either acronym or label match.
      const wanted = new Set(knownRarities.map((r) => String(r).toUpperCase()));
      const filtered = entries.filter(([acronym, label]) =>
        wanted.has(acronym.toUpperCase()) || wanted.has(label.toUpperCase())
      );
      if (filtered.length > 0) entries = filtered;
    }
    return entries.map(([acronym, label]) => ({
      value: acronym,
      label: `${acronym} — ${label}`,
    }));
  }, [tcg, knownRarities]);

  const typeOptions = tcg === 'ygo'
    ? ['Normal Monster', 'Effect Monster', 'Spell', 'Trap', 'Ritual Monster', 'Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Pendulum Monster', 'Link Monster']
    : ['Leader', 'Character', 'Event', 'Stage', 'DON!!'];

  const inputStyle = {
    width: '100%', background: T.surface2, color: T.textHi,
    border: `1px solid ${T.border2}`, borderRadius: 10,
    padding: '12px 14px', fontSize: SZ.md, marginBottom: 12,
    outline: 'none', boxSizing: 'border-box', fontFamily: T.fontMono,
  };

  return (
    <Card>
      <div style={{ fontSize: SZ.md, color: T.textMid, marginBottom: 14 }}>
        Correct anything the scanner got wrong. Applying re-fetches prices and card details.
      </div>

      <FieldLabel>CODE</FieldLabel>
      <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder={tcg === 'ygo' ? 'LOCR-JP001' : 'OP09-001'} />

      <FieldLabel>NAME (EN)</FieldLabel>
      <input style={inputStyle} value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Monkey D. Luffy" />

      <FieldLabel>NAME (JP / ORIGINAL SCRIPT)</FieldLabel>
      <input style={inputStyle} value={nameJp} onChange={(e) => setNameJp(e.target.value)} placeholder="モンキー・D・ルフィ" />

      <FieldLabel>SET / PROMO FOLDER</FieldLabel>
      <select style={inputStyle} value={setCode_} onChange={(e) => setSetCode_(e.target.value)}>
        <option value="">— pick a set or promo folder —</option>
        {Object.entries(setOptionsByGroup).map(([groupKey, items]) => (
          <optgroup key={groupKey} label={setGroupLabel(groupKey)}>
            {items.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <FieldLabel>RARITY</FieldLabel>
      <select style={inputStyle} value={rarity} onChange={(e) => setRarity(e.target.value)}>
        <option value="">— select rarity —</option>
        {rarityOptions.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      <FieldLabel>TYPE</FieldLabel>
      <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">— select type —</option>
        {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <FieldLabel>LANGUAGE</FieldLabel>
      <select style={inputStyle} value={cardLang} onChange={(e) => setCardLang(e.target.value)}>
        {tcg === 'ygo' ? (
          <>
            <option value="JP">Japanese (OCG)</option>
            <option value="AE">Asian-English (AE)</option>
          </>
        ) : (
          <>
            <option value="JP">Japanese</option>
            <option value="EN">English</option>
            <option value="CN">Chinese</option>
          </>
        )}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({
          code, nameEn, nameJp: nameJp || null, rarity, type: type || null,
          promo, lang: cardLang, setCode: setCode_ || null,
        })}>Apply</Button>
      </div>
    </Card>
  );
}
