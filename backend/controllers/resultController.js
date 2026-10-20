import Quiz from "../model/Quiz.js";
import Result from "../model/Result.js";
import User from "../model/User.js";
import { isValidObjectId, isPlainObject, MAX_TIME_TAKEN } from "../middleware/validation.js";

// Frontend option index -> answerKey letter (0 = A ... 3 = D).
const OPTION_LETTERS = ["A", "B", "C", "D"];

// Fields a legacy (client-scored) submission is allowed to carry. Everything
// else in the request body is ignored, so forged fields such as selectedAnswers
// or a spoofed quizId can never be persisted through this branch.
const LEGACY_NUMBER_FIELDS = ["totalQuestions", "correctAnswers", "score"];

// Attempt id: the idempotency key of one quiz attempt. The client mints a
// UUID when an attempt starts (frontend utils/quizAttempt.js) and re-sends
// the same value on every retry/refresh of that attempt, so it must be a UUID
// and nothing else — an arbitrary client-chosen token would let callers pick
// their own uniqueness granularity. Matched case-insensitively and stored in
// lowercase so "ABC..." and "abc..." can never become two index keys.
const ATTEMPT_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Absent (undefined/null) means "no idempotency key supplied": the request
// keeps the pre-idempotency behaviour so older clients and the existing test
// suites are unaffected. Anything present must be a well-formed UUID.
const readAttemptId = (body) => {
    const raw = body.attemptId;
    if (raw === undefined || raw === null) {
        return { value: undefined };
    }
    if (typeof raw !== "string" || !ATTEMPT_ID_PATTERN.test(raw.trim())) {
        return {
            error:
                "attemptId must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)",
        };
    }
    return { value: raw.trim().toLowerCase() };
};

// MongoDB rejects a second insert into a unique index with code 11000. This
// is the expected outcome of two identical requests racing past the
// existence check, not an infrastructure failure.
const isDuplicateKeyError = (error) =>
    error?.code === 11000 ||
    error?.codeName === "DuplicateKey" ||
    error?.errorResponse?.code === 11000;

const badRequest = (res, message) =>
    res.status(400).json({ success: false, message });

// Validates the submitted answers against the quiz's own questions and
// returns either { error } (HTTP 400) or { answersByQuestionId }:
// Map<questionIdString, option index | -1 (unanswered)>.
// Questions absent from the array are treated as unanswered when grading.
const parseAnswers = (quiz, answers) => {
    if (!Array.isArray(answers) || answers.length === 0) {
        return { error: "answers must be a non-empty array" };
    }

    const quizQuestionIds = new Set(
        quiz.questions.map((question) => String(question._id))
    );
    const seenQuestionIds = new Set();
    const answersByQuestionId = new Map();

    for (const entry of answers) {
        if (!isPlainObject(entry)) {
            return { error: "Each answer must be an object" };
        }
        if (!isValidObjectId(entry.questionId)) {
            return { error: "Invalid questionId" };
        }
        const questionId = String(entry.questionId);
        if (!quizQuestionIds.has(questionId)) {
            return { error: "Question does not belong to this quiz" };
        }
        if (seenQuestionIds.has(questionId)) {
            return { error: "Duplicate questionId in answers" };
        }
        if (
            !Number.isInteger(entry.selectedAnswer) ||
            entry.selectedAnswer < -1 ||
            entry.selectedAnswer > 3
        ) {
            return { error: "selectedAnswer must be -1, 0, 1, 2 or 3" };
        }
        seenQuestionIds.add(questionId);
        answersByQuestionId.set(questionId, entry.selectedAnswer);
    }

    return { answersByQuestionId };
};

// Shape checks for the secure payload that do not need a database lookup.
// The quiz/answer membership checks live in handleSecureSubmission.
const validateSecurePayload = (body) => {
    if (!isValidObjectId(body.quizId)) {
        return "A valid quizId is required";
    }
    // Absent timeTaken is allowed (legacy/older clients may omit it).
    if (body.timeTaken !== undefined &&
        (typeof body.timeTaken !== "number" ||
            !Number.isFinite(body.timeTaken) ||
            body.timeTaken < 0 ||
            body.timeTaken > MAX_TIME_TAKEN)) {
        return `timeTaken must be a non-negative number of at most ${MAX_TIME_TAKEN}`;
    }
    const attempt = readAttemptId(body);
    if (attempt.error) {
        return attempt.error;
    }
    return null;
};

// Shape checks for the temporary legacy (client-scored) payload. Every field
// is required by the Result schema, so a payload missing any of them already
// failed at insert time — validating first turns that 500 into a clean 400.
const validateLegacyPayload = (body) => {
    if (typeof body.technology !== "string" || !body.technology.trim()) {
        return "technology is required";
    }
    if (typeof body.level !== "string" || !body.level.trim()) {
        return "level is required";
    }
    for (const field of LEGACY_NUMBER_FIELDS) {
        const value = body[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            return `${field} must be a non-negative number`;
        }
    }
    return null;
};

