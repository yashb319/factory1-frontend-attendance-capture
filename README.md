# Factory1 Attendance Capture

Mobile-friendly attendance capture station for Factory1.

This is a separate prototype app for:

- QR code attendance
- Factory1 employee photo roster sync
- Browser prototype photo matching
- Manual fallback
- Posting attendance to Factory1 backend `/api/public/attendance-capture/device-event`

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5174
```

For testing from a phone on the same Wi-Fi, open the network URL printed by Vite.

## Backend Settings

In the app settings panel:

- Backend URL: `http://localhost:8080` or deployed backend URL
- Factory capture key: generate it from Factory1 Organization Settings and paste it here
- Device ID: any stable device name, for example `factory-gate-phone-1`

The app posts:

```json
{
  "captureKey": "f1_att_...",
  "employeeCode": "EMP001",
  "eventTime": "2026-07-08T12:00:00",
  "eventType": "CHECK_IN",
  "deviceId": "factory-gate-phone-1",
  "confidence": 0.99
}
```

## QR Format

QR can contain any of these:

```text
EMP001
```

```json
{"employeeCode":"EMP001"}
```

```text
https://factory1.app/attendance?employeeCode=EMP001
```

## Photo Mode

Photo mode currently loads employee photos from Factory1 and uses a small browser
perceptual hash. This is useful for validating the workflow, but it is not
production-grade face recognition.

Production path:

1. Store employee reference photos securely.
2. Generate face embeddings with a real recognition model.
3. Match live captures server-side or on-device.
4. Keep QR/RFID as fallback for low-confidence matches.

## Future Hardware Path

Arduino/ESP32/RFID devices can post the same payload to:

```text
POST /api/public/attendance-capture/device-event
```

The backend already handles check-in/check-out behavior per employee/date.

## Continuation Prompt For Codex

Use this prompt to continue the Tally-like work from the current Factory1 state:

```text
We are in /Users/yashb319/Desktop/factoryone. Continue Factory1 Tally-like features from the current state.

Context:
- Backend repo: factory1-backend
- Frontend repo: factory1-ui-v2
- Accounting already has groups, ledgers, payment/receipt/contra/journal vouchers, trial balance, P&L, balance sheet, GST summary, aging reports, Day Book with date range and voucher type filter, and CSV exports.
- Billing posts accounting vouchers and stock movement, supports sales/purchase vouchers, print, payments, draft/post/cancel, HSN/GST suggestions, and inventory master HSN/GST reuse.
- Inventory master now stores hsnCode and gstRate.
- Local OTP bypass exists through LOCAL_OTP_BYPASS_CODE; do not set it in production.

Next Tally-like work:
1. Improve accounting voucher entry to feel closer to Tally:
   - voucher-specific ledger presets for Payment/Receipt/Contra/Journal
   - keyboard shortcuts and faster line navigation
   - duplicate/copy voucher
   - voucher print/export
2. Add ledger drill-down:
   - click ledger from Trial Balance/P&L/B/S to see voucher lines
   - date range filter and CSV
3. Add cash/bank book:
   - filter vouchers involving Cash or Bank ledgers
   - opening/running balance
4. Add sales/purchase register:
   - voucher register grouped by party/GST/HSN
   - monthly/quarterly CA-friendly exports

Follow existing patterns, keep UI professional and not cluttered, run backend tests and frontend build.
```
