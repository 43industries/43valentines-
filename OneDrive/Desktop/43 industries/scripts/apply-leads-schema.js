/**
 * Applies the leads table schema to your Supabase database.
 * Run once: node scripts/apply-leads-schema.js
 *
 * Set DATABASE_URL first. From Supabase: Settings → Database → Connection string (URI).
 * Use the "Transaction" pooler URI, e.g.:
 * postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Set DATABASE_URL (Supabase → Settings → Database → Connection string).');
  process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260226000000_create_leads.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('Leads table and policy applied.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
