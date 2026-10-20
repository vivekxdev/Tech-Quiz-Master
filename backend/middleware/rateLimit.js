import { rateLimit } from "express-rate-limit";

// Fixed-window rate limiting for the whole API (Step 10).
//
// Every limiter is created per app instance and owns its own MemoryStore:
// express-rate-limit refuses to share one store across limiters, and a store
// created here (rather than per request) keeps test apps isolated from each
// other and from production.
//
// Limits are configurable through the environment so they can be tuned on
// Render without a code change; invalid or missing values fall back to the
// defaults below.

const DEFAULTS = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    general: 600, // every /api request
    submission: 120, // result submissions
    admin: 120, // admin write/statistics endpoints
    webhook: 120, // Clerk webhook deliveries
};

const readInt = (env, name, fallback) => {
    const raw = env[name];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
        return fallback;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const createRateLimiters = (env = process.env) => {
    const windowMs = readInt(env, "RATE_LIMIT_WINDOW_MS", DEFAULTS.windowMs);

    // Kept in the API's own error contract — clients and tests always get
    // { success: false, message } instead of express-rate-limit's plain text.
    const handler = (req, res) => {
        const resetTime = req.rateLimit?.resetTime;
        const retryAfter = resetTime
            ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
            : Math.ceil(windowMs / 1000);
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({ success: false, message: "Too many requests" });
    };

    const build = (name, fallbackMax) =>
        rateLimit({
            windowMs,
            limit: readInt(env, name, fallbackMax),
            handler,
            // IETF RateLimit headers instead of the deprecated X-RateLimit-*
            // ones, plus the RFC 6585 Retry-After set above.
            standardHeaders: "draft-7",
            legacyHeaders: false,
        });

    return {
        general: build("RATE_LIMIT_GENERAL_MAX", DEFAULTS.general),
        submission: build("RATE_LIMIT_SUBMIT_MAX", DEFAULTS.submission),
        admin: build("RATE_LIMIT_ADMIN_MAX", DEFAULTS.admin),
        webhook: build("RATE_LIMIT_WEBHOOK_MAX", DEFAULTS.webhook),
    };
};
