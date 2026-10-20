// 405 Method Not Allowed for paths that exist.
//
// Express only answers with 404 when no route matches, so `PUT /api/admin/
// upload-quiz` would otherwise be reported as "Route not found" even though
// the path is real. Registered after the real routes (see routes/*.js) so
// authentication, authorization and validation are never short-circuited, and
// answered with the same JSON contract as every other error.
//
// OPTIONS never reaches this middleware: the cors middleware mounted first in
// app.js answers every OPTIONS request (preflight included) with 204.
export const allowMethods = (allowed) => (req, res) => {
    const allow = allowed.join(", ");
    res.set("Allow", allow);
    res.status(405).json({
        success: false,
        message: `Method ${req.method} not allowed. Allowed: ${allow}`,
    });
};
