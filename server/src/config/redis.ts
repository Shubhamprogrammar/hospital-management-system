import { env } from "./env.js";
import Redis from "ioredis";
import { logger } from "../core/utils/logger.js";

let client: Redis | null = null;

export async function connectRedis() {
  if (!env.REDIS_URL) {
    logger.warn("REDIS_URL not configured — Redis features disabled (caching, rate limiting, sessions)");
    return;
  }
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on("error", (err) => {
    logger.error("Redis error", { error: err.message });
  });

  try {
    await client.connect();
    logger.info("Redis connected");
  } catch (error) {
    logger.warn("Redis connection failed — running without cache", {
      error: (error as Error).message,
    });
    client = null;
  }
}

export function getRedis(): Redis | null {
  return client;
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (!client) return;
  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  } catch {
    // cache is best-effort
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch {
    // best-effort
  }
}
