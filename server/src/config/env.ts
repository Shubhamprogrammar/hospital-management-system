import "dotenv/config";

export const env = {
  PORT: process.env.PORT ?? 5000,
  DATABASE_URL: process.env.DATABASE_URL!,
  MONGO_URI: process.env.MONGO_URI,
  REDIS_URL: process.env.REDIS_URL,
  JWT_SECRET: process.env.JWT_SECRET ?? "secret",
};
