# SWS / SwibScan / SwibSwap — UI Concept & Service Map

> เอกสารนี้สรุป concept ของแพลตฟอร์ม SWS, รายการ backend services ที่มีอยู่, และข้อเสนอการออกแบบ UI สำหรับ **SwibScan** (scanner + vault) โดยเฉพาะ ส่วน **SwibSwap** (marketplace) จะกล่าวถึงเฉพาะจุดที่เกี่ยวข้องกับ Vault/Auth เท่านั้น

---

## 1. Platform Concept

SWS เป็น ecosystem สำหรับนักสะสมการ์ด แบ่งเป็น 2 แอปหลัก:

### SwibScan
แอปสำหรับ **"รู้ค่าการ์ดในพริบตา"**
1. ถ่ายหรืออัปโหลดรูปการ์ด
2. AI/Vision/OCR บอก code, rarity, set, language, grade/condition
3. ดึงราคาตลาด (eBay / TCG / internal marketdata)
4. บันทึกเข้า **Vault** (คลังสะสมส่วนตัว)
5. ติดตามมูลค่าพอร์ต, P/L, folder, grade

### SwibSwap
แอป marketplace แยกต่างห่างสำหรับ:
- ลงขาย/ประมูลการ์ด
- รับ/ส่ง offer
- สั่งซื้อ, ชำระเงิน, จัดส่ง
- การ์ดที่ซื้อ/ชนะประมูลจาก SwibSwap สามารถเพิ่มเข้า Vault ใน SwibScan ได้

### เป้าหมายใกล้สุด (MVP)
ทำให้ **Scan → Vault** สมบูรณ์ก่อน ค่อยเปิด marketplace ในฝั่ง SwibSwap

---

## 2. Backend Services (swibs)

| Service | บทบาท | ความสามารถหลักที่เกี่ยวข้องกับ UI |
|---------|--------|-----------------------------------|
| **sws-svc-api-gateway** | ประตูหน้าบ้าน | JWT, RBAC, rate limit, รวม route `/api/v1/*` |
| **sws-svc-user** | Auth + purchase queue | register/login/refresh, JWT, queue join/status |
| **sws-svc-vault-kyc** | KYC + membership | KYC submit/review/approve, tier check |
| **sws-svc-vault-inventory** | ข้อมูลการ์ดหลัก | CRUD items, owner/holder, locks, collector profiles |
| **sws-svc-vault-audit** | Audit trail | ประวัติ item/user |
| **sws-svc-swap-listing** | Listing/auction | สร้าง listing, auction, bid |
| **sws-svc-swap-order** | Order orchestrator | orders, transactions, fee preview |
| **sws-svc-swap-payment** | Escrow | payment sessions, webhooks |
| **sws-svc-swap-shipping** | ขนส่ง | tracking, logistics webhooks |
| **sws-svc-swap-wishlist** | Wishlist/offer | watchers, offers |
| **sws-svc-swap-marketdata** | ข้อมูลราคา | SKU history, candlestick, stats |
| **sws-svc-notification** | Inbox | notifications, channel preferences |
| **sws-scanner-service** | Card AI | scan, variants, pricing, visual match, contributions |

### Communication
- **gRPC:** inventory & kyc เปิด server; listing & order เป็น client
- **NATS:** JSON domain events (ปิดไว้ก่อนตามคำขอล่าสุด จนกว่าจะพร้อมเปิดใช้)
- **Auth:** Gateway ตรวจ JWT; downstream services trust `X-User-ID` header

---

## 3. SwibScan Frontend ปัจจุบัน

### Tab ที่มี
| Tab | สถานะ | หมายเหตุ |
|-----|-------|----------|
| **Scan** | ใช้งานได้ | กล้อง/อัปโหลด → AI ID → ราคา |
| **Vault** | ใช้งานได้บางส่วน | แสดง value/P/L แต่ save ยัง disabled |
| **Market** | ซ่อนอยู่ | ค้นหา transaction history |
| **Settings** | ใช้งานได้ | currency, membership, sign-out |

