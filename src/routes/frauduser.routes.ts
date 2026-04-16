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
import { protectAdminRoute, requirePermission } from "../middleware/admin.middleware";

const router = Router();

// AI endpoint - flag a user (can be called programmatically)
router.post("/flag", flagUserAsFraud);

// Check user's fraud status (before processing transactions)
router.get("/check/:userId", checkUserFraudStatus);

// Admin endpoints - require authenticated admin with fraud management permission
router.get("/cases", protectAdminRoute, requirePermission("canManageFraud"), getFlaggedUsers);
router.get("/cases/:id", protectAdminRoute, requirePermission("canManageFraud"), getFraudCaseDetails);
router.put("/cases/:id/review", protectAdminRoute, requirePermission("canManageFraud"), reviewFraudCase);
router.put("/cases/:id/resolve", protectAdminRoute, requirePermission("canManageFraud"), resolveFraudCase);
router.post("/cases/:id/notes", protectAdminRoute, requirePermission("canManageFraud"), addNoteToFraudCase);
router.get("/statistics", protectAdminRoute, requirePermission("canManageFraud"), getFraudStatistics);

export default router;
