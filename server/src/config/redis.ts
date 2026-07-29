import { env } from "./env";

let client: any = null;

export async function connectRedis() {
  if (!env.REDIS_URL) return;
  // Redis connection (e.g. ioredis) would go here
}

export function getRedis() {
  return client;
}
