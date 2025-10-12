import { Router } from "express";
import { sendMessage, getMessages } from "../controllers/chat.controller";
import { protectRoute } from "../middleware/auth.middelware";

const router = Router();


router.post("/message", sendMessage);

router.get("/messages", getMessages);

export default router;