### Scan Flow
```
Camera/File → Preprocess → OCR/Vision/Claude → Variant Picker → Price Estimate → Quality Score → Save to Vault (disabled)
```

### Vault Dashboard
- VAULT VALUE hero
- Realized / Unrealized P/L tiles
- Profitability sparkline
- Folder filter
- Grade filter (All / Raw / Graded / specific grade)
- Mark sold / edit purchase price

---

## 4. UI Recommendation — SwibScan

### 4.1 Navigation ที่แนะนำ

#### Mobile
Bottom tab bar 4 ปุ่ม:

| Tab | ไอคอนแนะนำ | หน้าที่ |
|-----|------------|---------|
| **Scan** | 📷 | จุดเริ่มต้นสแกนการ์ด |
| **Vault** | 🗃️ | คลังการ์ด |
| **Activity** | 🔔 | แจ้งเตือน + scan history |
| **Profile** | 👤 | ข้อมูลผู้ใช้, KYC, tier, ตั้งค่า |

> **Settings** ย้ายเข้าไปอยู่ใน **Profile** เพื่อลด tab

#### Desktop/Tablet
- ซ้าย: vertical sidebar navigation
- ขวา: content area
- Scan screen ใช้ layout 2 คอลัมน์: ซ้ายกล้อง/ประวัติ ขวาผลลัพธ์

### 4.2 Core Screens

#### 1) Scan Screen
- **Camera viewfinder** หรือ **file upload zone**
- **Language selector** (JP / EN / CN / etc.)
- **Recent scans list** (5-10 รายการล่าสุด)
- CTA: **Scan Now**

#### 2) Scan Result Screen
| Section | เนื้อหา |
|---------|---------|
| Card Hero | รูปการ์ด, code, name, rarity, set, language |
| Variant Picker | รายการที่ AI คาดเดา พร้อม confidence score |
| Price Card | ราคา median, low, high ในสกุลหลัก/รอง |
| Quality Card | condition suggestion, quality score |
| Action Bar | **Add to Vault** · **Contribute Sample** · **Scan Again** |

#### 3) Vault Dashboard
| Section | เนื้อหา |
|---------|---------|
| Value Hero | มูลค่ารวมปัจจุบัน, จำนวนใบ |
| P/L Tiles | Unrealized P/L + Realized P/L |
| Sparkline | drift ระหว่าง cost vs current value |
| Filters | Folder chips, Grade chips, Status (held/sold/on-hold) |
| Grid/List | การ์ดแต่ละใบพร้อม thumbnail, code, rarity, current value |

#### 4) Vault Item Detail
- รูปใหญ่ + metadata
- Edit: folder, condition/grade, purchase price, purchase date, source
- Actions: **Mark Sold**, **Move Folder**, **Delete**
- History mini-timeline (audit)

#### 5) Activity Screen
- Notifications จาก `sws-svc-notification`
- Scan history ของ user
- KYC status updates

#### 6) Profile Screen
- Display name / email / avatar
- Membership tier + benefits list
- KYC status badge + submit/review CTA
- Settings group: currency primary/secondary, sign-out

### 4.3 Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| **< 640px** | Bottom tabs, single column, full-width cards |
| **640–1024px** | Persistent sidebar or top nav, 2-column vault grid |
| **> 1024px** | Left sidebar, 3–4 column vault grid, charts side-by-side |

---

## 5. Feature Add / Remove / Consolidate

### ✅ ควรเพิ่ม (ใช้ API ที่มีแล้ว)
| Feature | API / Endpoint | Service |
|---------|----------------|---------|
| Save-to-Vault จริง | `POST /api/vault/items` | vault-inventory |
| Vault list/detail จาก backend | `GET /api/vault/items`, `GET /api/vault/items/:id` | vault-inventory |
| KYC status panel | `GET /api/kyc/status/:userId` | vault-kyc |
| Notifications inbox | `GET /api/notifications` | notification |
| Scan history per user | Firestore `scans/{uid}` หรือ backend log | scanner-service |

