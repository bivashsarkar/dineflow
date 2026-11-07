# DineFlow Production Readiness Guide

## 1. Environment Configuration

### Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Required? | Description |
|---|---|---|
| `DINEFLOW_SECRET_KEY` | ✅ | Secret for session signatures |
| `DINEFLOW_ADMIN_USERNAME` | ✅ | Super-admin login username |
| `DINEFLOW_ADMIN_PASSWORD` | ✅ | Super-admin login password |
| `DINEFLOW_DB_BACKEND` | ✅ | `auto|firestore|local` (default: auto) |
| `FIREBASE_CREDENTIALS` | ✅ (if firestore) | Path to Firebase service account JSON |
| `FIREBASE_PROJECT_ID` | ✅ (if firestore) | Your Firebase project ID |
| `CLOUDINARY_CLOUD_NAME` | ✅ (if Cloudinary) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ (if Cloudinary) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ (if Cloudinary) | Cloudinary API secret |
| `DINEFLOW_GST_RATE` | ✅ | Restaurant GST rate (%) |
| `DINEFLOW_PUBLIC_BASE_URL` | ✅ | Production base URL for QR codes |

### Frontend
No secrets needed. The Vite dev proxy (`vite.config.js`) forwards `/api`, `/uploads`, `/qr`, `/socket.io` to the backend.

## 2. Dependencies

### Backend (already installed in `backend/requirements.txt`)
- Flask 3.1, Flask-SocketIO 5.7.2, firebase-admin 7.7.0
- cloudinary, qrcode 8.2, reportlab 4.5.1, Flask-CORS 5.0.1

### Frontend (already installed in `frontend/package.json`)
- lucide-react, react-router, socket.io-client, tailwind, vite

## 3. `.gitignore` (create at project root)

```
# Environment secrets
*.env
!.env.example

# Data directories
backend/data/
backend/uploads/
frontend/dist/
frontend/node_modules/

# IDE / runtime
.vscode/
.idea/
*.pyc
*.pyd
```

## 4. Production Deployment Checklist

### A. Backend (`python app.py`)
- Set `DINEFLOW_DB_BACKEND=firestore` (or keep `auto` if Firebase creds are present)
- Place `firebase-service-account.json` at the path specified in `FIREBASE_CREDENTIALS`
- Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` if using Cloudinary
- Otherwise images save to `./uploads/` served at `/uploads/<file>`
- Ensure `DINEFLOW_SECRET_KEY` is strong and unique
- Run behind HTTPS in production (reverse proxy: Nginx/Apache)

### B. Frontend (`npm run build && npm start`)
- `vite.config.js` already has proxy setup for `/api` → `http://localhost:5000`
- Build output goes to `frontend/dist/`
- Serve `dist/` from your web server

### C. Super Admin Creation (one-time)
Use the built-in super-admin login at `/admin/login` with credentials from `.env`.
- First login creates session in `auth_sessions` collection (Firestore) or JSON file (local).
- Credentials are never exposed to the frontend.

### D. Owner Onboarding (Super Admin)
1. Log in as super admin
2. Create restaurants → auto-creates owner accounts with unique slug/username/password
3. Send owner credentials to restaurant owners
4. Owners log in at `/owner/login` with their username/password

### E. Customer Flow (no login required)
1. Customer scans QR → goes to `https://your-domain/r/<restaurant-slug>/table/<table-token>`
2. Browse menu, add to cart, place order
3. Live order tracking via Socket.IO
4. Staff requests (call staff/water/cutlery/assistance/bill)
5. Accept/reject replacement suggestions
6. Bill with GST + discounts → PDF invoice → manual pay-at-counter (cash/upi/card)

## 7. Testing

### Run the 108-check flow test:
```bash
cd backend
python tests/test_flow.py
```

### Run the real-time Socket.IO test:
```bash
cd backend
python tests/test_realtime.py
```

Both suites must pass (108/108 checks) before going live.

## 8. Known Limitations (by design)
- ❌ No online payment gateways (Stripe/PayPal)
- ❌ No customer login/registration
- ❌ No subscriptions or recurring billing
- ❌ No advanced analytics / KDS
- ❌ No multi-branch support
- ✅ Manual payment recording (cash/upi/card) only
- ✅ Single persistence: Firestore or local JSON files