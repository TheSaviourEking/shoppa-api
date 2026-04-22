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
| OAuth | Google + Apple OIDC | real signature + audience verification (`google-auth-library` + `jose`); dev-mode bypass for the test rig — see [stubs](#known-stubs--limitations) |
| Object storage | S3-compatible — MinIO in dev, Cloudflare R2 (or any equivalent) in prod | swap by env vars only |
| HTTP | Express via `@nestjs/platform-express` + helmet | — |
| Validation | class-validator + class-transformer + Zod (env) | — |
| Tests | Jest + ioredis-mock | 60%+ on service layer required by brief |
| Lint | ESLint 9 (flat) + Prettier + Husky + lint-staged | zero errors, zero warnings on submit |
| Docs | Swagger UI at `/docs` | — |

## Prerequisites

- **Node.js** `>=20.0.0 <23.0.0` (the brief specifies 20 LTS)
- **npm** (bundled with Node)
- **Docker + Docker Compose** for Postgres, Redis, and MinIO (no native install needed)

## Quick start (cold clone → running in under 5 minutes)

```bash
# 1. Install
npm install

# 2. Bring up Postgres 18 + Redis 7 + MinIO (S3-compatible)
docker compose up -d
# wait for the healthchecks to pass (~5–10s)
# minio-init runs once and creates the shoppa-uploads bucket with public-read policy

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

Uploaded files are served by **MinIO directly** at
`http://localhost:9000/shoppa-uploads/<key>`. The MinIO console is at
`http://localhost:9001` (login: `minioadmin` / `minioadmin`).

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
| `API_PREFIX` | `api/v1` | Route prefix (excluded for `/health`) |
| `CORS_ORIGINS` | (unset → all) | Comma-separated allow-list for browser clients |
| `JWT_ACCESS_SECRET` | — | Min 32 chars; signs access tokens |
| `JWT_REFRESH_SECRET` | — | Min 32 chars; signs refresh tokens |
| `JWT_ACCESS_TTL` | `15m` | jsonwebtoken-style duration |
| `JWT_REFRESH_TTL` | `30d` | jsonwebtoken-style duration |
| `OAUTH_DEV_MODE` | `true` | When `true`, OAuth tokens are decoded without signature verification — convenient for the test rig. Production sets `false` to enable real Google + Apple verification (see [Production OAuth setup](#production-oauth-setup)) |
| `GOOGLE_OAUTH_CLIENT_ID` | (unset) | Required when `OAUTH_DEV_MODE=false` — audience for `verifyIdToken` |
| `APPLE_OAUTH_AUDIENCE` | (unset) | Required when `OAUTH_DEV_MODE=false` — Apple Service ID |
| `UPLOADS_MAX_BYTES` | `10485760` (10MB) | Rejected at multer + the service layer |
| `S3_ENDPOINT` | `http://localhost:9000` | S3 API endpoint — MinIO in dev, R2 in prod |
| `S3_REGION` | `auto` | Required by SDK; R2 accepts `auto` |
| `S3_BUCKET` | `shoppa-uploads` | Bucket name |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Access key (R2 access key in prod) |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Secret (R2 secret in prod) |
| `S3_PUBLIC_BASE_URL` | `http://localhost:9000/shoppa-uploads` | Base URL we hand back to clients (your R2 custom domain in prod) |
| `S3_FORCE_PATH_STYLE` | `true` | MinIO needs path-style; R2 also accepts |

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

### Object storage (served by MinIO/R2 directly)

| Endpoint | Purpose |
|---|---|
| `GET <S3_PUBLIC_BASE_URL>/<key>` | Public read of an uploaded file. The `url` field returned from `POST /uploads` is already this fully-qualified URL — clients prepend nothing. In dev that's `http://localhost:9000/shoppa-uploads/<key>` (MinIO); in prod it's whatever you set `S3_PUBLIC_BASE_URL` to. |

## Running the tests

```bash
npm test                       # 100+ unit tests
npm run test:cov               # with coverage report
npm run test:watch             # watch mode
npm run test:e2e               # 15 e2e tests against real Postgres + Redis + MinIO
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
├── main.ts                     bootstrap (Swagger registration, app.listen)
├── bootstrap.ts                shared configureApp (helmet, CORS, ValidationPipe, prefix)
├── app.module.ts               module composition
├── config/                     Zod-validated env + injectable AppConfigService
├── common/                     response envelope, error codes, exception filter
├── prisma/                     PrismaService (lifecycle hooks)
├── redis/                      ioredis client
└── modules/
    ├── auth/                   JWT, password, OTP, OAuth verifier, signup/login/refresh/logout
    ├── uploads/                S3-compatible object storage via @aws-sdk/client-s3
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
test/
├── e2e/golden-path.e2e-spec.ts buyer flow against real Postgres + Redis + MinIO
└── mocks/jose.ts               module-name-mapped stub for jose (ESM) so unit tests load cleanly
```

## Production OAuth setup

Switch `OAUTH_DEV_MODE=false` and provide both audiences. The env
loader fails fast otherwise — production cannot accept arbitrary
Google/Apple-issued tokens.

```bash
OAUTH_DEV_MODE=false
GOOGLE_OAUTH_CLIENT_ID=<your-google-cloud-oauth-client-id>.apps.googleusercontent.com
APPLE_OAUTH_AUDIENCE=<your-apple-services-id>
```

Real verification then runs against Google's tokeninfo / public certs
(via `google-auth-library`) and Apple's JWKS at
`https://appleid.apple.com/auth/keys` (via `jose`), asserting
signature, issuer, audience, and expiry. Library failures translate
to `AppException(AUTH_UNAUTHORIZED)` so the response envelope stays
consistent with the rest of the API.

## Production object storage setup

Point the seven `S3_*` env vars at any S3-compatible service — no
code change needed. Cloudflare R2 example:

```bash
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=shoppa-uploads
S3_ACCESS_KEY_ID=<r2-access-key-id>
S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
S3_PUBLIC_BASE_URL=https://uploads.shoppa.app   # your R2 custom domain
S3_FORCE_PATH_STYLE=true
```

R2 is free up to 10GB storage / 1M Class A ops / 10M Class B ops per
month with **zero egress** — a good fit when the mobile client
fetches images frequently. AWS S3, Backblaze B2, Storj, MinIO
self-hosted — all work with the same code path.

## Known stubs & limitations

These are intentional shortcuts for the 72-hour assessment build —
each is documented here so reviewers don't go hunting.

### Real implementations now wired

The OAuth and uploads stubs from the original brief have been
replaced with production-credible integrations:

- **OAuth signature verification.** Dev mode (`OAUTH_DEV_MODE=true`,
  the default for the test rig) decodes id_tokens via `jwt.decode`
  so the mobile dev loop can synthesise tokens with
  `jsonwebtoken.sign`. Production (`OAUTH_DEV_MODE=false`) does
  real Google + Apple signature + audience verification — see
  [Production OAuth setup](#production-oauth-setup).
- **Object storage.** Files go to an S3-compatible service in both
  dev and prod — MinIO via docker-compose locally, Cloudflare R2 (or
  any equivalent) in prod. See
  [Production object storage setup](#production-object-storage-setup).

### Genuine stubs (need paid third-party services)

- **Phone OTP delivery.** The 6-digit code is logged to the console
  in dev and returned in the response under `devCode` when
  `NODE_ENV !== 'production'`. Production would swap the log line for
  a Twilio / Termii / SNS call.
- **Wallet top-up.** A real payment rail would initiate a transaction
  with the provider (Paystack, Flutterwave, etc.), wait for a webhook
  to confirm, then increment the balance. Here, top-up is synchronous:
  it credits the balance immediately and writes a `TOPUP` row. Same
  endpoint shape, async-ready architecture in front of it (the
  webhook handler is the only addition needed).
- **Virtual account number generation.** Each new wallet gets a
  random 10-digit account number at signup — production would call
  the payment provider's virtual-account API and store the issued
  number instead. The Wallet model already has the `virtualAccountProvider`
  + `virtualAccountNumber` columns ready.
- **Password-reset email delivery.** The reset token is logged to
  the console in dev. The token format, hashing, and TTL are all
  real; production would swap the log line for SendGrid / Resend / SES.
- **Push notifications.** Reduced to a boolean preference on the user
  (`notificationsEnabled`). No real APNs/FCM integration. The bell
  icon on the messages list is purely UI.

### Out of scope by assessment design

- **No "offers" model.** The post-success screen mentions offers but
  the offer-management UI is on another developer's page. The
  schema's `Post.shopperId` slot is the join point when that flow
  lands.
- **Geocoding / address autocomplete** in the new-address screen is a
  mobile + 3rd-party concern (Google Places). The backend stores
  whatever the client submits.
