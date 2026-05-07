import { Request, Response, NextFunction } from "express";
import { Message } from "../models/message.model";
import { Conversation } from "../models/conversation.model";
import SimpleOrder from "../models/simpleorder.model";
import { getSocketIO, getConnectedUsers } from "../lib/socket";
import mongoose from "mongoose";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalise(id: string) {
  return id.toString();
}

/** Find or create a general (non-order) conversation, recording who initiated. */
async function findOrCreateConversation(
  user1Id: string,
  user2Id: string,
  initiatorId: string
) {
  // Canonical pair: smaller ID first so queries are index-friendly
  const [a, b] = [user1Id, user2Id].sort();

  let conv = await Conversation.findOne({ user1Id: a, user2Id: b, orderId: null });
  if (!conv) {
    conv = await Conversation.create({ user1Id: a, user2Id: b, initiatorId });
  }
  return conv;
}

// ─── Existing Endpoints ────────────────────────────────────────────────────────

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { from, to, content } = req.body;
    if (!from || !to || !content) {
      return res.status(400).json({ error: "Missing required fields: from, to, content" });
    }

    const message = await Message.create({ from, to, content, type: "text" });

    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const receiverSocketId = connectedUsers.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", {
        _id: message._id, from: message.from, to: message.to,
        content: message.content, type: message.type,
        createdAt: message.createdAt, read: message.read,
      });
    }

    res.status(201).json({
      message: "Message sent successfully",
      data: {
        _id: message._id, from: message.from, to: message.to,
        content: message.content, type: message.type,
        createdAt: message.createdAt, read: message.read,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId1, userId2 } = req.query;
    if (!userId1 || !userId2) {
      return res.status(400).json({ error: "Missing required query parameters: userId1, userId2" });
    }

    const messages = await Message.find({
      $or: [
        { from: userId1, to: userId2 },
        { from: userId2, to: userId1 },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json({ messages });
  } catch (error) {
    next(error);
  }
};

export const messageRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.body;
    const message = await Message.findByIdAndUpdate(messageId, { read: true }, { new: true });
    if (!message) return res.status(404).json({ error: "Message not found" });

    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const senderSocketId = connectedUsers.get(message.from.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("messageRead", { messageId: message._id });
    }

    res.status(200).json({ message: "Success", data: message });
  } catch (error) {
    next(error);
  }
};

/** Create a general conversation, recording initiator. */
export const setConv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user1Id, user2Id } = req.body;
    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: "Missing required fields: user1Id, user2Id" });
    }

    // The initiator is always the one calling this endpoint (the person who clicked "Contact Seller")
    const initiatorId = req.user?._id?.toString() || user1Id;

    const conv = await findOrCreateConversation(user1Id, user2Id, initiatorId);

    const isNew = (conv.createdAt?.getTime() ?? 0) > Date.now() - 2000;
    res.status(200).json({
      status: isNew ? "created" : "exists",
      conversation: conv,
    });
  } catch (error) {
    next(error);
  }
};

export const getConv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "Missing required query parameter: userId" });
    }

    // Only return general conversations (no orderId)
    const conversations = await Conversation.find({
      $or: [{ user1Id: userId }, { user2Id: userId }],
      orderId: null,
    }).sort({ createdAt: 1 });

    return res.status(200).json({ conversations });
  } catch (error) {
    next(error);
  }
};

// ─── Custom Offer ──────────────────────────────────────────────────────────────

/**
 * POST /api/chat/offer
 * Seller sends a custom offer card to the buyer inside the existing chat.
 */
