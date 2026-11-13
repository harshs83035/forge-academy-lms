// Applies prisma/init.sql (idempotent). `--reset` drops everything first.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(here, "..", ".env")); } catch {}
const url = process.env.DATABASE_URL ?? "postgresql://lms:lms@localhost:5432/lms";
const client = new pg.Client({ connectionString: url });

for (let i = 0; ; i++) {
  try { await client.connect(); break; }
  catch (e) { if (i > 30) throw e; console.log("waiting for database..."); await new Promise((r) => setTimeout(r, 1000)); }
}
if (process.argv.includes("--reset")) {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  console.log("schema reset");
}
await client.query(fs.readFileSync(path.join(here, "..", "prisma", "init.sql"), "utf8"));
console.log("database schema ready");
await client.end();
