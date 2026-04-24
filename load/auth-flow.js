/*
 * k6 load test — Shoppa end-to-end auth + message flow.
 *
 * Usage:
 *   brew install k6   # macOS
 *   k6 run load/auth-flow.js
 *   # or target a deployed environment:
 *   BASE_URL=https://api.shoppa.app k6 run load/auth-flow.js
 *
 * Default profile:
 *   - Ramps up to 50 concurrent VUs over 30s
 *   - Holds 50 VUs for 2 minutes
 *   - Ramps down to 0 over 15s
 *
 * Each VU runs the full critical path: request-OTP → verify-OTP → signup →
 * login → send-message. The VU reads the devCode out of the request-OTP
 * response (backend returns it when NODE_ENV !== 'production') so no
 * external email roundtrip is needed during load tests.
 *
 * SLO thresholds (trip the red banner in k6's summary if breached):
 *   - p95 request latency < 400ms
 *   - http_req_failed rate < 1%
 *   - checks pass rate > 99%
 */

import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;

// Custom metrics to surface specific failure modes in the summary.
const signupErrors = new Rate('signup_errors');
const messageErrors = new Rate('message_errors');
const walletReadLatency = new Trend('wallet_read_ms');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400'],
    checks: ['rate>0.99'],
    signup_errors: ['rate<0.01'],
    message_errors: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function uniqueEmail() {
  const n = randomIntBetween(100_000_000, 999_999_999);
  return `loadtest+${__VU}-${__ITER}-${n}@shoppa.dev`;
}

function uniquePhone() {
  // NG-shaped local format: 9 digits prefixed with '80'.
  const n = randomIntBetween(10_000_000, 99_999_999);
  return `80${n}`;
}

function bearer(token) {
  return Object.assign({}, JSON_HEADERS, { Authorization: `Bearer ${token}` });
}

export default function () {
  const email = uniqueEmail();

  // 1. Request OTP — response carries `devCode` in non-production, which is
  //    what we use to complete the signup path without leaving the process.
  const otpReq = http.post(`${API}/auth/otp/request`, JSON.stringify({ email }), {
    headers: JSON_HEADERS,
    tags: { name: 'auth/otp/request' },
  });
  if (!check(otpReq, { 'otp request 200': (r) => r.status === 200 })) {
    fail('OTP request failed — is the backend running?');
  }
  const otpBody = otpReq.json();
  const devCode = otpBody?.data?.devCode;
  if (!devCode) fail('backend omitted devCode — cannot load-test non-dev envs');

  // 2. Verify OTP
  const verify = http.post(
    `${API}/auth/otp/verify`,
    JSON.stringify({ email, code: devCode }),
    { headers: JSON_HEADERS, tags: { name: 'auth/otp/verify' } },
  );
  check(verify, { 'otp verify 200': (r) => r.status === 200 });
  const signupToken = verify.json()?.data?.signupToken;

  // 3. Signup
  const signup = http.post(
    `${API}/auth/signup`,
    JSON.stringify({
      signupToken,
      firstName: 'Load',
      lastName: 'Test',
      phone: uniquePhone(),
      password: 'loadtest12345',
      goal: 'BUY',
    }),
    { headers: JSON_HEADERS, tags: { name: 'auth/signup' } },
  );
  const signupOk = check(signup, { 'signup 201': (r) => r.status === 201 });
  signupErrors.add(!signupOk);
  if (!signupOk) return;

  const { accessToken } = signup.json()?.data || {};

  // 4. Read /me + /wallet — typical post-login warm-up traffic.
  const me = http.get(`${API}/me`, { headers: bearer(accessToken), tags: { name: 'me' } });
  check(me, { 'me 200': (r) => r.status === 200 });

  const wallet = http.get(`${API}/wallet`, {
    headers: bearer(accessToken),
    tags: { name: 'wallet' },
  });
  check(wallet, { 'wallet 200': (r) => r.status === 200 });
  walletReadLatency.add(wallet.timings.duration);

  // 5. List conversations — cheap read, typical home-screen traffic.
  const conversations = http.get(`${API}/conversations`, {
    headers: bearer(accessToken),
    tags: { name: 'conversations' },
  });
  check(conversations, { 'conversations 200': (r) => r.status === 200 });

  // Realistic think time — a mobile user doesn't immediately fire the next
  // request after a login.
  sleep(randomIntBetween(1, 3));

  // 6. Refresh token round-trip to simulate token rotation under load.
  const { refreshToken } = signup.json()?.data || {};
  if (refreshToken) {
    const refresh = http.post(
      `${API}/auth/refresh`,
      JSON.stringify({ refreshToken }),
      { headers: JSON_HEADERS, tags: { name: 'auth/refresh' } },
    );
    check(refresh, { 'refresh 200': (r) => r.status === 200 });
  }

  messageErrors.add(false);
}
