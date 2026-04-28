# HODL (Frontend + API)

HODL is split into 2 deployable services:

- `frontend` (Vite + React UI, including `/admin` board)
- `api` (Fastify service for Solana holder fetching + poller controls)

This version is holder-tracking focused only (no claim mechanics).

## Local Development

1. Install per-service deps:
   - `npm install --prefix api`
   - `npm install --prefix frontend`
2. Create env files:
   - copy `api/.env.example` -> `api/.env`
   - copy `frontend/.env.example` -> `frontend/.env`
3. Start services in separate terminals:
   - API: `npm run dev:api`
   - Frontend: `npm run dev:frontend`
4. Open:
   - Frontend: `http://localhost:5173`
   - Admin board: `http://localhost:5173/admin`

## API Endpoints

- `GET /health`
- `GET /api/status`
- `GET /api/holders`
- `POST /api/admin/login`
- `GET /api/admin/status`
- `POST /api/admin/config` (set token mint)
- `POST /api/admin/system/start`
- `POST /api/admin/system/stop`

## Railway Deployment

Deploy as two Railway services from the same repo.

### Service 1: API

- Config as Code: `deploy/railway-api.json`
- Required env:
  - `PORT=4000`
  - `ADMIN_PASSWORD=...`
  - `TOKEN_MINT=...` (Solana mint address)
  - `RPC_URL=...` (mainnet RPC)
  - `HOLDER_POLL_MS=120000`
  - `MOCK_HOLDERS=0`

### Service 2: Frontend

- Config as Code: `deploy/railway-frontend.json`
- Required env:
  - `VITE_API_URL=https://<api-domain>`
  - `PORT=3000` (Railway injects this automatically)

After both domains are assigned:

- set API `CORS_ORIGIN` to the frontend domain
- set frontend `VITE_API_URL` to the API domain
- login in `/admin`, set mint, then start fetching

## Pre-push checklist

- `npm --prefix frontend run lint`
- `npm run build:api`
- `npm run build:frontend`
- Confirm `deploy/railway-api.json` and `deploy/railway-frontend.json` are selected in each Railway service
