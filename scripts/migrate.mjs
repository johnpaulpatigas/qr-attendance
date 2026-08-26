import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from standard locations
const envFiles = [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, 'apps', 'teacher', '.env'),
  path.join(rootDir, 'apps', 'parent', '.env'),
  path.join(rootDir, 'supabase', '.env'),
];

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}

const { Client } = pg;

const MIGRATIONS_DIR = path.join(rootDir, 'supabase', 'migrations');
const TRACKING_TABLE = 'public._schema_migrations';

function resolveDatabaseUrl() {
  const url =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_DIRECT_URL ||
    process.env.SUPABASE_DIRECT_URL;

  if (url) return url;

  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    const user = encodeURIComponent(process.env.PGUSER);
    const pass = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : '';
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || '5432';
    const db = process.env.PGDATABASE;
    return `postgresql://${user}${pass}@${host}:${port}/${db}`;
  }

  return null;
}

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64)
    );
  `);
}

async function getAppliedMigrations(client) {
  await ensureTrackingTable(client);
  const res = await client.query(
    `SELECT version, name, applied_at, checksum FROM ${TRACKING_TABLE} ORDER BY version ASC`
  );
  return new Map(res.rows.map((row) => [row.version, row]));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f !== 'combined_schema.sql')
    .sort();

  return files.map((file) => {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const version = file.split('_')[0] || file;
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      file,
      version,
      filePath,
      content,
      checksum: computeChecksum(content),
    };
  });
}

async function runSingleFile(client, filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  console.log(`Running script: ${path.basename(filePath)}...`);
  await client.query(content);
  console.log(`✓ Completed: ${path.basename(filePath)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status') || args.includes('-s');
  const isCombined = args.includes('--combined') || args.includes('-c');
  const fileArgIndex = args.indexOf('--file');
  const targetFile = fileArgIndex !== -1 ? args[fileArgIndex + 1] : null;

  const dbUrl = resolveDatabaseUrl();

  if (!dbUrl) {
    console.error('\n❌ No database connection string found.');
    console.error('\nPlease provide DATABASE_URL or SUPABASE_DB_URL in your .env or environment:');
    console.error('Example:');
    console.error(
      '  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres'
    );
    console.error('  or (via connection pooler):');
    console.error(
      '  DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require\n'
    );
    process.exit(1);
  }

  const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const client = new Client({
    connectionString: dbUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database.');

    if (isCombined) {
      const combinedPath = path.join(MIGRATIONS_DIR, 'combined_schema.sql');
      if (!fs.existsSync(combinedPath)) {
        throw new Error(`combined_schema.sql not found at ${combinedPath}`);
      }
      console.log('\nApplying full combined_schema.sql...');
      await runSingleFile(client, combinedPath);
      console.log('\n✓ Combined schema successfully applied!\n');
      return;
    }

    if (targetFile) {
      const fullPath = path.isAbsolute(targetFile)
        ? targetFile
        : path.join(MIGRATIONS_DIR, targetFile);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
      }
      await runSingleFile(client, fullPath);
      return;
    }

    const migrations = getMigrationFiles();
    const appliedMap = await getAppliedMigrations(client);

    if (isStatus) {
      console.log('\n=== Database Migration Status ===\n');
      for (const m of migrations) {
        const applied = appliedMap.get(m.version);
        if (applied) {
          console.log(
            `  [APPLIED] ${m.file} (at ${new Date(applied.applied_at).toLocaleString()})`
          );
        } else {
          console.log(`  [PENDING] ${m.file}`);
        }
      }
      console.log('');
      return;
    }

    const pending = migrations.filter((m) => !appliedMap.has(m.version));

    if (pending.length === 0) {
      console.log('\nDatabase is up to date. No pending migrations found.\n');
      return;
    }

    console.log(`\nFound ${pending.length} pending migration(s):\n`);
    for (const m of pending) {
      console.log(`  - ${m.file}`);
    }
    console.log('');

    for (const migration of pending) {
      console.log(`Applying: ${migration.file}...`);
      const startTime = Date.now();

      await client.query('BEGIN');
      try {
        await client.query(migration.content);
        await client.query(
          `INSERT INTO ${TRACKING_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.file, migration.checksum]
        );
        await client.query('COMMIT');
        const elapsed = Date.now() - startTime;
        console.log(`✓ Applied: ${migration.file} (${elapsed}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n❌ Migration failed on ${migration.file}:\n`, err);
        throw err;
      }
    }

    console.log('\n✓ All migrations successfully applied!\n');
  } catch (err) {
    console.error('\nMigration error:', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
