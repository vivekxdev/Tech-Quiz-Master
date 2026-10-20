import User from "../model/User.js";
import Quiz from "../model/Quiz.js";

// Level buckets are always present (stable shape for the dashboard), even
// when the catalog is empty.
const emptyLevelCounts = () => ({ Basic: 0, Intermediate: 0, Advanced: 0 });

// Metadata-only projection of a quiz for the dashboard's "recent" list.
// Answer keys are never part of this shape.
const toRecentQuiz = (quiz) => ({
    _id: quiz._id,
    technology: quiz.technology,
    level: quiz.level,
    timeLimit: quiz.timeLimit,
    totalQuestions:
        Number.isFinite(quiz.totalQuestions) && quiz.totalQuestions > 0
            ? quiz.totalQuestions
            : Array.isArray(quiz.questions)
                ? quiz.questions.length
                : 0,
    createdAt: quiz.createdAt,
});

// To get stats of a user.
// Runs behind protect + isAdmin, so the missing-userId branch is a session
// problem (401) rather than a missing resource. Unexpected errors bubble to
// the centralised error handler, which logs them and returns the shared
// { success: false, message } JSON contract.
//
// The original user counters are unchanged; quiz counters/recent uploads are
// additive fields so existing consumers (and tests) keep working.
export const getStats = async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const [totalUsers, loggedInUsers, quizzes] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isLoggedIn: true }),
        Quiz.find()
            .sort({ createdAt: -1 })
            .select("technology level timeLimit totalQuestions questions createdAt")
            .lean(),
    ]);

    const levelCounts = emptyLevelCounts();
    let totalQuestions = 0;
    for (const quiz of quizzes) {
        const count =
            Number.isFinite(quiz.totalQuestions) && quiz.totalQuestions > 0
                ? quiz.totalQuestions
                : Array.isArray(quiz.questions)
                    ? quiz.questions.length
                    : 0;
        totalQuestions += count;
        if (levelCounts[quiz.level] != null) {
            levelCounts[quiz.level] += 1;
        }
    }

    res.json({
        totalUsers,
        loggedInUsers,
        loggedInPercentage: totalUsers > 0 ? ((loggedInUsers / totalUsers) * 100).toFixed(2) : "0.00",
        totalQuizzes: quizzes.length,
        totalQuestions,
        levelCounts,
        recentQuizzes: quizzes.slice(0, 5).map(toRecentQuiz),
    });
};
