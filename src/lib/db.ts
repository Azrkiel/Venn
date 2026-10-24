import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const shared = globalThis as unknown as { vennDb?: PrismaClient };

export function getDb(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!shared.vennDb) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 4 });
    shared.vennDb = new PrismaClient({ adapter });
  }
  return shared.vennDb;
}
