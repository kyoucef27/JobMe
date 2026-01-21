import { Router } from "express";
import {
  flagUserAsFraud,
  getFlaggedUsers,
  getFraudCaseDetails,
  reviewFraudCase,
  resolveFraudCase,
  getFraudStatistics,
  checkUserFraudStatus,
  addNoteToFraudCase,
} from "../controllers/frauduser.controller";
// import { authenticateToken, isAdmin } from "../middleware/auth.middelware.ts";

const router = Router();

// AI endpoint - flag a user (can be called programmatically)
router.post("/flag", flagUserAsFraud);

// Check user's fraud status (before processing transactions)
router.get("/check/:userId", checkUserFraudStatus);

// Admin endpoints - require authentication and admin role
// Uncomment the middleware when ready to add authentication
router.get("/cases", /* authenticateToken, isAdmin, */ getFlaggedUsers);
router.get("/cases/:id", /* authenticateToken, isAdmin, */ getFraudCaseDetails);
router.put("/cases/:id/review", /* authenticateToken, isAdmin, */ reviewFraudCase);
router.put("/cases/:id/resolve", /* authenticateToken, isAdmin, */ resolveFraudCase);
router.post("/cases/:id/notes", /* authenticateToken, isAdmin, */ addNoteToFraudCase);
router.get("/statistics", /* authenticateToken, isAdmin, */ getFraudStatistics);

export default router;
