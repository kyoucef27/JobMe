import { Router } from "express";
import {
  submitReport,
  getAllReports,
  getReportDetails,
  reviewReport,
  getSellerReports,
  getMyReports,
} from "../controllers/report.controller.ts";
import multer from "multer";
// import { authenticateToken, isAdmin } from "../middleware/auth.middelware.ts";

const router = Router();

// Multer configuration for report evidence uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5, // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|heic|heif|svg\+xml)$/i.test(
      file.mimetype
    );
    if (ok) return cb(null, true);
    cb(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Only image files are allowed"
      )
    );
  },
});

// User endpoints - require authentication
// Uncomment the middleware when ready to add authentication
router.post("/submit", /* authenticateToken, */ upload.array('screenshots', 5), submitReport);
router.get("/my-reports", /* authenticateToken, */ getMyReports);

// Public/Semi-public endpoints
router.get("/seller/:sellerId", getSellerReports);

// Admin endpoints - require authentication and admin role
router.get("/all", /* authenticateToken, isAdmin, */ getAllReports);
router.get("/:id", /* authenticateToken, isAdmin, */ getReportDetails);
router.put("/:id/review", /* authenticateToken, isAdmin, */ reviewReport);

export default router;
