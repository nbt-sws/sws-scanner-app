#!/usr/bin/env python3
# tools/label-don-characters.py — SCN17b
# ----------------------------------------------------------------
# One-shot batch labeler: enriches api/_don-pdf-catalog.json with
# {character, isCharacterArt, scene} fields by sending each DON card
# image to Claude Haiku Vision.
#
# Run this AFTER tools/extract-don-pdf.py has populated the catalog
# with set + variant data.
#
# Usage:
#   # 1. Make sure ANTHROPIC_API_KEY is set (or in .env.local)
#   # 2. Run from project root:
#   python3 tools/label-don-characters.py
#
# Cost estimate: ~$0.30-1.00 one-time for ~247 cards (batched 4 per call).
# Idempotent: skips entries that already have a character labeled.
# ----------------------------------------------------------------

import os, json, base64, time, sys, urllib.request, urllib.error
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CAT_PATH = os.path.join(ROOT, 'api', '_don-pdf-catalog.json')
PUB_DIR  = os.path.join(ROOT, 'public')

# Load API key from environment or .env.local
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    env_file = os.path.join(ROOT, ".env.local")
    if os.path.isfile(env_file):
        with open(env_file) as f:
            for line in f:
                if line.startswith("ANTHROPIC_API_KEY="):
                    API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not set", file=sys.stderr)
    sys.exit(1)

with open(CAT_PATH, encoding="utf-8") as f:
    catalog = json.load(f)
items = catalog["items"]
print(f"loaded {len(items)} cards from catalog")

# Skip already-labeled entries
todo = [it for it in items if not it.get("character") and not it.get("_labeledSkipped")]
print(f"{len(todo)} cards need labeling (skipping {len(items) - len(todo)} already done)")
if not todo:
    print("nothing to do")
    sys.exit(0)

def make_prompt(n):
    return (
        "For each numbered DON!! card image, identify what is depicted.\n\n"
        "Two visual styles:\n"
        "- 'Symbol' DON: just the ドン symbol artwork (no character) — set character to null\n"
        "- 'Character art' DON: has a One Piece character drawn on it — fill in character\n\n"
        f"Reply with a JSON array of EXACTLY {n} objects, in image order, no markdown fences:\n"
        '[{"character":"Donquixote Doflamingo","isCharacterArt":true,"scene":"3-5 word desc"},...]\n\n'
        "Use canonical English names (e.g. Gol D. Roger, Monkey D. Luffy, Donquixote Doflamingo, "
        "Charlotte Linlin, Trafalgar Law, Eustass Kid, Boa Hancock, Roronoa Zoro, Vinsmoke Sanji, "
        "Marshall D. Teach, Edward Newgate, Dracule Mihawk, Crocodile, Jinbe, Buggy, Smoker, "
        "Portgas D. Ace, Sabo, Yamato, Kaido, Shanks, Charlotte Katakuri, Nico Robin, Nami, "
        "Usopp, Tony Tony Chopper, Franky, Brook, Silvers Rayleigh, Kozuki Oden, Marco, "
        "Rob Lucci, Trebol, Diamante, Pica, Donquixote Rosinante, X Drake, Jewelry Bonney, "
        "Bartolomeo, Cavendish, Bartholomew Kuma). If unsure, character=null."
    )

def call_haiku(batch):
    content = []
    for i, (img_bytes, ext) in enumerate(batch, 1):
        content.append({"type": "text", "text": f"Card #{i}:"})
        media_type = "image/jpeg" if ext in ("jpeg", "jpg") else f"image/{ext}"
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": media_type,
            "data": base64.b64encode(img_bytes).decode("ascii"),
        }})
    content.append({"type": "text", "text": make_prompt(len(batch))})
    body = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 800,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        text = data["content"][0]["text"].strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", "replace")[:200]
        print(f"  HTTP {e.code}: {body_text}", file=sys.stderr)
    except Exception as e:
        print(f"  ERR: {e}", file=sys.stderr)
    return None

BATCH = 4
batches = [todo[i:i+BATCH] for i in range(0, len(todo), BATCH)]
print(f"{len(batches)} batches × {BATCH} images, estimated cost ${len(batches)*0.015:.2f}")

labeled = 0
failed = 0
SAVE_EVERY = 10  # checkpoint every 10 batches

def save_catalog():
    catalog["labeledAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(CAT_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

for bi, batch in enumerate(batches):
    bp = []
    for entry in batch:
        path = os.path.join(PUB_DIR, entry["imageUrl"].lstrip("/"))
        ext = path.rsplit(".", 1)[-1]
        with open(path, "rb") as f:
            bp.append((f.read(), ext))
    result = call_haiku(bp)
    if result and isinstance(result, list) and len(result) == len(batch):
        for entry, r in zip(batch, result):
            entry["character"]      = (r.get("character") or "").strip() or None
            entry["isCharacterArt"] = bool(r.get("isCharacterArt"))
            entry["scene"]          = (r.get("scene") or "").strip() or None
            labeled += 1
    else:
        for entry in batch:
            entry["_labeledSkipped"] = True
        failed += len(batch)
    if (bi + 1) % SAVE_EVERY == 0:
        save_catalog()
        print(f"  batch {bi+1}/{len(batches)}  labeled={labeled} failed={failed} (checkpointed)")
    time.sleep(0.3)

save_catalog()
print(f"\nDONE labeled={labeled}/{len(todo)} failed={failed}")
chars = Counter((it.get("character") or "<NONE>") for it in items)
print("\nTop 25 characters:")
for c, n in chars.most_common(25):
    print(f"  {n:3d}× {c}")
