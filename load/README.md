# Load tests (k6)

k6 is a CLI load-testing tool. Scripts here are pure JS — you don't need to
build the backend with any load-testing dependency; k6 drives it externally.

## Install

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6
```

## Run against localhost

```bash
# backend must be running (npm run start:dev) with NODE_ENV=development
# so the OTP endpoint returns devCode in the response.
k6 run load/auth-flow.js
```

## Run against a deployed environment

```bash
BASE_URL=https://api.shoppa.app k6 run load/auth-flow.js
```

Note: in production (`NODE_ENV=production`) the OTP endpoint doesn't return
`devCode` — load tests need a non-prod target or a modified script that
reads the code out of the email queue / backend log stream.

## What it exercises

The default script (`auth-flow.js`) runs this path per VU iteration:

1. `POST /auth/otp/request` — rate-limited by Redis
2. `POST /auth/otp/verify` — exchanges code for signup token
3. `POST /auth/signup` — bcrypt hash + wallet create in one transaction
4. `GET /me`
5. `GET /wallet`
6. `GET /conversations`
7. `POST /auth/refresh` — refresh token rotation with bcrypt verify

## SLOs (fail the run if breached)

- p95 request latency < 400ms
- request failure rate < 1%
- check success rate > 99%
- signup and message error rates < 1%

Adjust thresholds in `auth-flow.js` as the app scales.

## Profile used

- 0 → 50 VUs over 30 seconds (ramp up)
- 50 VUs held for 2 minutes
- 50 → 0 VUs over 15 seconds (ramp down)
- Total runtime: ~3 minutes

For heavier stress testing, edit the `stages` block — typical next step is
50 → 200 held for 10 minutes, then 200 → 500 for 5 minutes.
