import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Admin } from "../models/admin.model";

interface AdminTokenPayload {
  id: string;
  email: string;
  role: string;
  permissions: any;
  type: string;
}

// Protect admin routes - verify JWT token
export const protectAdminRoute = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback-secret-key"
    ) as AdminTokenPayload;

    // Check if token is for admin
    if (decoded.type !== 'admin') {
      return res.status(403).json({ error: "Access denied - Admin only" });
    }

    // Get admin from database
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Check if account is active
    if (admin.status !== 'active') {
      return res.status(403).json({ error: "Account is not active" });
    }

    // Attach admin to request
    req.user = admin as any;
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    console.error("Admin auth middleware error:", error);
    res.status(500).json({ error: "Authentication error" });
  }
};

// Check specific permissions
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = req.user as any;

    if (!admin) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Super admin has all permissions
    if (admin.role === 'super_admin') {
      return next();
    }

    // Check if admin has the required permission
    if (!admin.permissions || !admin.permissions[permission]) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: permission 
      });
    }

    next();
  };
};

// Require super admin role
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const admin = req.user as any;

  if (!admin || admin.role !== 'super_admin') {
    return res.status(403).json({ error: "Super admin access required" });
  }

  next();
};
