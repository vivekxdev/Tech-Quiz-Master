// Parses TRUST_PROXY into an Express "trust proxy" setting.
//
// Behind Render (or any reverse proxy) req.socket.remoteAddress is the proxy,
// not the visitor. With the Express default of `false` every client would
// resolve to that same proxy address, so all visitors would share one
// rate-limit bucket. Trusting exactly one hop makes req.ip — and therefore
// the rate-limit key — the real client, because the trusted proxy appends the
// client address to X-Forwarded-For.
//
// `true` is refused here instead of at request time: it trusts every hop, so
// a client could send `X-Forwarded-For: 1.2.3.4` and get a fresh bucket per
// request (express-rate-limit rejects that setting too, but only once a
// request is already in flight).
export const parseTrustProxy = (env = process.env) => {
    const raw = (env.TRUST_PROXY ?? "").trim();

    // Default: one proxy hop (the platform router in front of the app).
    if (raw === "") return 1;
    if (raw.toLowerCase() === "false") return false;
    if (raw.toLowerCase() === "true") {
        throw new Error(
            "TRUST_PROXY=true is not allowed: it trusts every hop, so a client " +
                "could spoof X-Forwarded-For and bypass IP rate limiting. Use a hop " +
                "count (TRUST_PROXY=1) or a comma-separated list of proxy IPs/CIDRs."
        );
    }

    if (/^\d+$/.test(raw)) {
        const hops = Number(raw);
        return hops === 0 ? false : hops;
    }

    // Comma-separated proxy addresses. Express compiles the value through
    // proxy-addr, so an entry that is not a valid IP/CIDR fails immediately
    // when the app is built rather than silently trusting nothing.
    return raw;
};
