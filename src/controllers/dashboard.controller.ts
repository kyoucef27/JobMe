import { Request, Response } from "express";
import { SimpleOrder } from "../models/simpleorder.model";
import { Order } from "../models/order.model";
import { Message } from "../models/message.model";
import { User } from "../models/user.model";
import mongoose from "mongoose";

// ─── Seller Level System ───────────────────────────────────────────────────────
// Levels are computed dynamically from the seller's completed order history.
export interface SellerLevel {
  id: "new_seller" | "level_1" | "level_2" | "top_rated";
  label: string;
  completedOrders: number;
  nextLevelAt: number | null;   // null if already at max level
  progressToNext: number;        // 0–100 percentage
}

export async function computeSellerLevel(userId: string): Promise<SellerLevel> {
  const [simpleCompleted, regularCompleted] = await Promise.all([
    SimpleOrder.countDocuments({ seller: userId, status: "completed" }),
    Order.countDocuments({ seller: userId, status: "completed" }),
  ]);
  const completedOrders = simpleCompleted + regularCompleted;

  // Review aggregation for avg rating
  const [simpleAgg, regularAgg] = await Promise.all([
    SimpleOrder.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(userId), status: "completed", "review.rating": { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$review.rating" }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(userId), status: "completed", "review.rating": { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$review.rating" }, count: { $sum: 1 } } },
    ]),
  ]);

  const simpleAvg = simpleAgg[0]?.avg ?? 5;
  const simpleCount = simpleAgg[0]?.count ?? 0;
  const regularAvg = regularAgg[0]?.avg ?? 5;
  const regularCount = regularAgg[0]?.count ?? 0;

  const totalReviews = simpleCount + regularCount;
  const avgRating = totalReviews > 0 
    ? (simpleAvg * simpleCount + regularAvg * regularCount) / totalReviews 
    : 5;

  // Thresholds
  const LEVEL_1_ORDERS = 10;
  const LEVEL_2_ORDERS = 50;
  const TRS_ORDERS = 100;
  const LEVEL_2_RATING = 4.5;
  const TRS_RATING = 4.8;

  if (completedOrders >= TRS_ORDERS && avgRating >= TRS_RATING) {
    return { id: "top_rated", label: "Top Rated Seller", completedOrders, nextLevelAt: null, progressToNext: 100 };
  }
  if (completedOrders >= LEVEL_2_ORDERS && avgRating >= LEVEL_2_RATING) {
    const progress = Math.min(100, Math.round(((completedOrders - LEVEL_2_ORDERS) / (TRS_ORDERS - LEVEL_2_ORDERS)) * 100));
    return { id: "level_2", label: "Level 2", completedOrders, nextLevelAt: TRS_ORDERS, progressToNext: progress };
  }
  if (completedOrders >= LEVEL_1_ORDERS) {
    const progress = Math.min(100, Math.round(((completedOrders - LEVEL_1_ORDERS) / (LEVEL_2_ORDERS - LEVEL_1_ORDERS)) * 100));
    return { id: "level_1", label: "Level 1", completedOrders, nextLevelAt: LEVEL_2_ORDERS, progressToNext: progress };
  }
  // New Seller
  const progress = Math.min(100, Math.round((completedOrders / LEVEL_1_ORDERS) * 100));
  return { id: "new_seller", label: "New Seller", completedOrders, nextLevelAt: LEVEL_1_ORDERS, progressToNext: progress };
}
// ──────────────────────────────────────────────────────────────────────────────

