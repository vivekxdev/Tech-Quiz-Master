import mongoose from "mongoose";

// Per-question snapshot of a secure submission: enough to reproduce the
// review (question, options, correct answer, correctness) without re-reading
// the answerKey or trusting the frontend. Frozen copy — quiz documents can be
// re-uploaded later, which would change the questions behind old results.
const selectedAnswerSchema = new mongoose.Schema({
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    selectedAnswer: { type: Number, required: true, min: -1, max: 3 },
    correctAnswer: { type: Number, required: true, min: 0, max: 3 },
    isCorrect: { type: Boolean, required: true },
}, { _id: false });

const resultSchema = new mongoose.Schema({
    userId: { type: String, required: true }, //For a particular user can see
    userName: { type: String },
    userEmail: { type: String },
    // Set only by the secure scoring path; legacy (client-scored) results predate it.
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz" },
    // Idempotency key of the quiz attempt that produced this record: a UUID
    // minted by the client when the attempt starts and re-sent on every retry.
    // Absent on legacy results and on submissions that predate the field.
    attemptId: { type: String },
    technology: { type: String, required: true },
    level: { type: String, required: true },

    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    score: { type: Number, required: true },

    timeTaken: Number,
    startDate: Date,
    selectedAnswers: [selectedAnswerSchema],
}, { timestamps: true });

// At most one persisted result per (user, attempt): the persistence-layer
// guarantee behind POST /results/create idempotency. Requests are scoped by
// userId, so a client can only ever collide with itself — it can never reach,
// block or overwrite another user's attempt.
//
// The index is PARTIAL on purpose. Legacy results carry no attemptId, and a
// plain unique index would treat every missing value as null — two old rows
// for the same user would then make the index impossible to build. Excluding
// documents without an attemptId keeps every existing record readable and
// makes the index build conflict-free on live data (no migration needed).
resultSchema.index(
    { userId: 1, attemptId: 1 },
    {
        unique: true,
        partialFilterExpression: { attemptId: { $type: "string" } },
    }
);

const Result = mongoose.model("Result", resultSchema);

export default Result;
