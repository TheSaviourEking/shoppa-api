import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sign as jwtSign } from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

/**
 * End-to-end test of the buyer's golden path. Hits the real Postgres
 * + Redis instances declared in docker-compose, mirroring what a
 * reviewer sees when they cold-clone and run `npm run test:e2e`.
 *
 * Each run creates fresh users with random emails so re-running
 * doesn't trip on unique-violations.
 */
describe('Golden path (buyer flow)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const buyerEmail = `e2e-buyer-${randomBytes(6).toString('hex')}@example.com`;
  const shopperEmail = `e2e-shopper-${randomBytes(6).toString('hex')}@example.com`;

  // Synthesise OAuth-style id_tokens for both parties — the verifier
  // is in dev mode (OAUTH_DEV_MODE=true) so the signature is ignored.
  const buyerToken = jwtSign(
    {
      sub: `oauth-${randomBytes(6).toString('hex')}`,
      email: buyerEmail,
      email_verified: true,
      given_name: 'Eke',
      family_name: 'Buyer',
    },
    'devsecret',
  );
  const shopperToken = jwtSign(
    {
      sub: `oauth-${randomBytes(6).toString('hex')}`,
      email: shopperEmail,
      email_verified: true,
      given_name: 'Adamu',
      family_name: 'Shopper',
    },
    'devsecret',
  );

  let buyerAccess = '';
  let shopperAccess = '';
  let shopperUserId = '';
  let categoryId = '';
  let addressId = '';
  let postId = '';
  let conversationId = '';
  let uploadId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Auth: OAuth signup for both parties ────────────────────────────

  it('signs the buyer up via OAuth and returns access + refresh tokens', async () => {
    const res = await request(server)
      .post('/api/v1/auth/oauth/google')
      .send({ idToken: buyerToken })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(buyerEmail);
    expect(res.body.data.accessToken).toBeTruthy();
    buyerAccess = res.body.data.accessToken;
  });

  it('signs the shopper up via OAuth', async () => {
    const res = await request(server)
      .post('/api/v1/auth/oauth/apple')
      .send({ identityToken: shopperToken })
      .expect(200);
    shopperAccess = res.body.data.accessToken;
    shopperUserId = res.body.data.user.id;
  });

  // ─── Profile + categories ───────────────────────────────────────────

  it('GET /me returns the buyer profile', async () => {
    const res = await request(server)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(200);
    expect(res.body.data.email).toBe(buyerEmail);
    expect(res.body.data.firstName).toBe('Eke');
  });

  it('GET /categories returns the seeded categories', async () => {
    const res = await request(server).get('/api/v1/categories').expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(8);
    categoryId = res.body.data[0].id;
  });

  // ─── Upload a 1×1 PNG ───────────────────────────────────────────────

  it('POST /uploads accepts a multipart image and returns a fetchable URL', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    const res = await request(server)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .attach('file', pixel, { filename: 'pixel.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.data.mime).toBe('image/png');
    expect(res.body.data.url).toMatch(
      /^https?:\/\/[^/]+\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]+\.png$/,
    );
    uploadId = res.body.data.id;

    // The URL is served by MinIO directly (or R2 in prod). Hit it via
    // global fetch to prove the bytes actually landed in the bucket.
    const fetched = await fetch(res.body.data.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/png');
    const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
    expect(fetchedBytes.equals(pixel)).toBe(true);
  });

  // ─── Address ────────────────────────────────────────────────────────

  it('POST /addresses creates a default address', async () => {
    const res = await request(server)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .send({
        label: 'ADDRESS 1',
        line: '53, Bamidele eletu Avenue Osapa',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        isDefault: true,
      })
      .expect(201);
    expect(res.body.data.isDefault).toBe(true);
    addressId = res.body.data.id;
  });

  // ─── Post (with an item carrying the upload key) ────────────────────

  it('POST /posts creates a post with nested items including an image', async () => {
    const res = await request(server)
      .post('/api/v1/posts')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .send({
        categoryId,
        deliveryAddressId: addressId,
        items: [
          { name: 'Tomatoes', imageKey: uploadId },
          { name: 'Titus Fish' },
          { name: 'Prawns' },
          { name: 'Periwinkle' },
        ],
        note: 'Help me Blend the Pepper all together',
        budget: 50000,
        installmentsCount: 2,
      })
      .expect(201);
    expect(res.body.data.items).toHaveLength(4);
    expect(res.body.data.budget).toBe('50000');
    expect(res.body.data.installmentsCount).toBe(2);
    expect(res.body.data.status).toBe('POSTED');
    postId = res.body.data.id;
  });

  it('GET /posts/me returns the new post', async () => {
    const res = await request(server)
      .get('/api/v1/posts/me')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(200);
    expect(res.body.data.find((p: { id: string }) => p.id === postId)).toBeTruthy();
  });

  // ─── Conversation between the two parties ───────────────────────────

  it('POST /conversations opens a chat between the buyer and the shopper', async () => {
    const res = await request(server)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .send({ postId, counterpartyId: shopperUserId })
      .expect(201);
    expect(res.body.data.buyer.id).not.toBe(res.body.data.shopper.id);
    conversationId = res.body.data.id;
  });

  it('POST /conversations/:id/messages sends a text message from the buyer', async () => {
    const res = await request(server)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${buyerAccess}`)
      .send({ body: "Let's get it son!" })
      .expect(201);
    expect(res.body.data.body).toBe("Let's get it son!");
    expect(res.body.data.type).toBe('TEXT');
  });

  it('GET /conversations/:id/messages returns the message for the shopper', async () => {
    const res = await request(server)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${shopperAccess}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].body).toBe("Let's get it son!");
  });

  // ─── Wallet: top up + escrow pay ────────────────────────────────────

  it('POST /wallet/topup credits the wallet', async () => {
    const res = await request(server)
      .post('/api/v1/wallet/topup')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .send({ amount: 100000 })
      .expect(200);
    expect(res.body.data.type).toBe('TOPUP');
    expect(res.body.data.amount).toBe('100000');
  });

  it('POST /posts/:id/pay debits the wallet and marks the post PAID', async () => {
    const res = await request(server)
      .post(`/api/v1/posts/${postId}/pay`)
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(200);
    expect(res.body.data.type).toBe('DEBIT');
    expect(res.body.data.amount).toBe('50000');
    expect(res.body.data.postId).toBe(postId);

    // Wallet balance is now 50000.
    const wallet = await request(server)
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(200);
    expect(wallet.body.data.balance).toBe('50000');

    // Post status flipped.
    const post = await request(server)
      .get(`/api/v1/posts/${postId}`)
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(200);
    expect(post.body.data.status).toBe('PAID');
  });

  it('rejects a second pay against the same post with POST_NOT_ELIGIBLE', async () => {
    const res = await request(server)
      .post(`/api/v1/posts/${postId}/pay`)
      .set('Authorization', `Bearer ${buyerAccess}`)
      .expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('POST_NOT_ELIGIBLE');
  });

  // ─── Health probe (excluded from API prefix) ────────────────────────

  it('GET /health reports db: ok', async () => {
    const res = await request(server).get('/health').expect(200);
    expect(res.body.data.db).toBe('ok');
  });
});
