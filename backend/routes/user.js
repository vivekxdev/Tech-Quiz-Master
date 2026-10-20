import express from "express";
import { clerkWebhook } from "../controllers/webhook.js";
import { allowMethods } from "../middleware/httpMethods.js";
import { readSizeLimit } from "../middleware/bodyLimit.js";

const router = express.Router();

// express.raw() must run here (the route is mounted before express.json() in
// server.js) so the handler receives the exact bytes SVIX signed — a parsed
// JSON object cannot be re-serialized to the original payload. The limit caps
// how much an unverified (and therefore unauthenticated) caller can make the
// server buffer before signature verification.
router.post("/webhook/clerk",
    express.raw({
        type: "application/json",
        limit: readSizeLimit(process.env, "WEBHOOK_BODY_LIMIT", "100kb"),
    }),
    clerkWebhook
)
router.all("/webhook/clerk", allowMethods(["POST"]))

export default router;
