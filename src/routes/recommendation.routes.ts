import { Router } from "express";
import { getRecommendations } from "../controllers/recommendation.controller";
import { protectRoute } from "../middleware/auth.middelware";

const router = Router();

// GET /api/recommendations — personalized gig feed for logged-in buyer
router.get("/", protectRoute, getRecommendations);

export default router;
