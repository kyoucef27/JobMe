import { AICHATBOT } from "../services/ai.services";
import { Router } from "express";
import { sendMessageAI , getMessagesAI } from "../controllers/aichat.controller";
import { protectRoute } from "../middleware/auth.middelware";

const router = Router();

// POST /api/chat/message - Send a message
router.post("/message", sendMessageAI);

// GET /api/chat/messages - Get messages between two users
router.get("/message", getMessagesAI);

export default router;