// Authoritative scoring: only the Quiz document and the submitted answers
// are used. Client-provided score/technology/level fields never reach here.
// Semantics match the legacy frontend: score = number of correct answers,
// no negative marking, unanswered counts as neither correct nor wrong.
const gradeSubmission = (quiz, answersByQuestionId) => {
    let correctAnswers = 0;
    let wrongAnswers = 0;
    let unattempted = 0;

    for (const question of quiz.questions) {
        const selectedAnswer = answersByQuestionId.get(String(question._id));
        if (selectedAnswer === undefined || selectedAnswer === -1) {
            unattempted += 1;
            continue;
        }
        if (selectedAnswer === OPTION_LETTERS.indexOf(question.answerKey)) {
            correctAnswers += 1;
        } else {
            wrongAnswers += 1;
        }
    }

    const totalQuestions = quiz.questions.length;
    return {
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        unattempted,
        score: correctAnswers,
        percentage:
            totalQuestions > 0
                ? Math.round((correctAnswers / totalQuestions) * 100)
                : 0,
    };
};

// Per-question review for the response and the stored snapshot, generated
// from the authoritative Quiz document (never from request data).
const buildReviewSnapshot = (quiz, answersByQuestionId) =>
    quiz.questions.map((question) => {
        const correctAnswer = OPTION_LETTERS.indexOf(question.answerKey);
        const selectedAnswer =
            answersByQuestionId.get(String(question._id)) ?? -1;
        return {
            questionId: question._id,
            question: question.question,
            options: [...question.options],
            selectedAnswer,
            correctAnswer,
            isCorrect: selectedAnswer !== -1 && selectedAnswer === correctAnswer,
        };
    });

// Summary for a REPLAYED submission (the attempt was already recorded). It is
// derived exclusively from the stored document — never from the retry payload
// — so a modified retry can neither change the recorded score nor the numbers
// the client is shown. The formula matches gradeSubmission so the replay's
// summary is byte-identical to the one the original 201 returned.
const summarizeStoredResult = (result) => {
    const review = Array.isArray(result.selectedAnswers)
        ? result.selectedAnswers
        : [];
    const totalQuestions = result.totalQuestions ?? 0;
    const correctAnswers = result.correctAnswers ?? 0;

    let wrongAnswers = 0;
    let unattempted = 0;
    for (const entry of review) {
        if (entry.selectedAnswer === -1) unattempted += 1;
        else if (!entry.isCorrect) wrongAnswers += 1;
    }
    if (review.length === 0) {
        // Secure submissions always store a full snapshot, so this branch is
        // defensive only: without it the wrong/unanswered split is unknown,
        // and every non-correct question is reported as wrong.
        wrongAnswers = Math.max(totalQuestions - correctAnswers, 0);
    }

    return {
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        unattempted,
        score: result.score ?? correctAnswers,
        percentage:
            totalQuestions > 0
                ? Math.round((correctAnswers / totalQuestions) * 100)
                : 0,
    };
};

// Idempotent response for an attempt that is already recorded: the same shape
// as the original 201 ({ success, result, summary }) plus `idempotent: true`,
// with 200 instead of 201 to mark it as a replay rather than a new record.
const sendRecordedResult = (res, result) =>
    res.status(200).json({
        success: true,
        result,
        summary: summarizeStoredResult(result),
        idempotent: true,
    });

