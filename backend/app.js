import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import userRoutes from "./routes/user.js";
import adminRoutes from "./routes/admin.js";
import resultRoutes from "./routes/result.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { createRateLimiters } from "./middleware/rateLimit.js";
import { parseTrustProxy } from "./middleware/trustProxy.js";
import { readSizeLimit } from "./middleware/bodyLimit.js";

// CORS: only origins configured in the environment are allowed (never "*",
// because these requests carry credentials). Development origins are set in
// backend/.env; production origins are set on Render (FRONTEND_URL,
// ADMIN_URL, and optionally CORS_EXTRA_ORIGINS for extra deployments).
export const buildAllowedOrigins = (env = process.env) =>
    [
        env.FRONTEND_URL,
        env.ADMIN_URL,
        ...(env.CORS_EXTRA_ORIGINS || "").split(","),
    ]
        .map((origin) => (origin ?? "").trim())
        // A literal "*" is dropped: it can never be echoed back alongside
        // credentials, and inside an origin list it would simply never match a
        // real origin — dropping it keeps a misconfigured environment obvious.
        .filter((origin) => origin && origin !== "*");

// Outside production, Vite may start the apps on a different port when 5173
// or 5174 is already taken (e.g. by another project), so the exact port is not
// known in advance. Loopback origins are therefore accepted in development;
// production keeps the strict environment allow-list above.
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export const buildCorsOrigin = (env = process.env) => {
    const allowedOrigins = buildAllowedOrigins(env);
    const isProduction = env.NODE_ENV === "production";
    return (origin, callback) => {
        const allowed =
            !origin ||
            allowedOrigins.includes(origin) ||
            (!isProduction && LOOPBACK_ORIGIN.test(origin));
        callback(null, allowed);
    };
};

// Builds the Express app with the exact middleware order used in production.
// server.js owns config/env checks, the DB connection and app.listen; keeping
// the wiring here lets the test suites exercise the real routes plus the
// centralised 404/error handlers without binding the real port.
//
// `env` only overrides this app instance (defaults to process.env), which is
// what lets the rate-limit tests exercise the real wiring with a low budget.
export const createApp = ({ env = process.env } = {}) => {
    const app = express();

    // Never advertise the framework, and resolve the client address through
    // the proxy in front of the app (see middleware/trustProxy.js).
    app.disable("x-powered-by");
    app.set("trust proxy", parseTrustProxy(env));

    // Security headers for every response. helmet's default
    // Cross-Origin-Resource-Policy is same-origin, which would stop browsers
    // from reading these responses cross-origin; the API is consumed by the
    // deployed frontend/admin apps, so it is opened to cross-origin reads.
    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use(cors({ origin: buildCorsOrigin(env), credentials: true }));

    // Rate limits run before authentication and body parsing so a client that
    // is already over budget never triggers Clerk verification or JSON
    // parsing. Each mount is narrow on purpose: the public catalogue routes
    // (GET /api/admin/quizzes, GET /api/admin/quiz/:id) stay on the general
    // budget because the quiz-taking UI calls them.
    const limiters = createRateLimiters(env);
    app.use("/api", limiters.general);
    app.use("/api/users/webhook/clerk", limiters.webhook);
    app.use("/api/results/create", limiters.submission);
    app.use("/api/admin/upload-quiz", limiters.admin);
    app.use("/api/admin/stats", limiters.admin);
    app.delete("/api/admin/quiz/:id", limiters.admin);
    app.post("/api/admin/quiz/:id/duplicate", limiters.admin);

    // The Clerk webhook must be mounted BEFORE express.json() and the Clerk
    // auth middleware: SVIX signature verification needs the untouched raw
    // request body (captured by express.raw() in routes/user.js), and the
    // delivery is authenticated by the signature — not by a user session.
    app.use("/api/users", userRoutes);

    // Pass the publishableKey explicitly to Clerk middleware
    app.use(ClerkExpressWithAuth({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }));

    // Request body caps: quiz payloads and submissions are small, so a few
    // hundred kilobytes is generous. Oversized bodies fail with 413 through
    // the JSON error contract (see middleware/errorHandler.js).
    app.use(express.json({ limit: readSizeLimit(env, "JSON_BODY_LIMIT", "512kb") }));

    // The API itself only speaks JSON, but a form-encoded body still has to
    // be capped: left unparsed, an oversized urlencoded payload would get a
    // 4xx only after the client had already streamed it in. Parsing it under
    // a much smaller cap turns oversized form posts into a clean 413 and
    // normal ones into the usual 400 from validation (no endpoint reads form
    // fields, so nothing accepts them as input).
    app.use(express.urlencoded({
        extended: false,
        limit: readSizeLimit(env, "URLENCODED_BODY_LIMIT", "64kb"),
    }));

    app.use("/api/admin", adminRoutes);
    app.use("/api/results", resultRoutes);

    app.get("/", (req, res) => {
        res.send("API is running!");
    });

    // Every response — including misses and unexpected failures — keeps the
    // { success: false, message } JSON contract.
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
};
