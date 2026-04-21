import { PrismaClient } from '@prisma/client';

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

async function main(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { iconKey: category.iconKey, sortOrder: category.sortOrder },
      create: category,
    });
  }

  const count = await prisma.category.count();
  // eslint-disable-next-line no-console
  console.log(`✓ seeded ${count} categories`);
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