// Secure path: computes and stores the authoritative result from the quiz
// document plus the submitted answers only. Forged client fields (score,
// correctAnswers, wrongAnswers, percentage, totalQuestions, technology, level)
// are never read from the request body.
const handleSecureSubmission = async (body, res, userId, userName, userEmail) => {
    const payloadProblem = validateSecurePayload(body);
    if (payloadProblem) {
        return badRequest(res, payloadProblem);
    }
    const { value: attemptId } = readAttemptId(body);

    // Fast path: an attempt that already has a recorded result replays it.
    // The lookup is keyed by (authenticated userId, attemptId), so a client
    // can only ever reach its own records, and the submitted answers/score
    // are deliberately ignored — a retry can never rewrite a completed
    // result. It runs before grading so a replay also skips the quiz fetch.
    if (attemptId) {
        const recorded = await Result.findOne({ userId, attemptId });
        if (recorded) {
            return sendRecordedResult(res, recorded);
        }
    }

    const quiz = await Quiz.findById(body.quizId);
    if (!quiz) {
        return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    const parsed = parseAnswers(quiz, body.answers);
    if (parsed.error) {
        return badRequest(res, parsed.error);
    }

    const summary = gradeSubmission(quiz, parsed.answersByQuestionId);

    const resultDocument = {
        userId,
        userName,
        userEmail,
        quizId: quiz._id,
        // Identity comes from the Quiz document, never from the request body.
        technology: quiz.technology,
        level: quiz.level,
        totalQuestions: summary.totalQuestions,
        correctAnswers: summary.correctAnswers,
        score: summary.score,
        timeTaken: body.timeTaken,
        // Server clock: this path must not trust client input for anything it
        // records (the legacy branch used the client-sent startDate).
        startDate: new Date(),
        selectedAnswers: buildReviewSnapshot(quiz, parsed.answersByQuestionId),
    };
    if (attemptId) {
        resultDocument.attemptId = attemptId;
    }

    let result;
    try {
        result = await Result.create(resultDocument);
    } catch (error) {
        // Two identical requests both passed the fast path and raced here.
        // The unique index on (userId, attemptId) let exactly one insert win;
        // replay the winner instead of surfacing the conflict as a 500.
        if (attemptId && isDuplicateKeyError(error)) {
            const recorded = await Result.findOne({ userId, attemptId });
            if (recorded) {
                return sendRecordedResult(res, recorded);
            }
        }
        throw error;
    }

    // summary carries wrongAnswers/unattempted/percentage, which are computed
    // for the response but not stored (MyResult keeps reading the old fields;
    // review lives on result.selectedAnswers).
    return res.status(201).json({ success: true, result, summary });
};

// TEMPORARY migration compatibility: the deployed frontend still posts its
// client-computed { technology, level, totalQuestions, correctAnswers, score }
// payload and reads only { success, result }. This branch is isolated from
// the secure path and its stored numbers are client-claimed, NOT
// authoritative. It also has NO idempotency: an attemptId sent alongside a
// legacy payload is dropped by the whitelist below (the legacy contract has
// no attempt to bind it to). Remove it after the frontend migrates to the
// { quizId, answers } contract.
const handleLegacySubmission = async (body, res, userId, userName, userEmail) => {
    const payloadProblem = validateLegacyPayload(body);
    if (payloadProblem) {
        return badRequest(res, payloadProblem);
    }

    // Whitelisted copy: only schema-backed fields are forwarded, so extra
    // client fields (selectedAnswers, quizId, wrongAnswers, ...) are dropped.
    const legacyResult = {
        technology: body.technology.trim(),
        level: body.level.trim(),
        totalQuestions: body.totalQuestions,
        correctAnswers: body.correctAnswers,
        score: body.score,
        timeTaken: body.timeTaken,
        startDate: body.startDate,
        userId,
        userName,
        userEmail,
    };

    const result = await Result.create(legacyResult);
    return res.status(201).json({ success: true, result });
};

//  Create a result
// Unexpected errors are not caught here on purpose: they bubble to the
// centralised error handler, which logs the stack server-side and returns the
// { success: false, message } JSON contract without leaking internals.
export const CreatemyResult = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await User.findOne({ clerkId: userId });
    const userName = user ? user.fullName : "";
    const userEmail = user ? user.email : "";

    const body = req.body;
    if (!isPlainObject(body)) {
        return badRequest(res, "Request body must be a JSON object");
    }

    // Format switch: legacy payloads never contain quizId or answers.
    if (body.quizId !== undefined || body.answers !== undefined) {
        return await handleSecureSubmission(body, res, userId, userName, userEmail);
    }
    return await handleLegacySubmission(body, res, userId, userName, userEmail);
};

// Upper bound for the optional ?limit= window on GET /results/my-results.
// The default stays unlimited so existing consumers keep seeing every saved
// attempt; the cap only exists so a client that needs a bounded window (a
// dashboard preview) never has to risk an unbounded read.
const MAX_MY_RESULTS_LIMIT = 200;

const parseResultLimit = (raw) => {
    if (raw === undefined) return { value: undefined };
    // Strict decimal digits only: Number() alone would happily accept
    // "1e1", "0x10" or (via String coercion) a repeated ?limit= list.
    const text = String(raw).trim();
    if (!/^[0-9]+$/.test(text)) {
        return {
            error: `limit must be an integer between 1 and ${MAX_MY_RESULTS_LIMIT}`,
        };
    }
    const value = Number(text);
    if (value < 1 || value > MAX_MY_RESULTS_LIMIT) {
        return {
            error: `limit must be an integer between 1 and ${MAX_MY_RESULTS_LIMIT}`,
        };
    }
    return { value };
};

// To get result for that logged-in user
export const getMyResult = async (req, res) => {
    const userId = req.auth?.userId;
    // Explicit guard: an undefined userId would be dropped by Mongoose and
    // find() would return EVERY user's results.
    if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    // Ownership comes exclusively from the verified Clerk session. Any
    // client-supplied identity (query, body, header) is ignored, so the only
    // way to read a row here is to have created it yourself.
    const limit = parseResultLimit(req.query?.limit);
    if (limit.error) {
        return badRequest(res, limit.error);
    }
    const query = Result.find({ userId }).sort({ createdAt: -1 });
    if (limit.value !== undefined) {
        query.limit(limit.value);
    }
    const results = await query;
    res.json(results);
};
