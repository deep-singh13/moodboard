import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL environment variable is required but was not provided.",
  );
}

const ssl = connectionString.includes("sslmode=require")
  ? { rejectUnauthorized: false }
  : undefined;

export const pool = new Pool({ connectionString, ssl });

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id          TEXT        PRIMARY KEY,
      type        TEXT        NOT NULL,
      url         TEXT,
      title       TEXT,
      subtitle    TEXT,
      image_url   TEXT,
      size        TEXT        NOT NULL,
      position_x  REAL        NOT NULL DEFAULT 0,
      position_y  REAL        NOT NULL DEFAULT 0,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      image_data  TEXT,
      completed   BOOLEAN     NOT NULL DEFAULT false
    )
  `);
}
