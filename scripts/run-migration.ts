import pg from "pg";
import { readFileSync } from "fs";

// Supabase direct connection via session mode pooler
const DATABASE_URL = `postgresql://postgres.burjmjsiqwqtwnlrstgr:${process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  const sql = readFileSync("supabase/migrations/005_dashboard_access_and_resources.sql", "utf8");
  await client.query(sql);
  console.log("Migration 005 executed successfully.");

  // Verify
  const { rows: r1 } = await client.query("SELECT count(*) FROM dashboard_access_log");
  console.log("dashboard_access_log exists:", r1[0].count, "rows");
  const { rows: r2 } = await client.query("SELECT count(*) FROM state_resource_links");
  console.log("state_resource_links exists:", r2[0].count, "rows");

  await client.end();
}

main().catch(err => { console.error("Error:", err.message); process.exit(1); });
