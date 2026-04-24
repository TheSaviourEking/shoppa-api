import {
  MessageType,
  PostStatus,
  PrismaClient,
  TransactionStatus,
  TransactionType,
  UserGoal,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Categories visible on the Create Post select-a-category screen.
// Order and iconKey are referenced by the mobile client to map to
// its bundled asset set.
const CATEGORIES = [
  { name: 'Grocery (food stuffs)', iconKey: 'grocery', sortOrder: 10 },
  { name: 'Electronics', iconKey: 'electronics', sortOrder: 20 },
  { name: 'Vehicles / Parts', iconKey: 'vehicles', sortOrder: 30 },
  { name: 'Home Appliances', iconKey: 'appliances', sortOrder: 40 },
  { name: 'Cooking Utensils', iconKey: 'utensils', sortOrder: 50 },
  { name: 'Building Materials', iconKey: 'materials', sortOrder: 60 },
  { name: 'Food', iconKey: 'food', sortOrder: 70 },
  { name: 'Others', iconKey: 'others', sortOrder: 999 },
] as const;

// ─── Demo accounts ────────────────────────────────────────────────────
// All seeded users share the same password for review convenience. Mark
// these as test fixtures in any docs you ship.
const SEED_PASSWORD = 'shoppa1234';

const BUYER = {
  email: 'aidanma@shoppa.dev',
  phone: '+2348012345678',
  firstName: 'Aidanma',
  lastName: 'Toluwalope',
};

const SHOPPER_A = {
  email: 'adamu@shoppa.dev',
  phone: '+2348023456789',
  firstName: 'Adamu',
  lastName: 'Garbinus',
};

const SHOPPER_B = {
  email: 'tolu@shoppa.dev',
  phone: '+2348034567890',
  firstName: 'Tolu',
  lastName: 'Bankole',
};

// Public, no-auth-required image source for seeded image messages. Each
// `picsum.photos` URL is content-addressed by id so re-runs return the
// same picture instead of cycling.
const SAMPLE_IMAGE_URLS = [
  'https://picsum.photos/id/1015/600/600',
  'https://picsum.photos/id/1025/600/600',
  'https://picsum.photos/id/1043/600/600',
  'https://picsum.photos/id/1062/600/600',
];

interface SeedUserInput {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
}

async function upsertSeedUser(
  input: SeedUserInput,
  passwordHash: string,
  vaSuffix: string,
): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { id: existing.id };

  const created = await prisma.user.create({
    data: {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      goal: UserGoal.BUY,
      wallet: { create: { virtualAccountNumber: `90${vaSuffix}` } },
    },
  });
  return { id: created.id };
}

async function ensureWallet(userId: string, balanceNgn: number): Promise<void> {
  await prisma.wallet.upsert({
    where: { userId },
    create: {
      userId,
      virtualAccountNumber: `90${userId.slice(-8)}`,
      balance: balanceNgn,
    },
    update: { balance: balanceNgn },
  });
}

async function ensureAddress(userId: string): Promise<{ id: string }> {
  const existing = await prisma.address.findFirst({ where: { userId } });
  if (existing) return { id: existing.id };
  const created = await prisma.address.create({
    data: {
      userId,
      label: 'Home',
      line: '14 Adeola Odeku Street',
      city: 'Victoria Island',
      state: 'Lagos',
      country: 'Nigeria',
      isDefault: true,
    },
  });
  return { id: created.id };
}

interface PostFixture {
  categoryName: string;
  status: PostStatus;
  budget: number;
  note: string;
  items: { name: string }[];
}

