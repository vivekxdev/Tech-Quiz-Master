import express from 'express';
import { getStats } from "../controllers/userController.js";

import { deleteQuiz, duplicateQuiz, getAllQuizzes, createQuiz, getQuizById } from '../controllers/adminController.js';
import { protect, isAdmin } from '../middleware/auth.js';
import { validateQuizBody } from '../middleware/validation.js';
import { allowMethods } from '../middleware/httpMethods.js';

const router = express.Router();

// Quiz creation and deletion are admin-only operations. validateQuizBody runs
// last so authentication/authorization are never bypassed by a validation
// response, and rejects malformed quiz payloads with a 400 before the
// controller writes anything.
router.post("/upload-quiz", protect, isAdmin, validateQuizBody, createQuiz);
router.all("/upload-quiz", allowMethods(["POST"]));

// Admin statistics: admin-only data, authentication required first.
router.get("/stats", protect, isAdmin, getStats);
router.all("/stats", allowMethods(["GET"]));

// Public quiz catalogue: consumed by the user quiz flow (Sidebar) without
// admin rights. Responses go through toPublicQuiz (see controllers/
// adminController.js), so answer keys never reach the quiz-taking client.
router.get("/quizzes", getAllQuizzes);
router.all("/quizzes", allowMethods(["GET"]));

router.get("/quiz/:id", getQuizById);

// Cloning is an admin write operation; the copy is built server-side so
// answer keys are never part of the request or response.
router.post("/quiz/:id/duplicate", protect, isAdmin, duplicateQuiz);
router.all("/quiz/:id/duplicate", allowMethods(["POST"]));

router.delete("/quiz/:id", protect, isAdmin, deleteQuiz);
router.all("/quiz/:id", allowMethods(["GET", "DELETE"]));


export default router;
