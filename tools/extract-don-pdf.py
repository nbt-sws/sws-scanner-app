#!/usr/bin/env python3
# tools/extract-don-pdf.py — SCN17
# ----------------------------------------------------------------
# One-shot extractor for the official Bandai "DON!! Card List" PDF.
# Re-run this when Bandai publishes a new edition of the PDF; it
# regenerates /public/don-pdf/*.jpeg + api/_don-pdf-catalog.json.
#
# Usage:
#   python3 tools/extract-don-pdf.py [path/to/don-cardlist.pdf]
#
# Dependencies:
#   pip install --break-system-packages PyMuPDF Pillow
#
# What it does:
#   1. Opens the PDF and extracts every embedded card image
#      (filter by canonical 376×525 size to skip background images).
#   2. Reads the JP text label below each card to recover its set
#      code (e.g. PRB-01, OP-13) and set name.
#   3. Runs a border-color heuristic on each card image to detect
#      whether it's a Gold Parallel variant (>35% gold border pixels).
#   4. Writes:
#        public/don-pdf/p{page}_c{cell}.jpeg          one per card
#        api/_don-pdf-catalog.json                    machine catalog
#
# Character names are NOT included by this script. If you want to
# label characters too, run tools/label-don-characters.py afterwards
# (which calls Haiku Vision and adds a `character` field per entry).
# ----------------------------------------------------------------

import fitz, json, re, os, sys, shutil, io
from PIL import Image

# Resolve project root from this script's location: tools/ → ..
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PDF  = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'OP-TCG', 'DON_Reference', 'don-cardlist.pdf')
PUB  = os.path.join(ROOT, 'public', 'don-pdf')
CAT  = os.path.join(ROOT, 'api', '_don-pdf-catalog.json')


def parse_label(raw):
    """'プレミアムブースター\\nONE PIECE CARD THE BEST【PRB-01】' → {setCode, setName, setLabelJp}"""
    if not raw:
        return {'setCode': None, 'setName': None, 'setLabelJp': ''}
    m = re.search(r'【\s*([A-Z]+)-?(\d{1,2})\s*】', raw)
    setCode = f"{m.group(1)}-{m.group(2).zfill(2)}" if m else None
    cleaned = re.sub(r'【[^】]*】', '', raw).strip()
    lines = [ln.strip() for ln in cleaned.split('\n') if ln.strip()]
    setName = lines[-1] if lines else None
    return {'setCode': setCode, 'setName': setName, 'setLabelJp': raw}


def detect_gold(img_bytes):
    """Gold-parallel cards have gold/yellow dominance on their border frame."""
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        w, h = img.size
        samples = []
        for x in range(0, w, max(1, w // 20)):
            samples.append(img.getpixel((x, 5)))
            samples.append(img.getpixel((x, h - 5)))
        for y in range(0, h, max(1, h // 20)):
            samples.append(img.getpixel((5, y)))
            samples.append(img.getpixel((w - 5, y)))
        gold = sum(1 for r, g, b in samples if r > 180 and g > 120 and b < 110 and r >= g)
        return gold / max(1, len(samples)) > 0.35
    except Exception:
        return False


def main():
    if not os.path.isfile(PDF):
        print(f"ERROR: PDF not found at {PDF}", file=sys.stderr)
        sys.exit(1)
    if os.path.exists(PUB):
        shutil.rmtree(PUB)
    os.makedirs(PUB)

    doc = fitz.open(PDF)
    catalog = []

    for pn in range(len(doc)):
        page = doc[pn]
        img_rects = []
        for img in page.get_images(full=True):
            xref = img[0]
            info = doc.extract_image(xref)
            if info['width'] not in (376, 377):
                continue
            for rect in page.get_image_rects(xref):
                img_rects.append({'xref': xref, 'info': info, 'rect': rect})
        img_rects.sort(key=lambda r: (round(r['rect'].y0 / 10), r['rect'].x0))

        text_blocks = [
            {'x0': b[0], 'y0': b[1], 'x1': b[2], 'y1': b[3], 'text': b[4].strip()}
            for b in page.get_text("blocks")
            if b[4].strip() and 'カードリスト' not in b[4]
        ]

        for idx, ir in enumerate(img_rects):
            r = ir['rect']
            best, best_dist = None, 9999
            for tb in text_blocks:
                if tb['y0'] < r.y1 - 5:
                    continue
                tb_mid = (tb['x0'] + tb['x1']) / 2
                im_mid = (r.x0 + r.x1) / 2
                dx, dy = abs(tb_mid - im_mid), tb['y0'] - r.y1
                if dx > 100 or dy > 60:
                    continue
                d = dy + dx
                if d < best_dist:
                    best_dist = d
                    best = tb['text']

            ext = ir['info']['ext']
            fname = f"p{pn+1:02d}_c{idx+1}.{ext}"
            img_bytes = ir['info']['image']
            with open(os.path.join(PUB, fname), 'wb') as f:
                f.write(img_bytes)

            info = parse_label(best)
            is_gold = detect_gold(img_bytes)
            catalog.append({
                'id': f"p{pn+1:02d}_c{idx+1}",
                'imageUrl': f"/don-pdf/{fname}",
                'page': pn + 1,
                'cell': idx + 1,
                'setCode': info['setCode'],
                'setName': info['setName'],
                'setLabelJp': info['setLabelJp'],
                'variant': 'gold' if is_gold else 'regular',
                'rarity': 'DON!! Gold' if is_gold else 'DON!!',
            })

    with open(CAT, 'w', encoding='utf-8') as f:
        json.dump({
            'version': 1,
            'source': 'DON!! Card List PDF (Bandai official)',
            'count': len(catalog),
            'items': catalog,
        }, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(catalog)} cards → {PUB}")
    print(f"Catalog written → {CAT}")
    gold = sum(1 for c in catalog if c['variant'] == 'gold')
    print(f"  regular: {len(catalog) - gold}")
    print(f"  gold:    {gold}")


if __name__ == '__main__':
    main()
