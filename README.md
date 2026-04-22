# Shoppa Backend

NestJS + TypeScript REST API for the **Shoppa** shopping-request app.
Three-day engineering assessment — **Page 3** scope (Saviour Eking).

## Project overview

Shoppa lets a buyer post a shopping request (a shopping list with a
budget and delivery address) and chat with a shopper who fulfils it.
This backend serves the screens on Page 3 of the Figma:
splash / onboarding, account creation (phone-OTP and OAuth), create
post (17 screens), messages (14 screens), and account / wallet.

The brief is small but the scope is real: every screen the user sees
is backed by a real endpoint with real validation, real auth, and
real database constraints. No fake data, no skipped flows.

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS (`>=20 <23`) |
| Framework | NestJS | 11 |
| Language | TypeScript | 5.7, strict mode |
| Database | PostgreSQL | 18 (alpine) |
| Cache / OTP / sessions | Redis | 7 (alpine) |
| ORM | Prisma | 6 |
| Auth | JWT access + rotating refresh + bcrypt + libphonenumber-js | — |
| OAuth | Google + Apple OIDC | dev-mode decode (see [stubs](#known-stubs--limitations)) |
| HTTP | Express via `@nestjs/platform-express` + helmet | — |
| Validation | class-validator + class-transformer + Zod (env) | — |
| Tests | Jest + ioredis-mock | 60%+ on service layer required by brief |
| Lint | ESLint 9 (flat) + Prettier + Husky + lint-staged | zero errors, zero warnings on submit |
| Docs | Swagger UI at `/docs` | — |

## Prerequisites

- **Node.js** `>=20.0.0 <23.0.0` (the brief specifies 20 LTS)
- **npm** (bundled with Node)
- **Docker + Docker Compose** for Postgres and Redis (no native install needed)

## Quick start (cold clone → running in under 5 minutes)

```bash
# 1. Install
npm install

# 2. Bring up Postgres 18 + Redis 7
docker compose up -d
# wait for the healthchecks to pass (~5–10s)

# 3. Wire env
cp .env.example .env
# Generate two strong JWT secrets and put them in .env:
node -e "const c=require('crypto');console.log('JWT_ACCESS_SECRET='+c.randomBytes(48).toString('hex'));console.log('JWT_REFRESH_SECRET='+c.randomBytes(48).toString('hex'));"

# 4. Apply migrations + seed categories
npm run prisma:migrate:deploy
npm run db:seed

# 5. Start the dev server
npm run start:dev
```

The server listens on **`http://localhost:3000`**:

- `GET  /health` — liveness probe (DB ping + uptime)
- `GET  /docs` — Swagger UI for the entire API
- `POST /api/v1/...` — versioned endpoints
- `GET  /uploads/...` — public static-served file reads

A first smoke test once running:

```bash
curl http://localhost:3000/health
# → {"success":true,"data":{"status":"ok","db":"ok",...}}
```

## Environment variables

All variables are validated by Zod at boot — a missing or
malformed value produces a readable error and the app refuses to
start.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Standard env tag |
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_URL` | `postgresql://shoppa:shoppa@localhost:5432/shoppa` | Prisma connection |
| `REDIS_URL` | `redis://localhost:6379` | OTP storage + rate-limit counters |
| `API_PREFIX` | `api/v1` | Route prefix (excluded for `/health` and `/uploads`) |
| `CORS_ORIGINS` | (unset → all) | Comma-separated allow-list for browser clients |
| `JWT_ACCESS_SECRET` | — | Min 32 chars; signs access tokens |
| `JWT_REFRESH_SECRET` | — | Min 32 chars; signs refresh tokens |
| `JWT_ACCESS_TTL` | `15m` | jsonwebtoken-style duration |
| `JWT_REFRESH_TTL` | `30d` | jsonwebtoken-style duration |
| `OAUTH_DEV_MODE` | `true` | When `true`, OAuth tokens are decoded without verifying signatures (see [stubs](#known-stubs--limitations)) |
| `UPLOADS_DIR` | `./uploads` | On-disk storage for uploaded files |
| `UPLOADS_MAX_BYTES` | `10485760` (10MB) | Rejected at multer + the service layer |
| `UPLOADS_PUBLIC_BASE_URL` | `/uploads` | Path uploaded URLs are served from |

## Endpoints (high-level reference)

Full schema with request/response shapes is at **`/docs`** while the
server runs.

### Auth (`/api/v1/auth/*`)

| Endpoint | Purpose |
|---|---|
| `POST /auth/otp/request` | Send a 6-digit OTP to a phone (logged to console in dev) |
| `POST /auth/otp/verify` | Verify OTP, return a 15-min `signupToken` |
| `POST /auth/signup` | Create user + wallet from `signupToken` + profile fields |
| `POST /auth/login` | Email-or-phone + password, returns access + refresh |
| `POST /auth/refresh` | Rotate refresh token (revokes the old row) |
| `POST /auth/logout` | Revoke a refresh token |
| `POST /auth/oauth/google` | Sign in / sign up with a Google id_token |
| `POST /auth/oauth/apple` | Sign in / sign up with an Apple identity_token |
| `POST /auth/forgot-password` | Send a reset token (logged in dev); silent on unknown identifiers |
| `POST /auth/reset-password` | Consume token, rotate password, revoke all sessions |

### Domain (`/api/v1/*`, JWT-protected unless noted)

| Endpoint | Purpose |
|---|---|
| `GET  /categories` | Public — categories for home pills + selection sheet |
| `GET  /me` / `PATCH /me` | Profile read / edit |
| `PATCH /me/notifications` | Toggle notifications on/off |
| `POST /me/change-password` | Requires current password; revokes other sessions |
| `GET/POST/PATCH/DELETE /addresses` | Address book CRUD with one-default invariant |
| `POST /uploads` | Multipart file upload — returns `{id, key, url, mime, sizeBytes}` |
| `POST /posts` | Create post + nested items in one transaction |
| `GET  /posts/me` | Caller's posts, newest first |
| `GET  /posts/:id` | Post detail (buyer or assigned shopper only) |
| `POST /posts/:id/pay` | Wallet → escrow debit + post status flip + Transaction row |
| `GET  /conversations` | List as buyer or shopper, excluding hidden rows |
| `POST /conversations` | Get-or-create by `(postId, counterpartyId)` |
| `GET  /conversations/:id/messages` | Cursor-paginated read |
| `POST /conversations/:id/messages` | Text and/or up to 4 attachments |
| `POST /conversations/:id/read` | Mark counterparty's messages as read up to cursor |
| `GET/POST/DELETE /blocks` | Block / unblock + list |
| `GET  /wallet` | Balance + virtual account |
| `GET  /wallet/transactions` | Cursor-paginated history |
| `POST /wallet/topup` | Synchronous top-up stub |
| `POST /feedback` | Report-a-problem or general feedback |

### Static

| Endpoint | Purpose |
|---|---|
| `GET /uploads/<key>` | Public read for uploaded files (Express static, outside the API prefix so URLs round-trip cleanly) |

## Running the tests

```bash
npm test                       # all unit tests
npm run test:cov               # with coverage report
npm run test:watch             # watch mode
```

Coverage on the service layer averages **~92%** across all twelve
services (well above the brief's 60% floor):

| Service | % stmt |
|---|---|
| AuthService | 100 |
| PasswordService | 100 |
| OAuthVerifierService | 100 |
| OtpService | 100 |
| AddressesService | 100 |
| UploadsService | 100 |
| PostsService | 96 |
| MeService | 80 |
| BlocksService | 90 |
| WalletService | 87 |
| JwtTokenService | 89 |
| ConversationsService | 68 |

The wallet, escrow, refresh-rotation, and password-reset flows all
have explicit rollback assertions per the brief: every cross-record
mutation lives inside `prisma.$transaction(...)` so a partial failure
unwinds as a unit.

## Architecture decisions (the non-obvious ones)

- **Single response envelope.** Every successful controller return is
  wrapped in `{success: true, data: ...}` by a global interceptor; every
  thrown exception is normalised to `{success: false, error: {code, message,
  details?}}` by a global filter. Domain code throws `AppException` with
  a stable `ErrorCode` so the mobile client switches on string codes
  instead of parsing English.
- **Refresh tokens stored as bcrypt hashes.** A leaked `refresh_tokens`
  row is useless without the raw `jti` from the JWT. Logout / change-
  password / reset-password all revoke rows rather than delete them so
  audit history stays intact.
- **Phone normalisation at the edge.** `+234801…`, `0801…`, and `08012345678`
  all resolve to the same canonical E.164 string before hitting the
  unique index, so login-by-phone is robust to user formatting.
- **OAuth normalisation.** Apple emits `email_verified` as the string
  `"true"`; Google emits a boolean. The verifier flattens both into a
  single `OAuthIdentity` shape so `AuthService.oauthSignupOrLogin` doesn't
  branch on provider quirks.
- **Wallet invariants in transactions.** `topup` and `payForPost` both
  wrap balance changes + transaction-row inserts in a single `$transaction`
  so a row insert failure rolls the balance back. The spec covers the
  rollback path explicitly.
- **No enumeration leaks.** Login, post-detail, address-update, and the
  forgot-password flow all return `NOT_FOUND` (or silently succeed) on
  unknown ids instead of `FORBIDDEN`/`409`, so an attacker can't probe
  for valid identifiers.
- **Conversation `(buyer, shopper, post)` triple is unique.** Re-opening
  a chat about an existing post is idempotent through `prisma.upsert`,
  with the hidden-flag for the re-opening side cleared.
- **Blocks are bidirectional.** `isBlockedEitherWay` checks both
  directions before allowing message send or new conversation, so a
  blocked party can't reach back through the other role.

## Project structure

```
src/
├── main.ts                     bootstrap (helmet, CORS, ValidationPipe, Swagger, /uploads static)
├── app.module.ts               module composition
├── config/                     Zod-validated env + injectable AppConfigService
├── common/                     response envelope, error codes, exception filter
├── prisma/                     PrismaService (lifecycle hooks)
├── redis/                      ioredis client
└── modules/
    ├── auth/                   JWT, password, OTP, OAuth verifier, signup/login/refresh/logout
    ├── uploads/                multer-backed file persistence
    ├── addresses/              CRUD with one-default invariant
    ├── posts/                  posts + items + categories
    ├── conversations/          conversations, messages, blocks
    ├── wallet/                 balance, transactions, top-up, post escrow
    ├── me/                     profile, notifications, change/forgot/reset password
    ├── feedback/               report + general feedback
    └── health/                 DB ping + uptime
prisma/
├── schema.prisma               Page 3 data model
├── migrations/                 generated SQL (apply with prisma migrate deploy)
└── seed.ts                     idempotent category upsert
```

## Known stubs & limitations

These are intentional shortcuts for the 72-hour assessment build —
each is documented here so reviewers don't go hunting.

- **OAuth signature verification is stubbed in dev mode.** With
  `OAUTH_DEV_MODE=true` the verifier decodes the id_token without
  checking its signature so the mobile dev loop can synthesise tokens
  via `jsonwebtoken.sign`. Production must set `OAUTH_DEV_MODE=false`
  and add `google-auth-library` + an Apple JWKS lookup; the failure
  path already returns the right `AppException`.
- **Phone OTP is logged to the console in dev.** No SMS provider is
  wired. The OTP is also returned in the response under `devCode` when
  `NODE_ENV !== 'production'`.
- **Wallet top-up is a synchronous stub.** A real payment rail would
  call the provider and wait for a webhook. Here, top-up immediately
  increments the balance and writes a `TOPUP` transaction.
- **Push notifications are reduced to a boolean preference** on the
  user (`notificationsEnabled`). No real APNs/FCM integration. The bell
  icon on the messages list is purely UI.
- **Uploads are local-disk + static-served.** Production would write to
  S3 (or equivalent) and serve via signed URLs. The Upload model
  already separates `key` from `url` so swapping the storage backend
  is contained to `UploadsService.persist`.
- **Password-reset emails are logged to the console.** The email
  delivery layer is out of scope; the token format and TTL are real.
- **No "offers" model.** The post-success screen mentions offers but
  the offer-management UI is on a different page (other developers'
  scope). The schema's `Post.shopperId` slot is the join point when
  that flow lands.
- **Geocoding / address autocomplete** in the new-address screen is a
  mobile + 3rd-party concern (Google Places). The backend stores
  whatever the client submits.
