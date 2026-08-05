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
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS note TEXT
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS board TEXT NOT NULL DEFAULT 'moodboard'
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS meta TEXT
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price NUMERIC
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS currency TEXT
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS availability TEXT
  `);
  await pool.query(`
    ALTER TABLE items ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ
  `);

  // Searchable index of District (district.in) restaurant pages, populated from
  // their public dining sitemap by scripts/src/ingestDistrictPlaces.ts. Lets the
  // Places tab offer name search without depending on District's own search API,
  // which is auth-gated. Empty until that script is run.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS district_places (
      slug      TEXT PRIMARY KEY,
      city      TEXT NOT NULL,
      name_text TEXT NOT NULL,
      url       TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS district_places_city_idx ON district_places (city)
  `);
}
