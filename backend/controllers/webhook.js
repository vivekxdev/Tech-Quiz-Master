import User from "../model/User.js";
import "dotenv/config.js";
import { Webhook, WebhookVerificationError } from "svix";

// Per-event chatter is useful while developing but noisy in production, and
// the payload itself (email addresses, names) must never be written to the
// log. Failures stay logged in every environment — message/stack only, never
// the raw request body or headers.
const logEvent = (...args) => {
    if (process.env.NODE_ENV !== "production") {
        console.log(...args);
    }
};

export const clerkWebhook = async (req, res) => {
    try {
        // Only the raw Buffer from express.raw() contains the exact signed
        // bytes; anything else (missing or already-parsed body) cannot be
        // verified and must be rejected.
        const payload = Buffer.isBuffer(req.body) ? req.body.toString() : "";
        if (!payload) {
            return res.status(400).json({ success: false, message: "Missing request body" });
        }

        const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
        const webhook = new Webhook(WEBHOOK_SECRET);

        const evt = webhook.verify(payload, req.headers);

        const { type, data } = evt;
        logEvent("EVENT TYPE:", type);

        // ✅ USER CREATED
        if (type === "user.created") {
            const primaryEmail =
                data.email_addresses?.find(
                    (e) => e.id === data.primary_email_address_id
                )?.email_address || "";

            // Admin identity comes from configuration only — never from
            // source. Fail closed when ADMIN_EMAIL is unset/empty (the guard
            // also prevents a user with no primary email from matching an
            // empty value), so every user is stored as "user" unless a real
            // configured address matches. Valid configured admin emails keep
            // the exact previous behavior.
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || "";
            const role =
                ADMIN_EMAIL && primaryEmail === ADMIN_EMAIL
                    ? "admin"
                    : "user";

            await User.findOneAndUpdate(
                { clerkId: data.id },
                {
                    clerkId: data.id,
                    email: primaryEmail,
                    fullName: `${data.first_name || ""} ${data.last_name || ""}`,
                    role: role,
                },
                { upsert: true, new: true }
            );
        }

        // ✅ LOGIN
        if (type === "session.created") {
            logEvent("Login Detected");

            try {
                let user = await User.findOne({ clerkId: data.user_id });

                // Defensive: get user object from event
                const userObj = data.user || {};
                const primaryEmail =
                    (userObj.email_addresses && userObj.email_addresses[0] && userObj.email_addresses[0].email_address) || "";
                const fullName = `${userObj.first_name || ""} ${userObj.last_name || ""}`.trim() || "No Name";

                if (!user && userObj.id) {
                    // Create user if not exists
                    await User.create({
                        clerkId: userObj.id,
                        email: primaryEmail || "noemail@unknown.com",
                        fullName: fullName,
                        role: "user",
                        isLoggedIn: true,
                    });
                    logEvent("User created in DB from session.created:", userObj.id, primaryEmail, fullName);
                } else {
                    // Update isLoggedIn if user exists
                    await User.findOneAndUpdate(
                        { clerkId: data.user_id },
                        { isLoggedIn: true },
                        { upsert: true, new: true }
                    );
                    logEvent("User updated in DB from session.created:", data.user_id);
                }
            } catch (err) {
                console.error("Error in session.created user DB logic:", err?.stack ?? err?.message ?? err);
            }
        }

        // ✅ LOGOUT
        if (type === "session.deleted" || type === "session.removed") {
            logEvent("Logout Detected");

            await User.findOneAndUpdate(
                { clerkId: data.user_id },
                {
                    clerkId: data.user_id,
                    isLoggedIn: false,
                },
                { upsert: true, new: true }
            );
        }

        // ✅ Always send response
        res.status(200).json({
            message: "Webhook processed successfully",
            success: true,
        });

    } catch (error) {
        if (error instanceof WebhookVerificationError) {
            return res.status(400).json({ success: false, message: "Invalid webhook signature" });
        }
        // Signature was valid but the payload is not JSON — sender's fault too.
        if (error instanceof SyntaxError) {
            return res.status(400).json({ success: false, message: "Invalid webhook payload" });
        }
        console.error("Webhook processing failed:", error?.stack ?? error?.message ?? error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};