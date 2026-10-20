import express from 'express';
import { CreatemyResult, getMyResult } from '../controllers/resultController.js';
import { allowMethods } from '../middleware/httpMethods.js';

const router = express.Router();

router.post("/create", CreatemyResult);
router.all("/create", allowMethods(["POST"]));

router.get("/my-results", getMyResult);
router.all("/my-results", allowMethods(["GET"]));

export default router;
