/**
 * In-memory sliding-window rate limiter, keyed by client IP. Protects the deployment's DeepSeek
 * quota (DeepSeek itself limits concurrency per account, not requests per minute).
 */

/**
 * @param {{ perMinute: number, now?: () => number }} options
 */
export function createRateLimiter({ perMinute, now = () => Date.now() }) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();

  return {
    /**
     * @param {string} key client identity (IP)
     * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
     */
    check(key) {
      const t = now();
      const windowStart = t - 60_000;
      const list = (hits.get(key) ?? []).filter((h) => h > windowStart);
      if (list.length >= perMinute) {
        hits.set(key, list);
        const oldest = list[0];
        const retryAfterSec = Math.max(1, Math.ceil((oldest + 60_000 - t) / 1000));
        return { allowed: false, remaining: 0, retryAfterSec };
      }
      list.push(t);
      hits.set(key, list);
      // Bounded memory: drop empty/old entries opportunistically.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (v.every((h) => h <= windowStart)) hits.delete(k);
        }
      }
      return { allowed: true, remaining: perMinute - list.length, retryAfterSec: 0 };
    },
  };
}