async function ensurePost(
  buyerId: string,
  addressId: string,
  fixture: PostFixture,
): Promise<{ id: string }> {
  const category = await prisma.category.findUnique({ where: { name: fixture.categoryName } });
  if (!category) throw new Error(`category not seeded: ${fixture.categoryName}`);

  const existing = await prisma.post.findFirst({
    where: { userId: buyerId, categoryId: category.id, status: fixture.status },
  });
  if (existing) return { id: existing.id };

  const created = await prisma.post.create({
    data: {
      userId: buyerId,
      categoryId: category.id,
      deliveryAddressId: addressId,
      note: fixture.note,
      budget: fixture.budget,
      installmentsCount: 1,
      status: fixture.status,
      items: { create: fixture.items },
    },
  });
  return { id: created.id };
}

async function ensureUpload(userId: string, url: string, index: number): Promise<{ id: string }> {
  const key = `seed/${userId}-${index}.jpg`;
  const existing = await prisma.upload.findUnique({ where: { key } });
  if (existing) return { id: existing.id };
  const created = await prisma.upload.create({
    data: { userId, key, url, mime: 'image/jpeg', sizeBytes: 120_000 },
  });
  return { id: created.id };
}

interface MessageFixture {
  senderId: string;
  body?: string;
  imageUploadIds?: string[];
  read?: boolean;
  /** Minutes ago — keeps the chat ordered without timestamp gymnastics. */
  minutesAgo: number;
}

async function ensureConversation(
  buyerId: string,
  shopperId: string,
  postId: string,
  messages: MessageFixture[],
): Promise<{ id: string }> {
  const existing = await prisma.conversation.findUnique({
    where: { buyerId_shopperId_postId: { buyerId, shopperId, postId } },
  });
  if (existing) return { id: existing.id };

  const conv = await prisma.conversation.create({
    data: { buyerId, shopperId, postId },
  });

  const now = Date.now();
  for (const m of messages) {
    const createdAt = new Date(now - m.minutesAgo * 60_000);
    const hasImages = !!m.imageUploadIds?.length;
    const message = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: m.senderId,
        body: m.body ?? null,
        type: hasImages ? MessageType.IMAGE : MessageType.TEXT,
        readAt: m.read ? createdAt : null,
        createdAt,
        attachments: hasImages
          ? { create: m.imageUploadIds!.map((uploadId) => ({ uploadId })) }
          : undefined,
      },
    });
    // Touch lastMessageAt so the list orders correctly even if we add
    // future messages out of strict chronological order.
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: message.createdAt },
    });
  }

  return { id: conv.id };
}

async function ensurePaidTransaction(
  buyerWalletId: string,
  buyerId: string,
  shopperId: string,
  postId: string,
  amount: number,
): Promise<void> {
  const existing = await prisma.transaction.findFirst({
    where: { walletId: buyerWalletId, postId, type: TransactionType.DEBIT },
  });
  if (existing) return;
  await prisma.transaction.create({
    data: {
      walletId: buyerWalletId,
      type: TransactionType.DEBIT,
      amount,
      description: 'Grocery payment to Adamu',
      postId,
      counterpartyUserId: shopperId,
      status: TransactionStatus.SUCCESS,
    },
  });
  // Suppress unused-var lint when we extend this in the future.
  void buyerId;
}

