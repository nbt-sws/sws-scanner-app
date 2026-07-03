// /api/scan.js — BoBoa Scanner v12 backend
// Calls Claude Haiku 4.5 vision API to extract card details from photo

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  const { image, tcg, lang } = req.body || {};
  if (!image || !tcg) {
    return res.status(400).json({ ok: false, error: 'Missing image or tcg' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'API key not configured on server' });
  }

  // Strip data URL prefix
  const b64 = image.replace(/^data:image\/\w+;base64,/, '');
  const mediaType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

  const codePositionHint = tcg === 'ygo'
    ? 'The card number is located at the TOP-RIGHT corner, ABOVE the text description box. Format: like "LOCH-JP003" or "LOB-EN016".'
    : 'The card number is located at the BOTTOM-RIGHT corner. Format: like "OP07-051" or "ST30-001". If no code is visible and card appears to be a DON!! card, return "DON!!" as code.';

  const prompt = `You are a TCG card identification expert. Analyze this ${tcg === 'ygo' ? 'Yu-Gi-Oh!' : 'One Piece'} card image and extract the following details.

${codePositionHint}

Language context: card is ${lang === 'JP' ? 'Japanese (OCG)' : lang === 'AE' ? 'Asian-English' : 'English'}.

Identify the RARITY from visual features:
${tcg === 'ygo' ? `
- Overframe PSE: holographic prism pattern across whole card, diagonal rainbow lines
- Quarter Century Secret: silver foil with "QC" stamp
- Prismatic Secret: rainbow foil in lines
- Ultimate Rare: 3D relief texture
- Ultra Rare: gold foil on name text
- Super Rare: foil on artwork only
- Secret Rare: silver/rainbow foil
- Rare: silver stamp
- Common: no foil
- Ghost Rare: full holographic
- 20th Anniv: special anniversary stamp
` : `
- SEC (Secret Rare): gold border, full-art textured pattern
- L (Leader): distinctive Leader border, no cost value, has Life value
- SR (Super Rare): silver border, metallic shine
- R (Rare): metallic foil accents on border
- UC (Uncommon): basic card, no metallic
- C (Common): no foil
- TR (Treasure Rare): premium alternate-art treatment
- SP (Special Parallel): unique themed artwork
- ★ (star above rarity code) = Parallel/Alt Art variant, append "-P" (e.g. L-P, SR-P)
- DON!! Gold Parallel: gold finish DON!! card
- Manga Rare: black and white manga panel illustrations
`}

Determine if Promo:
- Tournament prize cards, movie tie-ins, pack-in promos are all Promo
- If card has obvious promotional markings or is from a non-booster set, mark promo: true

${tcg === 'op' ? 'Identify card TYPE from One Piece:\n- Leader (L rarity, red back, Life value bottom-right)\n- Character (blue background, has cost + power)\n- Event (blue background, no power, event effect)\n- Stage (blue background, playable field)\n- DON!! (white background, resource card)\n' : ''}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "code": "CARDCODE-123",
  "nameEn": "Card Name in English",
  "nameJp": "カード名 in Japanese or null",
  "rarity": "rarity tag",
  "confidence": 94,
  ${tcg === 'op' ? '"type": "Leader" or "Character" or "Event" or "Stage" or "DON!!",' : ''}
  "promo": false,
  "lang": "${lang}"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ ok: false, error: `AI call failed: ${errText.slice(0, 200)}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ ok: false, error: 'AI response not parseable', raw: text });
    }

    const card = JSON.parse(jsonMatch[0]);
    card.tcg = tcg;

    // Optionally verify against YGOProDeck (YGO only)
    if (tcg === 'ygo' && card.code) {
      try {
        const ver = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes&num=1&offset=0`);
        // (In real impl, would query by name to cross-verify)
      } catch (e) { /* non-fatal */ }
    }

    return res.status(200).json({ ok: true, card });

  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
