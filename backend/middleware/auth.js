import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import User from "../model/User.js";

const clerkAuth = ClerkExpressWithAuth();

// Authenticates the request via Clerk and rejects it with 401 when no valid
// session is present. ClerkExpressWithAuth alone only attaches req.auth — it
// never blocks unauthenticated requests, so we enforce the session here.
export const protect = (req, res, next) => {
    clerkAuth(req, res, (err) => {
        if (err) return next(err);
        if (!req.auth?.userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }
        next();
    });
};

// Verifies server-side that the authenticated user has the admin role.
// Must run after `protect`. Never trusts client-provided role information.
export const isAdmin = async (req, res, next) => {
    try {
        const clerkId = req.auth?.userId;
        if (!clerkId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const user = await User.findOne({ clerkId });
        if (user && user.role === "admin") {
            return next();
        }

        res.status(403).json({
            success: false,
            message: "Access denied. Admins only.",
        });
    } catch (error) {
        console.error("Admin authorization error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
};