export const GetSellerDashboard = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // 1. Fetch active orders (populate buyer info)
    const [simpleActive, regularActive] = await Promise.all([
      SimpleOrder.find({
        seller: userId,
        status: { $in: ["pending", "active", "in_revision", "delivered"] },
      }).populate("buyer", "name pfp").sort({ createdAt: -1 }).limit(5),
      Order.find({
        seller: userId,
        status: { $in: ["pending", "active", "in_revision", "delivered"] },
      }).populate("buyer", "name pfp").sort({ createdAt: -1 }).limit(5),
    ]);

    const activeOrders = [...simpleActive, ...regularActive.map(o => ({
      ...o.toObject(),
      price: (o as any).totalAmount ?? (o as any).price
    }))].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 5);

    // 2. Fetch recent messages
    const recentMessages = await Message.find({ to: userId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    // We need to populate the sender for messages manually if not referenced directly
    const populatedMessages = await Promise.all(
      recentMessages.map(async (msg) => {
        const sender = await User.findById(msg.from).select("name pfp");
        return {
          _id: msg._id,
          content: msg.content,
          createdAt: msg.createdAt,
          read: msg.read,
          sender: sender || { name: "Unknown", pfp: "" },
        };
      })
    );

    // 3. Calculate Performance Metrics
    const [simpleAll, regularAll] = await Promise.all([
      SimpleOrder.find({ seller: userId }),
      Order.find({ seller: userId }),
    ]);
    const allOrders = [...simpleAll, ...regularAll];

    let totalEarnings = 0;
    let completedOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let totalRating = 0;
    let reviewCount = 0;

    allOrders.forEach((order) => {
      if (order.status === "completed") {
        totalEarnings += (order as any).totalAmount ?? order.price;
        completedOrdersCount++;
        if (order.review && order.review.rating) {
          totalRating += order.review.rating;
          reviewCount++;
        }
      } else if (order.status === "cancelled") {
        cancelledOrdersCount++;
      }
    });

    const activeOrdersCount = allOrders.filter((o) => 
      ["pending", "active", "in_revision", "delivered"].includes(o.status)
    ).length;

    const totalFinished = completedOrdersCount + cancelledOrdersCount;
    const completionRate = totalFinished > 0 
      ? Math.round((completedOrdersCount / totalFinished) * 100) 
      : 100;

    const averageRating = reviewCount > 0 
      ? (totalRating / reviewCount).toFixed(1) 
      : "5.0";

    // 4. Get Seller Level
    const sellerLevel = await computeSellerLevel(userId);

    res.status(200).json({
      success: true,
      data: {
        activeOrders,
        recentMessages: populatedMessages,
        performance: {
          activeOrdersCount,
          totalEarnings,
          completedOrdersCount,
          completionRate,
          averageRating,
          sellerLevel,
        },
      },
    });
  } catch (error: any) {
    console.error("Error in GetSellerDashboard:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

import Feedback from "../models/feedback.model";

export const SubmitFeedback = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      res.status(400).json({ success: false, message: "Message is required" });
      return;
    }

    const feedback = new Feedback({
      user: userId,
      message,
    });

    await feedback.save();

    res.status(201).json({ success: true, message: "Feedback submitted successfully" });
  } catch (error: any) {
    console.error("Error in SubmitFeedback:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const GetEarningsData = async (req: Request | any, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // Fetch all completed orders for this seller
    const [simpleCompleted, regularCompleted] = await Promise.all([
      SimpleOrder.find({ seller: userId, status: "completed" }).populate("buyer", "name pfp").sort({ createdAt: -1 }),
      Order.find({ seller: userId, status: "completed" }).populate("buyer", "name pfp").sort({ createdAt: -1 }),
    ]);

    const completedOrders = [...simpleCompleted, ...regularCompleted].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    let netIncome = 0;
    let completedOnTime = 0;

    // Process transactions
    const transactions = completedOrders.map(order => {
      const price = (order as any).totalAmount ?? order.price;
      netIncome += price;

      // Check if delivered on time (actualDelivery <= expectedDelivery)
      const deliveredOnTime =
        order.actualDelivery && order.expectedDelivery
          ? order.actualDelivery <= order.expectedDelivery
          : true; // If no actual delivery recorded, assume on time

      if (deliveredOnTime) completedOnTime++;

      return {
        id: order._id,
        date: order.timeline?.completed || order.updatedAt,
        buyer: order.buyer,
        amount: (order as any).totalAmount ?? order.price,
        currency: "DA",
        status: "cleared",
      };
    });

    // Available for withdrawal = total net income (no real wallet system yet)
    const withdrawn = 0;
    const availableForWithdrawal = netIncome;

    res.status(200).json({
      success: true,
      data: {
        netIncome,
        withdrawn,
        availableForWithdrawal,
        currency: "DA",
        completedOrdersCount: completedOrders.length,
        completedOnTime,
        onTimeRate: completedOrders.length > 0
          ? Math.round((completedOnTime / completedOrders.length) * 100)
          : 100,
        transactions,
      },
    });
  } catch (error: any) {
    console.error("Error in GetEarningsData:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

