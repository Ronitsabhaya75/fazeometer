import pg from "pg";
import { MongoClient, type Db } from "mongodb";
import { Redis } from "ioredis";
import { cfg } from "./config.js";
import { coreSchema, timescaleSteps, plainFallback } from "./schema.js";

export const pool = new pg.Pool({ connectionString: cfg.pgUrl, max: 10 });
export const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
const mongo = new MongoClient(cfg.mongoUrl, { serverSelectionTimeoutMS: 5000 });
export let mdb: Db;
export let hasTimescale = false;

export const q = <T extends pg.QueryResultRow = any>(text: string, params?: any[]) =>
  pool.query<T>(text, params);

export async function connectAll() {
  await redis.connect();
  await mongo.connect();
  mdb = mongo.db(cfg.mongoDb);
  await pool.query("SELECT 1");
}

export async function migrate() {
  for (const stmt of coreSchema) await pool.query(stmt);

  hasTimescale = true;
  for (const stmt of timescaleSteps) {
    try {
      await pool.query(stmt);
    } catch (err: any) {
      // Compression and retention are optional. Extension, hypertable and view are not.
      const optional = /compress|retention/.test(stmt);
      if (!optional) hasTimescale = false;
      console.warn(`[tigerdata] step skipped (${err.message.split("\n")[0]})`);
      if (!hasTimescale) break;
    }
  }
  if (!hasTimescale) await pool.query(plainFallback);

  await mdb.collection("audit_events").createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
  await mdb.collection("surveys").createIndex({ userId: 1 });
  await mdb.collection("part_meta").createIndex({ partId: 1 }, { unique: true });
  await mdb.collection("recommendations").createIndex({ userId: 1, at: -1 });

  console.log(`[tigerdata] ready (${hasTimescale ? "TimescaleDB hypertable" : "plain Postgres fallback"})`);
}

export async function audit(type: string, data: Record<string, unknown>) {
  try {
    await mdb.collection("audit_events").insertOne({ type, ...data, at: new Date() });
  } catch {
    /* logging must never break a request */
  }
}
