import dotenv from 'dotenv';
dotenv.config();
import dns from 'dns';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import Result from './model/Result.js';

const PORT = process.env.PORT;

dns.setServers(["1.1.1.1","8.8.8.8"])

// Fail fast with a clear message instead of crashing later on an undefined
// config value. Development values live in backend/.env; production values
// are set as environment variables on Render.
const requiredEnv = [
    "PORT",
    "MONGODB_URI",
    "CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "FRONTEND_URL",
    "ADMIN_URL",
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
    process.exit(1);
}

// Database connection. Awaited so the unique index behind result
// idempotency exists before the first request is accepted: without it, two
// identical submissions arriving right after a deploy could both insert.
await connectDB();
try {
    // Resolves once every index declared on the model has been built (and is
    // a no-op on later boots, where the index already exists).
    await Result.init();
} catch (error) {
    // Fail fast like config/db.js: without the unique index the API would
    // silently accept duplicate results. Log the error identity only — a
    // driver message can echo the connection string.
    console.error("Result index build failed:", error?.codeName || error?.name || "Error");
    process.exit(1);
}

// Middleware order, routes, 404 and the centralised error handler live in
// app.js so tests can mount the exact same wiring.
const app = createApp();

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT} (${process.env.NODE_ENV || "development"})`);
});
