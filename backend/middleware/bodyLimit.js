// Reads a request-body size cap from the environment.
//
// The value has to be something body-parser can actually parse: an
// unparsable limit is silently turned into "no limit" by body-parser
// (GHSA-v422-hmwv-36x6, fixed in 2.2.3), so a typo such as `JSON_BODY_LIMIT=lots`
// would disable the cap instead of enforcing it. Only a positive number with
// a unit body-parser understands is accepted, and anything else fails at
// startup rather than quietly shipping an unprotected endpoint.
//
// Unit list mirrors bytes.parse(): kb, mb, gb, tb, pb.
const SIZE_PATTERN = /^\d+(\.\d+)? *(kb|mb|gb|tb|pb)$/i;

export const readSizeLimit = (env, name, fallback) => {
    const raw = (env[name] ?? "").trim();
    if (raw === "") return fallback;

    if (!SIZE_PATTERN.test(raw) || Number.parseFloat(raw) <= 0) {
        throw new Error(
            `${name}="${raw}" is not a valid size limit. Use a positive number ` +
                "with a unit (kb, mb, gb), e.g. 512kb or 5mb."
        );
    }

    return raw;
};
