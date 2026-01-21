import express from "express";
import {
  adminLogin,
  createAdmin,
  getAdminProfile,
  updateAdminPermissions,
  listAdmins,
  updateAdminStatus,
} from "../controllers/admin.controller";
import { protectAdminRoute, requireSuperAdmin } from "../middleware/admin.middleware";

const router = express.Router();

// Public routes
router.post("/login", adminLogin);

// Protected routes
router.get("/profile", protectAdminRoute, getAdminProfile);
router.get("/list", protectAdminRoute, requireSuperAdmin, listAdmins);
router.post("/create", protectAdminRoute, requireSuperAdmin, createAdmin);
router.patch("/:adminId/permissions", protectAdminRoute, requireSuperAdmin, updateAdminPermissions);
router.patch("/:adminId/status", protectAdminRoute, requireSuperAdmin, updateAdminStatus);

export default router;
