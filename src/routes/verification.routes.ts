import { Router } from "express";
const router = Router();
import { verifyOTPAndCreateAccount } from "../controllers/verification.controller";
router.post('/verify-otp', verifyOTPAndCreateAccount);

export default router;