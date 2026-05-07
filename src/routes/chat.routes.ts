import { Router } from "express";
import {
  sendMessage,
  getMessages,
  messageRead,
  setConv,
  getConv,
  sendCustomOffer,
  acceptCustomOffer,
  rejectCustomOffer,
} from "../controllers/chat.controller";
import { protectRoute } from "../middleware/auth.middelware";

const router = Router();

// General messages
router.post("/message", sendMessage);
router.get("/messages", getMessages);
router.post("/messageread", messageRead);

// Conversations
router.post("/conv", protectRoute, setConv);
router.get("/conv", getConv);

// Custom offers (all require auth)
router.post("/offer", protectRoute, sendCustomOffer);
router.post("/offer/:messageId/accept", protectRoute, acceptCustomOffer);
router.post("/offer/:messageId/reject", protectRoute, rejectCustomOffer);

export default router;