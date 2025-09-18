import { Router } from "express";
import { sendMessage, getMessages } from "../controllers/chat.controller";
import { protectRoute } from "../middleware/auth.middelware";

const router = Router();

// POST /api/chat/message - Send a message
router.post("/message",protectRoute, sendMessage);

// GET /api/chat/messages - Get messages between two users
router.get("/messages",protectRoute, getMessages);

export default router;