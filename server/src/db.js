import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function query(text, params) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("query(text, params): `text` must be a non-empty SQL string");
  }
  return pool.query(text, params);
}