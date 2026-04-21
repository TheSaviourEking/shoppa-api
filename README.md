# Shoppa Backend

NestJS + TypeScript REST API for the Shoppa shopping-request application. Part of a three-day engineering assessment — Page 3 scope (Saviour).

## Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: NestJS 11
- **Language**: TypeScript 5.7 (strict mode)
- **Database**: PostgreSQL 18
- **Cache / ephemeral store**: Redis 7
- **ORM**: Prisma (added in a subsequent commit)
- **Auth**: JWT access + refresh tokens (added in a subsequent commit)
- **Testing**: Jest (unit + e2e)
- **Lint / format**: ESLint 9 (flat config) + Prettier + Husky + lint-staged

## Prerequisites

- Node.js `>=20.0.0 <23.0.0`
- npm (bundled with Node)
- Docker + Docker Compose (for Postgres + Redis)

## Setup (this commit — bootstrap only)

```bash
npm install
npm run lint          # zero errors/warnings expected
npm run build         # compiles to dist/
npm run start:dev     # runs on port 3000 (no routes yet)
```

## Planned structure

Subsequent commits will add:

- `docker-compose.yml` for local Postgres + Redis
- Typed config module with Zod env validation
- Prisma schema covering Page 3 domain (users, posts, addresses, conversations, messages, wallet, transactions)
- Global response envelope interceptor + exception filter
- Auth module (phone OTP, email/phone login, Google + Apple OAuth, JWT rotation)
- Swagger docs at `/docs`
- Health check at `/health`

See git log for progress.

## Known limitations (to be updated as work progresses)

- OAuth (Google, Apple) token verification will use a `OAUTH_DEV_MODE` bypass for local testing; real provider credentials are out of scope.
- Payment rails (wallet top-up) are stubbed — transactions are written synchronously without a real provider.
- Push notifications reduced to a user preference flag.
- SMS for phone OTP: code is logged to console in development.
