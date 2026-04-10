const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;

let redis = null;

if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on("connect", () => console.log("Redis connected"));
  redis.on("error", (err) => console.log("Redis error:", err.message));

  redis.connect().catch(() => {
    console.log("Redis connection failed, running without cache");
    redis = null;
  });
}

async function getCache(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 300) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // ignore cache write errors
  }
}

async function delCache(pattern) {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // ignore
  }
}

module.exports = { redis, getCache, setCache, delCache };
