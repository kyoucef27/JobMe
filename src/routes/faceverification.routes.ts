import { Router } from "express";
import { upload } from "../controllers/upload.controller";
import { verifyIdFace } from "../controllers/verification.controller";

const router = Router();

router.post(
  "/verify-id",
  upload.fields([
    { name: "idImage", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  verifyIdFace
);

export default router;
