import mongoose from "mongoose";

// Centralised JSON error contract for the whole API:
//   { "success": false, "message": "Human-readable error message" }
// Status mapping: 400 invalid input, 401 unauthenticated, 403 unauthorized,
// 404 missing resource, 409 conflict, 413 payload too large, 500 unexpected
// server error only. Rate limiting answers 429 directly (rateLimit.js) with
// the same body.

// Unknown routes get the same JSON body as everything else (instead of the
// default HTML "Cannot GET ...").
export const notFoundHandler = (req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
};

const statusFor = (error) => {
    // body-parser / express.json failures
    if (
        error?.type === "entity.parse.failed" ||
        error?.type === "charset.unsupported" ||
        error?.type === "encoding.unsupported"
    ) {
        return 400;
    }
    if (error?.type === "entity.too.large") {
        return 413;
    }
    if (
        error instanceof SyntaxError &&
        Number.isInteger(error.status) &&
        error.status < 500
    ) {
        return error.status;
    }
    // Malformed ObjectId (e.g. GET /api/admin/quiz/abc) — never a 500.
    if (error?.name === "CastError" || error instanceof mongoose.Error.CastError) {
        return 400;
    }
    if (
        error?.name === "ValidationError" ||
        error instanceof mongoose.Error.ValidationError
    ) {
        return 400;
    }
    // Duplicate key on a unique index.
    if (error?.code === 11000) {
        return 409;
    }
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
        return error.status;
    }
    return 500;
};

const messageFor = (error, status) => {
    if (error?.type === "entity.parse.failed") {
        return "Invalid JSON payload";
    }
    // body-parser marks oversized bodies expose=true, so this check has to
    // come first: otherwise the raw parser text is echoed back to the client.
    if (error?.type === "entity.too.large" || status === 413) {
        return "Request payload is too large";
    }
    if (error?.name === "CastError") {
        return "Invalid value provided";
    }
    if (error?.name === "ValidationError") {
        return "Invalid request data";
    }
    if (error?.code === 11000) {
        return "That record already exists";
    }
    if (status >= 500) {
        return "Internal server error";
    }
    // http-errors sets expose=true for 4xx so the message is safe to show.
    if (error?.expose === true && typeof error.message === "string") {
        return error.message;
    }
    return "Invalid request";
};

// Express requires the 4-argument signature to be recognised as an error
// handler, even though `next` is only used when headers are already sent.
export const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    const status = statusFor(error);

    // Stack traces, Mongoose internals and secrets stay server-side only.
    if (status >= 500) {
        console.error(`[${status}] ${req.method} ${req.originalUrl}`, error);
    } else if (process.env.NODE_ENV !== "production") {
        // 4xx are client errors: keep them visible while developing, but do
        // not flood the production log with one line per rejected request.
        console.warn(
            `[${status}] ${req.method} ${req.originalUrl}: ${messageFor(error, status)}`
        );
    }

    return res.status(status).json({ success: false, message: messageFor(error, status) });
};
