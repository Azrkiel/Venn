import { Pool } from 'pg';
import { postgresSchemaStatements } from '@chat-adapter/state-pg';
import './env';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Configure DIRECT_URL or DATABASE_URL before migrating bot state.');
const client = new Pool({ connectionString: url, max: 1 });
try {
  for (const statement of postgresSchemaStatements) await client.query(statement);
  console.log('Chat SDK state schema migrated. No messages were read or written.');
} catch {
  console.error('Bot state migration failed. Check database connectivity and migration permissions.');
  process.exitCode = 1;
} finally { await client.end(); }
