import mongoose from "mongoose";

// Shared input-validation helpers. Everything here runs BEFORE a controller
// touches the database, so malformed input is rejected with a plain 400 and
// never reaches a Mongoose cast/lookup (which would surface as a 500).

export const QUIZ_LEVELS = ["Basic", "Intermediate", "Advanced"];
export const OPTION_LETTERS = ["A", "B", "C", "D"];

// Sanity ceiling for a single attempt. The unit is whatever the client sends
// (seconds or minutes) — this only exists to reject absurd/NaN-ish values.
export const MAX_TIME_TAKEN = 86400;

// mongoose.isValidObjectId() also accepts non-strings (e.g. numbers), which
// would let a forged numeric id through. Require a string as well.
export const isValidObjectId = (value) =>
    typeof value === "string" && mongoose.isValidObjectId(value);

export const isPlainObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const badRequest = (res, message) =>
    res.status(400).json({ success: false, message });

// ---------------------------------------------------------------------------
// Quiz creation / upload
// ---------------------------------------------------------------------------

const validateQuestion = (question, index) => {
    const label = `questions[${index}]`;

    if (!isPlainObject(question)) {
        return `${label} must be an object`;
    }
    if (typeof question.question !== "string" || !question.question.trim()) {
        return `${label}.question must be a non-empty string`;
    }
    if (
        !Array.isArray(question.options) ||
        question.options.length !== OPTION_LETTERS.length
    ) {
        return `${label}.options must contain exactly ${OPTION_LETTERS.length} options`;
    }
    for (let i = 0; i < question.options.length; i += 1) {
        const option = question.options[i];
        if (typeof option !== "string" || !option.trim()) {
            return `${label}.options[${i}] must be a non-empty string`;
        }
    }
    if (
        typeof question.answerKey !== "string" ||
        !OPTION_LETTERS.includes(question.answerKey)
    ) {
        return `${label}.answerKey must be one of ${OPTION_LETTERS.join(", ")}`;
    }
    // "answerKey points to an existing option" — with the 4-option rule above
    // this is implied, but it is checked explicitly so the contract holds even
    // if the option rule ever relaxes.
    if (OPTION_LETTERS.indexOf(question.answerKey) >= question.options.length) {
        return `${label}.answerKey must point to an existing option`;
    }
    return null;
};

// Returns { error } with a human-readable message, or { value } containing the
// whitelisted/normalised quiz fields. Anything the client sent that is not in
// `value` (totalQuestions, createdBy, answerText, ...) is never persisted.
export const validateQuizPayload = (body) => {
    if (!isPlainObject(body)) {
        return { error: "Request body must be a JSON object" };
    }

    const { technology, level, timeLimit, questions } = body;

    if (typeof technology !== "string" || !technology.trim()) {
        return { error: "technology is required" };
    }
    if (technology.trim().length > 100) {
        return { error: "technology must be 100 characters or fewer" };
    }
    if (typeof level !== "string" || !QUIZ_LEVELS.includes(level)) {
        return { error: `level must be one of: ${QUIZ_LEVELS.join(", ")}` };
    }
    if (!Number.isInteger(timeLimit) || timeLimit < 1) {
        return { error: "timeLimit must be an integer of at least 1" };
    }
    if (!Array.isArray(questions) || questions.length === 0) {
        return { error: "questions must be a non-empty array" };
    }

    const cleanQuestions = [];
    for (let i = 0; i < questions.length; i += 1) {
        const problem = validateQuestion(questions[i], i);
        if (problem) {
            return { error: problem };
        }
        cleanQuestions.push({
            question: questions[i].question.trim(),
            options: questions[i].options.map((option) => option.trim()),
            answerKey: questions[i].answerKey,
        });
    }

    return {
        value: {
            technology: technology.trim(),
            level,
            timeLimit,
            questions: cleanQuestions,
        },
    };
};

// Route middleware for POST /api/admin/upload-quiz. Rejects malformed payloads
// with 400 and attaches the cleaned quiz to req.validatedQuiz.
export const validateQuizBody = (req, res, next) => {
    const { error, value } = validateQuizPayload(req.body);
    if (error) {
        return badRequest(res, error);
    }
    req.validatedQuiz = value;
    return next();
};