export const sendCustomOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sellerId = req.user?._id?.toString();
    if (!sellerId) return res.status(401).json({ error: "Authentication required" });

    const { buyerId, title, description, price, deliveryTime, revisions } = req.body;

    if (!buyerId || !title || !description || !price || !deliveryTime) {
      return res.status(400).json({ error: "Missing required fields: buyerId, title, description, price, deliveryTime" });
    }

    // Seller is NOT the initiator of the general chat — buyer contacted first.
    // We still need a general conversation to exist so we can send the offer there.
    const conv = await findOrCreateConversation(sellerId, buyerId, buyerId);

    const content = `📦 Custom Offer: ${title} — ${price} DA / ${deliveryTime} day(s)`;

    const message = await Message.create({
      from: sellerId,
      to: buyerId,
      content,
      type: "custom_offer",
      offer: {
        title,
        description,
        price: Number(price),
        deliveryTime: Number(deliveryTime),
        revisions: Number(revisions ?? 1),
        status: "pending",
      },
    });

    // Real-time push
    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const buyerSocket = connectedUsers.get(buyerId);
    if (buyerSocket) {
      io.to(buyerSocket).emit("newMessage", {
        _id: message._id, from: message.from, to: message.to,
        content: message.content, type: message.type, offer: message.offer,
        createdAt: message.createdAt, read: message.read,
      });
    }

    return res.status(201).json({
      message: "Custom offer sent",
      data: {
        _id: message._id, from: message.from, to: message.to,
        content: message.content, type: message.type, offer: message.offer,
        createdAt: message.createdAt, read: message.read,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/offer/:messageId/accept
 * Buyer accepts a custom offer.
 * Creates a SimpleOrder + a brand-new order-scoped conversation.
 */
export const acceptCustomOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyerId = req.user?._id?.toString();
    if (!buyerId) return res.status(401).json({ error: "Authentication required" });

    const { messageId } = req.params;

    const offerMessage = await Message.findById(messageId);
    if (!offerMessage || offerMessage.type !== "custom_offer") {
      return res.status(404).json({ error: "Custom offer not found" });
    }
    if (offerMessage.to !== buyerId) {
      return res.status(403).json({ error: "Only the intended buyer can accept this offer" });
    }
    if (offerMessage.offer?.status !== "pending") {
      return res.status(400).json({ error: `Offer is already ${offerMessage.offer?.status}` });
    }

    const sellerId = offerMessage.from;
    const offer = offerMessage.offer!;

    // Mark offer as accepted
    offerMessage.offer!.status = "accepted";
    await offerMessage.save();

    // Create a SimpleGig placeholder for this custom offer
    // We import dynamically to avoid circular deps
    const { default: SimpleGig } = await import("../models/simplegig.model");

    const customGig = await SimpleGig.create({
      seller: sellerId,
      title: offer.title,
      description: offer.description,
      price: offer.price,
      deliveryTime: offer.deliveryTime,
      category: "custom",
      isCustomOffer: true,
      isActive: false, // not publicly listed
    });

    // Create the order
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + offer.deliveryTime);

    const order = await SimpleOrder.create({
      gig: customGig._id,
      buyer: buyerId,
      seller: sellerId,
      price: offer.price,
      deliveryTime: offer.deliveryTime,
      revisions: offer.revisions,
      payment: { amount: offer.price, currency: "DZD", status: "pending" },
      timeline: { ordered: new Date() },
      expectedDelivery: deliveryDate,
      requirements: [],
    });

    // Create a brand-new order-scoped conversation (always unique per order)
    const [a, b] = [buyerId, sellerId].sort();
    const orderConv = await Conversation.create({
      user1Id: a,
      user2Id: b,
      initiatorId: buyerId,       // buyer initiated the order
      orderId: order._id.toString(),
    });

    // Notify the seller in real-time
    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const sellerSocket = connectedUsers.get(sellerId);
    if (sellerSocket) {
      io.to(sellerSocket).emit("offerAccepted", {
        orderId: order._id,
        convId: orderConv._id,
        buyerId,
        offer,
      });
    }

    return res.status(201).json({
      message: "Offer accepted. Order created.",
      orderId: order._id,
      convId: orderConv._id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/offer/:messageId/reject
 * Buyer rejects a custom offer.
 */
export const rejectCustomOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const buyerId = req.user?._id?.toString();
    if (!buyerId) return res.status(401).json({ error: "Authentication required" });

    const { messageId } = req.params;

    const offerMessage = await Message.findById(messageId);
    if (!offerMessage || offerMessage.type !== "custom_offer") {
      return res.status(404).json({ error: "Custom offer not found" });
    }
    if (offerMessage.to !== buyerId) {
      return res.status(403).json({ error: "Only the intended buyer can reject this offer" });
    }
    if (offerMessage.offer?.status !== "pending") {
      return res.status(400).json({ error: `Offer is already ${offerMessage.offer?.status}` });
    }

    offerMessage.offer!.status = "rejected";
    await offerMessage.save();

    // Notify seller
    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const sellerSocket = connectedUsers.get(offerMessage.from);
    if (sellerSocket) {
      io.to(sellerSocket).emit("offerRejected", { messageId, buyerId });
    }

    return res.status(200).json({ message: "Offer rejected." });
  } catch (error) {
    next(error);
  }
};