async function main(): Promise<void> {
  // ─── Categories ──────────────────────────────────────────────────────
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { iconKey: category.iconKey, sortOrder: category.sortOrder },
      create: category,
    });
  }
  const categoryCount = await prisma.category.count();

  console.log(`✓ seeded ${categoryCount} categories`);

  // ─── Demo users ──────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const buyer = await upsertSeedUser(BUYER, passwordHash, '01010101');
  const shopperA = await upsertSeedUser(SHOPPER_A, passwordHash, '02020202');
  const shopperB = await upsertSeedUser(SHOPPER_B, passwordHash, '03030303');

  console.log(
    `✓ seeded users: buyer ${buyer.id}, shopperA ${shopperA.id}, shopperB ${shopperB.id}`,
  );

  await ensureWallet(buyer.id, 750_000);
  await ensureWallet(shopperA.id, 0);
  await ensureWallet(shopperB.id, 0);

  // ─── Posts (one per status to drive the three header variants) ───────
  const address = await ensureAddress(buyer.id);

  const groceryPost = await ensurePost(buyer.id, address.id, {
    categoryName: 'Grocery (food stuffs)',
    status: PostStatus.POSTED,
    budget: 500_000,
    note: 'Need bulk groceries for family event this weekend.',
    items: [{ name: 'Rice (50kg)' }, { name: 'Yam (large)' }, { name: 'Cooking oil (5L)' }],
  });
  const electronicsPost = await ensurePost(buyer.id, address.id, {
    categoryName: 'Electronics',
    status: PostStatus.PAID,
    budget: 260_460,
    note: 'Bluetooth speaker + extension cord.',
    items: [{ name: 'JBL portable speaker' }, { name: '4-way extension' }],
  });
  const appliancesPost = await ensurePost(buyer.id, address.id, {
    categoryName: 'Home Appliances',
    status: PostStatus.CANCELLED,
    budget: 80_000,
    note: 'Toaster + small kettle.',
    items: [{ name: '2-slice toaster' }, { name: '1L kettle' }],
  });

  // Mark the paid post's wallet ledger so the wallet screen reflects it.
  const buyerWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: buyer.id } });
  await ensurePaidTransaction(buyerWallet.id, buyer.id, shopperA.id, electronicsPost.id, 260_460);

  // ─── Sample uploads (used in image messages) ─────────────────────────
  const buyerUploads = await Promise.all(
    SAMPLE_IMAGE_URLS.map((url, i) => ensureUpload(buyer.id, url, i)),
  );

  // ─── Conversations & messages ────────────────────────────────────────
  // Conversation 1 — fully populated, mirrors the figma 04-conversation-* screens.
  await ensureConversation(buyer.id, shopperA.id, groceryPost.id, [
    {
      senderId: buyer.id,
      body: 'I can help you get these from isale obalende, lmk what your thoughts areis simply dummy text of the printing and typesetting industry.',
      read: true,
      minutesAgo: 60,
    },
    {
      senderId: shopperA.id,
      body: 'when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries.',
      minutesAgo: 55,
      read: true,
    },
    { senderId: buyer.id, body: "Let's get it son!", read: true, minutesAgo: 50 },
    {
      senderId: buyer.id,
      imageUploadIds: buyerUploads.map((u) => u.id),
      read: true,
      minutesAgo: 45,
    },
    { senderId: buyer.id, body: "Let's get lunch soon!", read: false, minutesAgo: 30 },
    { senderId: shopperA.id, body: "Let's get lunch soon!", minutesAgo: 25 },
  ]);

  // Conversation 2 — short thread on the same post with a different shopper.
  await ensureConversation(buyer.id, shopperB.id, groceryPost.id, [
    { senderId: shopperB.id, body: 'Hi! I can help with the rice and yam.', minutesAgo: 90 },
    { senderId: buyer.id, body: 'Great — what would your fee be?', read: true, minutesAgo: 85 },
  ]);

  // Conversation 3 — wired to the PAID post so the green-check header variant has data.
  await ensureConversation(buyer.id, shopperA.id, electronicsPost.id, [
    { senderId: shopperA.id, body: 'Speaker delivered ✅', read: true, minutesAgo: 600 },
    { senderId: buyer.id, body: 'Thanks! Got it.', read: true, minutesAgo: 595 },
  ]);

  // Conversation 4 — wired to the CANCELLED post so the red-X header variant has data.
  await ensureConversation(buyer.id, shopperB.id, appliancesPost.id, [
    { senderId: shopperB.id, body: 'I can source the kettle today.', read: true, minutesAgo: 1440 },
    {
      senderId: buyer.id,
      body: 'Sorry — had to cancel this one. Will repost later.',
      read: true,
      minutesAgo: 1430,
    },
  ]);

  console.log(
    `✓ seeded sample conversations — log in as ${BUYER.email} (password: ${SEED_PASSWORD}) to see them`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