### ❌ ควรลบ/ซ่อน
| Feature | เหตุผล |
|---------|--------|
| **Market tab** ใน SwibScan | ย้ายไป SwibSwap |
| **Save to Vault disabled** | เปิดใช้งานให้ได้ |
| **RevenueCat upgrade CTA** | แสดง tier benefits แต่ซ่อนปุ่มจ่ายเงินจน billing พร้อม |
| **YGO mode selector** | ซ่อนจน YGO skill พร้อม |
| **LINE sign-in** | ซ่อนจน implement เสร็จ |

### 🔀 ควยรวม
- **Settings → Profile** ลด tab clutter
- Firestore vault ให้เป็น cache/read-only fallback; canonical write ไปที่ vault-inventory API

---

## 6. API Mapping (SwibScan flows)

| UI Flow | Method | Endpoint | Service |
|---------|--------|----------|---------|
| Scan image | POST | `/api/scan` | scanner-service |
| Get variants | GET | `/api/op-variants` | scanner-service |
| Get card details | GET | `/api/op-details` | scanner-service |
| Get market prices | GET | `/api/prices` | scanner-service |
| Add to vault | POST | `/api/vault/items` | vault-inventory |
| List vault items | GET | `/api/vault/items` | vault-inventory |
| Update vault item | PATCH | `/api/vault/items/:id` | vault-inventory |
| Delete vault item | DELETE | `/api/vault/items/:id` | vault-inventory |
| KYC status | GET | `/api/kyc/status/:userId` | vault-kyc |
| Submit KYC | POST | `/api/kyc/submit` | vault-kyc |
| Notifications | GET | `/api/notifications` | notification |
| Mark notification read | PATCH | `/api/notifications/:id/read` | notification |
| Whoami / admin probe | GET | `/api/whoami` | scanner-service |

---

## 7. Roadmap

### Phase 1 — Scan + Vault Complete (MVP)
- [ ] เปิดใช้ **Save to Vault**
- [ ] Vault ดึง/เขียนข้อมูลจาก backend API
- [ ] เพิ่ม tab **Activity** (notifications + scan history)
- [ ] ย้าย **Settings** เข้า **Profile**
- [ ] เพิ่ม **KYC status panel** ใน Profile
- [ ] ซ่อน Market tab / YGO / LINE sign-in

### Phase 2 — SwibSwap Integration
- [ ] Shared auth/session ระหว่าง SwibScan ↔ SwibSwap
- [ ] SwibSwap สามารถ push การ์ดที่ซื้อ/ชนะประมูลเข้า Vault ได้
- [ ] Sync membership tier / KYC status ข้ามแอป

### Phase 3 — Polish & Scale
- [ ] Responsive desktop layout สมบูรณ์
- [ ] Advanced vault analytics (allocation by set/rarity/grade)
- [ ] Price alerts / wishlist sync
- [ ] Bulk edit / import CSV

---

## 8. Open Questions / Next Steps

1. **Scan result → Vault:** ต้องการให้ user กรอก purchase price/date ก่อน save เสมอหรือให้ default แล้วแก้ทีหลัง?
2. **Vault image:** ใช้รูปจาก scan result โดยตรงหรือต้องอัปโหลดรูปใหม่?
3. **KYC flow:** ต้องการให้ KYC submit อยู่ใน SwibScan ด้วยหรือส่งไป SwibSwap?
4. **Market data price source:** ใช้ eBay เป็นหลักอย่างเดียว หรือรวม internal marketdata ด้วย?

---

## 9. Summary

- **SwibScan** ควรเป็นแอป "scan + vault" อย่างเดียว ไม่ใช่ marketplace
- **UI หลัก:** Scan, Vault, Activity, Profile
- **Backend ที่ต้อง integrate ก่อน:** scanner-service, vault-inventory, vault-kyc, notification
- **สิ่งที่ต้องซ่อนก่อน:** Market tab, YGO mode, LINE sign-in, payment upgrade CTA
- **Responsive:** mobile-first แต่รองรับ tablet/desktop ด้วย sidebar layout
