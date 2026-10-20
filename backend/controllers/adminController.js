import Quiz from "../model/Quiz.js";
import { isValidObjectId } from "../middleware/validation.js";

// Public shape of a quiz: only what a client needs to take or list the quiz.
// answerKey never leaves the server — scoring and review generation read it
// straight from the Quiz document (see resultController.js). createdBy is
// internal bookkeeping that no client renders.
const toPublicQuestion = (question) => ({
    _id: question._id,
    question: question.question,
    options: question.options
});

const toPublicQuiz = (quiz) => ({
    _id: quiz._id,
    technology: quiz.technology,
    level: quiz.level,
    timeLimit: quiz.timeLimit,
    totalQuestions: quiz.totalQuestions,
    createdAt: quiz.createdAt,
    questions: quiz.questions.map(toPublicQuestion)
});

const badRequest = (res, message) =>
    res.status(400).json({ success: false, message });

// Create a new quiz.
// req.validatedQuiz is produced by middleware/validateQuizBody (required,
// shape-checked, normalised). Client-sent totalQuestions/createdBy are never
// read here. Unexpected errors bubble to the centralised error handler.
export const createQuiz = async (req, res) => {
    const quizInput = req.validatedQuiz;
    if (!quizInput) {
        return badRequest(res, "Invalid quiz payload");
    }

    const createdBy = req.auth?.userId;
    const quiz = await Quiz.findOneAndUpdate(
        {
            technology: quizInput.technology.toLowerCase(),
            level: quizInput.level
        },
        {
            ...quizInput,
            totalQuestions: quizInput.questions.length,
            createdBy
        },
        {
            new: true,
            upsert: true
        }
    );
    // The admin Dashboard never reads the upload response body, so it returns
    // the same public shape as the quiz GETs (single canonical serialization).
    res.status(201).json({ success: true, quiz: toPublicQuiz(quiz) });
}

// To get all quizzes
export const getAllQuizzes = async (req, res) => {
    const quizzes = await Quiz.find().sort({ createdAt: -1 });
    res.json({ success: true, quizzes: quizzes.map(toPublicQuiz) });
}

// Get a single quiz by id
export const getQuizById = async (req, res) => {
    const { id } = req.params;
    // A malformed ObjectId would otherwise throw a CastError and surface as a
    // 500 — it is a bad request, not a server fault.
    if (!isValidObjectId(id)) {
        return badRequest(res, "Invalid quiz id");
    }
    const quiz = await Quiz.findById(id);
    if (!quiz) {
        return res.status(404).json({ success: false, message: "Quiz not found" });
    }
    res.json({ success: true, quiz: toPublicQuiz(quiz) });
};

// Duplicate a quiz. The copy is created entirely server-side: the question
// bank (answer keys included) is never sent to the client, so an admin can
// clone a quiz without the answers ever leaving the server. The name gets a
// "(copy)" suffix, numbered when that name is already taken.
export const duplicateQuiz = async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return badRequest(res, "Invalid quiz id");
    }

    const source = await Quiz.findById(id);
    if (!source) {
        return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    const baseName = source.technology.replace(/\s*\(copy(?:\s+\d+)?\)$/i, "").trim() || source.technology;
    let name = `${baseName} (copy)`;
    let suffix = 2;
    while (await Quiz.exists({ technology: name.toLowerCase(), level: source.level })) {
        name = `${baseName} (copy ${suffix})`.slice(0, 100);
        suffix += 1;
    }

    const copy = await Quiz.create({
        technology: name,
        level: source.level,
        timeLimit: source.timeLimit,
        questions: source.questions.map((question) => ({
            question: question.question,
            options: question.options,
            answerKey: question.answerKey,
        })),
        totalQuestions: source.questions.length,
        createdBy: req.auth?.userId,
    });

    res.status(201).json({ success: true, quiz: toPublicQuiz(copy) });
};

// To delete a quiz
export const deleteQuiz = async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
        return badRequest(res, "Invalid quiz id");
    }
    const quiz = await Quiz.findByIdAndDelete(id);
    if (!quiz) {
        return res.status(404).json({ success: false, message: "Quiz not found" });
    }
    res.json({ success: true, message: "Quiz deleted successfully" });
}
