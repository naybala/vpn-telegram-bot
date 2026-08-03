#!/usr/bin/env node
// ==================================================================
// 🛠️  DATABASE MIGRATION RUNNER
// Usage: npm run migrate
//
// What it does:
//   1. Loads .env
//   2. Creates the database if it doesn't exist
//   3. Creates a `migrations` tracking table
//   4. Runs any SQL files in /migrations not yet applied
// ==================================================================

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  console.error("❌ Missing DB_HOST, DB_USER, or DB_NAME in .env");
  process.exit(1);
}

async function run() {
  // ── Step 1: Connect without selecting a database ──────────────────
  const root = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS || "",
  });

  // ── Step 2: Create database if not exists ─────────────────────────
  await root.execute(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  console.log(`✅ Database \`${DB_NAME}\` is ready.`);
  await root.end();

  // ── Step 3: Reconnect with the target database ────────────────────
  const db = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS || "",
    database: DB_NAME,
    multipleStatements: true, // needed to run multi-statement SQL files
  });

  // ── Step 4: Create migrations tracking table ──────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // ── Step 5: Find already-applied migrations ───────────────────────
  const [applied] = await db.execute("SELECT filename FROM migrations");
  const appliedSet = new Set(applied.map((r) => r.filename));

  // ── Step 6: Read and sort SQL migration files ─────────────────────
  const migrationsDir = __dirname;
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // ensures 001_, 002_, ... order

  if (sqlFiles.length === 0) {
    console.log("ℹ️  No SQL migration files found.");
    await db.end();
    return;
  }

  // ── Step 7: Run pending migrations ───────────────────────────────
  let ranCount = 0;
  for (const file of sqlFiles) {
    if (appliedSet.has(file)) {
      console.log(`⏭️  Skipping  ${file} (already applied)`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");

    // Split into individual statements (handles multi-statement SQL files)
    const statements = sql
      .split(";")
      .map((s) => s.replace(/--.*$/gm, "").trim()) // strip -- comments
      .filter((s) => s.length > 0);

    console.log(`🔄 Applying  ${file} (${statements.length} statement(s))...`);
    for (const stmt of statements) {
      await db.execute(stmt);
    }
    await db.execute("INSERT INTO migrations (filename) VALUES (?)", [file]);
    console.log(`✅ Done      ${file}`);
    ranCount++;
  }

  if (ranCount === 0) {
    console.log("✨ All migrations are already up to date.");
  } else {
    console.log(`\n🎉 ${ranCount} migration(s) applied successfully.`);
  }

  await db.end();
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
