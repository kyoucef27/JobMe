import { Request, Response, NextFunction } from "express";
import { Order, IOrder } from "../models/order.model";
import { Gig } from "../models/gig.model";
import { OrderMessage } from "../models/ordermessage.model";
import mongoose from "mongoose";
import { Notification } from "../models/notification.model";
import { sendNotification } from "../lib/socket";
import { detectSuspiciousPatterns, analyzeOrderForFraud } from "../services/fraud-detection.service";
import { User } from "../models/user.model";
import { logInteraction } from "../services/recommendation.service";

// Create new order
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const buyerId = req.user?._id;
    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      gigId,
      package: packageType,
      requirements,
      extras
    } = req.body;

    if (!gigId || !packageType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate gig exists and is active
    const gig = await Gig.findById(gigId).populate('seller', 'name email');
    if (!gig || !gig.isActive) {
      return res.status(404).json({ message: "Gig not found or inactive" });
    }

    // Check if buyer is not the seller
    if (gig.seller._id.toString() === buyerId.toString()) {
      return res.status(400).json({ message: "Cannot order your own gig" });
    }

    // Get package details
    const packageDetails = gig.price[packageType as 'basic' | 'standard' | 'premium'];
    if (!packageDetails) {
      return res.status(400).json({ message: "Invalid package type" });
    }

    // Calculate total amount
    const extrasTotal = extras?.reduce((sum: number, extra: any) => sum + extra.price, 0) || 0;
    const totalAmount = packageDetails.price + extrasTotal;

    // Calculate expected delivery date
    const expectedDelivery = new Date();
    expectedDelivery.setDate(expectedDelivery.getDate() + packageDetails.deliveryTime);

    // Create order
    const newOrder = new Order({
      gig: gigId,
      buyer: buyerId,
      seller: gig.seller._id,
      package: packageType,
      price: packageDetails.price,
      deliveryTime: packageDetails.deliveryTime,
      revisions: packageDetails.revisions,
      requirements: requirements || [],
      extras: extras || [],
      totalAmount,
      expectedDelivery,
      payment: {
        amount: totalAmount,
        currency: 'USD',
        status: 'pending'
      }
    });

    // Getting all orders of the buyer to analyze patterns including the new pending order
    const buyerOrders = await Order.find({ buyer: buyerId })
      .sort({ createdAt: 1 })
      .select("price status createdAt")
      .lean();

    // Analyze for suspicious patterns with the new order included
    const suspiciousPatterns = await detectSuspiciousPatterns(
      buyerId.toString(),
      [
        ...buyerOrders,
        {
          price: gig.price,
          status: "pending",
          createdAt: new Date(),
        },
      ]
    );

    if (suspiciousPatterns.length > 0) {
      const cancelledOrders = buyerOrders.filter((o) => o.status === "cancelled").length;
      const orderValues = [...buyerOrders.map((o) => Number(o.price) || 0), Number(gig.price) || 0];
      const averageOrderValue =
        orderValues.length > 0
          ? orderValues.reduce((sum, value) => sum + value, 0) / orderValues.length
          : 0;

      const buyer = await User.findById(buyerId).select("createdAt").lean();
      const accountAge = buyer?.createdAt
        ? Math.floor((Date.now() - new Date(buyer.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // 1. Fire-and-forget fraud analysis only when suspicious patterns are detected.
      void analyzeOrderForFraud({
        userId: buyerId.toString(),
        buyerId: buyerId.toString(),
        sellerId: gig.seller._id.toString(),
        price: Number(gig.price) || 0,
        buyerHistory: {
          totalOrders: buyerOrders.length + 1,
          cancelledOrders,
          averageOrderValue,
          accountAge,
        },
        orderDetails: {
          requirements: requirements || [],
          deliveryTime: packageDetails.deliveryTime,
          unusualPatterns: suspiciousPatterns,
        },
        triggeringEvent: {
          type: "simple_order_blocked_by_pattern",
          gigId: gigId.toString(),
          timestamp: new Date(),
        },
      }).catch((analysisError) => {
        console.error("[createSimpleOrder] analyzeOrderForFraud failed:", analysisError);
      });

      // 2. return suspicious patterns in response without creating the order
      return res.status(200).json({
        message: "Suspicious patterns detected",
        suspiciousPatterns,
      });
    }

    const savedOrder = await newOrder.save();
    await savedOrder.populate([
      { path: 'gig', select: 'title images price' },
      { path: 'buyer', select: 'name email pfp' },
      { path: 'seller', select: 'name email pfp' }
    ]);

    // Update gig total orders count
    await Gig.findByIdAndUpdate(gigId, { $inc: { totalOrders: 1 } });

    // ── AI Interaction Logging (fire-and-forget) ──────────────────────────
    void logInteraction({
      buyerId: buyerId.toString(),
      type: "order",
      gigId: gigId.toString(),
      category: gig.category,
      tags: gig.tags,
    }).catch(() => {});

    res.status(201).json({
      message: "Order created successfully",
      order: savedOrder
    });
  } catch (error) {
    next(error);
  }
};

// Get orders for buyer
export const getBuyerOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const buyerId = req.user?._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter: any = { buyer: buyerId };
    if (status) filter.status = status;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(20, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, totalCount] = await Promise.all([
      Order.find(filter)
        .populate('gig', 'title images price category')
        .populate('seller', 'name pfp')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      orders,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get orders for seller
export const getSellerOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sellerId = req.user?._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter: any = { seller: sellerId };
    if (status) filter.status = status;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(20, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [orders, totalCount] = await Promise.all([
      Order.find(filter)
        .populate('gig', 'title images price category')
        .populate('buyer', 'name pfp')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      orders,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single order
export const getOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId)
      .populate('gig', 'title images price category seller')
      .populate('buyer', 'name email pfp')
      .populate('seller', 'name email pfp');

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is involved in this order
    if (order.buyer._id.toString() !== userId?.toString() &&
      order.seller._id.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
};

// Update order status
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const validStatuses = ['pending', 'active', 'delivered', 'completed', 'cancelled', 'in_revision'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check authorization based on status change
    const isSeller = order.seller.toString() === userId?.toString();
    const isBuyer = order.buyer.toString() === userId?.toString();

    if (!isSeller && !isBuyer) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Status transition rules
    const statusTransitions: { [key: string]: string[] } = {
      'pending': ['active', 'cancelled'],
      'active': ['delivered', 'cancelled'],
      'delivered': ['completed', 'in_revision'],
      'in_revision': ['delivered'],
      'completed': [],
      'cancelled': []
    };

    if (!statusTransitions[order.status]?.includes(status)) {
      return res.status(400).json({ message: "Invalid status transition" });
    }

    // Update timeline
    const timeline = { ...order.timeline };
    switch (status) {
      case 'active':
        timeline.started = new Date();
        break;
      case 'delivered':
        timeline.delivered = new Date();
        break;
      case 'completed':
        timeline.completed = new Date();
        break;
      case 'cancelled':
        timeline.cancelled = new Date();
        break;
    }

    order.status = status;
    order.timeline = timeline;
    await order.save();

    try {
      let title = '';
      let body = '';
      let recipientId = order.buyer.toString();
      let notifType: any = 'order_status';

      if (status === 'active') {
        title = 'Order Started! 🚀';
        body = `The seller has started working on your order.`;
      } else if (status === 'delivered') {
        title = 'Order Delivered! 📦';
        body = `Your order has been delivered. Please review it.`;
        notifType = 'order_delivered';
      } else if (status === 'completed') {
        title = 'Order Completed ✅';
        body = `Your order was marked as completed.`;
        notifType = 'order_completed';
      } else if (status === 'in_revision') {
        title = 'Revision Requested 🔄';
        body = `A revision was requested for your work.`;
        recipientId = order.seller.toString();
      } else if (status === 'cancelled') {
        title = 'Order Cancelled ❌';
        body = `The order has been cancelled.`;
      }

      if (title && status !== 'cancelled') {
        const notification = new Notification({
          type: notifType,
          recipient: recipientId,
          title,
          body,
          link: recipientId === order.buyer.toString() ? '/orders-to-buy' : '/seller-dashboard'
        });
        await notification.save();
        sendNotification(recipientId, notification);
      } else if (status === 'cancelled') {
        const notifBuyer = new Notification({ type: 'order_status', recipient: order.buyer, title, body, link: '/orders-to-buy' });
        await notifBuyer.save();
        sendNotification(order.buyer.toString(), notifBuyer);
        const notifSeller = new Notification({ type: 'order_status', recipient: order.seller, title, body, link: '/seller-dashboard' });
        await notifSeller.save();
        sendNotification(order.seller.toString(), notifSeller);
      }
    } catch (notifErr) {
      console.error('Failed to send status notification:', notifErr);
    }

    await order.populate([
      { path: 'gig', select: 'title images price category seller' },
      { path: 'buyer', select: 'name email pfp' },
      { path: 'seller', select: 'name email pfp' }
    ]);

    if (order.seller._id.toString() === userId?.toString()) {
      (order as any).accessLevel = "seller";
    }

    res.status(200).json({
      message: `Order status updated to ${status}`,
      order: order
    });
  } catch (error) {
    next(error);
  }
};

// Add deliverable to order
export const addDeliverable = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id;
    const description: string = req.body.description || "";
    const links: string[] = req.body.links
      ? (Array.isArray(req.body.links) ? req.body.links : [req.body.links])
      : [];

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    if (!description.trim()) {
      return res.status(400).json({ message: "Delivery message is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only seller can deliver
    if (order.seller.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Only seller can add deliverables" });
    }

    if (!['active', 'in_revision'].includes(order.status)) {
      return res.status(400).json({ message: "Order must be active or in revision to deliver" });
    }

    // Upload any attached files to Cloudinary
    const uploadedUrls: string[] = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const cloudinary = (await import("../lib/cloudinary")).default;
      const streamifier = (await import("streamifier")).default;

      const uploadPromises = (req.files as Express.Multer.File[]).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: "deliverables",
                resource_type: "auto",
                use_filename: true,
                unique_filename: true,
              },
              (err, result) => {
                if (err || !result) return reject(err || new Error("Upload failed"));
                resolve(result.secure_url);
              }
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          })
      );

      const resolved = await Promise.all(uploadPromises);
      uploadedUrls.push(...resolved);
    }

    // Combine uploaded file URLs with external links
    const allLinks = [...uploadedUrls, ...links.filter((l) => l.trim())];

    const deliverable = {
      files: allLinks,
      description,
      deliveredAt: new Date(),
    };

    order.deliverables.push(deliverable);

    // Auto-transition to delivered
    order.status = "delivered";
    order.timeline = { ...order.timeline, delivered: new Date() };

    await order.save();

    // Notify buyer
    try {
      const notification = new Notification({
        type: "order_delivered",
        recipient: order.buyer,
        title: "Order Delivered! 📦",
        body: "Your order has been delivered. Please review it.",
        link: "/orders-to-buy",
      });
      await notification.save();
      sendNotification(order.buyer.toString(), notification);
    } catch (notifErr) {
      console.error("Failed to send delivery notification:", notifErr);
    }

    await order.populate([
      { path: "gig", select: "title images price category seller" },
      { path: "buyer", select: "name email pfp" },
      { path: "seller", select: "name email pfp" },
    ]);

    if (order.seller._id.toString() === userId?.toString()) {
      (order as any).accessLevel = "seller";
    }

    res.status(200).json({
      message: "Work delivered successfully",
      deliverable,
      order,
    });
  } catch (error) {
    next(error);
  }
};

// Request revision
export const requestRevision = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const { description } = req.body;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only buyer can request revisions
    if (order.buyer.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Only buyer can request revisions" });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({ message: "Order must be delivered to request revision" });
    }

    // Check if revisions are available
    const usedRevisions = order.revisionRequests.filter(r => r.status === 'approved').length;
    if (usedRevisions >= order.revisions) {
      return res.status(400).json({ message: "No revisions remaining" });
    }

    const revisionRequest = {
      description,
      requestedAt: new Date(),
      status: 'pending' as const
    };

    order.revisionRequests.push(revisionRequest);
    await order.save();

    res.status(200).json({
      message: "Revision requested successfully",
      revisionRequest
    });
  } catch (error) {
    next(error);
  }
};

// Add message to order conversation
export const addMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const { message, attachments } = req.body;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    /*const order = await Order.findById(orderId);*/
    //By Me
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is involved in this order
    if (order.buyer.toString() !== userId?.toString() &&
      order.seller.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Determine the recipient
    const toUserId = order.buyer.toString() === userId?.toString()
      ? order.seller
      : order.buyer;

    // Create new order message
    const orderMessage = new OrderMessage({
      orderId: orderId,
      from: userId,
      to: toUserId,
      message,
      attachments: attachments || [],
      timestamp: new Date()
    });

    const savedMessage = await orderMessage.save();
    await savedMessage.populate([
      { path: 'from', select: 'name pfp' },
      { path: 'to', select: 'name pfp' }
    ]);

    res.status(200).json({
      message: "Message added successfully",
      data: savedMessage
    });
  } catch (error) {
    next(error);
  }
};

// Add review to completed order
export const addReview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("OOOOOOOOOOOOOOOOOO"); // DEBUG
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only buyer can add reviews
    if (order.buyer.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Only buyer can add reviews" });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({ message: "Order must be completed to add review" });
    }

    if (order.review) {
      return res.status(400).json({ message: "Review already exists" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    order.review = {
      rating,
      comment,
      reviewedAt: new Date()
    };

    await order.save();

    // Update gig rating
    const gig = await Gig.findById(order.gig);
    if (gig) {
      const newCount = gig.rating.count + 1;
      const newAverage = ((gig.rating.average * gig.rating.count) + rating) / newCount;
      gig.rating.average = Math.round(newAverage * 10) / 10; // Round to 1 decimal
      gig.rating.count = newCount;
      await gig.save();
    }

    res.status(200).json({
      message: "Review added successfully",
      review: order.review
    });
  } catch (error) {
    next(error);
  }
};

// Get order messages/conversation
export const getOrderMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("OOOOOOOOOOOOOOOOOO");
  try {
    const { orderId } = req.params;
    const userId = req.user?._id;
    const { page = 1, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is involved in this order
    if (order.buyer.toString() !== userId?.toString() &&
      order.seller.toString() !== userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [messages, totalCount] = await Promise.all([
      OrderMessage.find({ orderId })
        .populate('from', 'name pfp')
        .populate('to', 'name pfp')
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OrderMessage.countDocuments({ orderId })
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      messages,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Cancel order
export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user?._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is involved in this order
    const isSeller = order.seller.toString() === userId?.toString();
    const isBuyer = order.buyer.toString() === userId?.toString();

    if (!isSeller && !isBuyer) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Can only cancel pending or active orders
    if (!['pending', 'active'].includes(order.status)) {
      return res.status(400).json({ message: "Cannot cancel order in current status" });
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.timeline.cancelled = new Date();

    // Update payment status if applicable
    if (order.payment.status === 'paid') {
      order.payment.status = 'refunded';
    }

    await order.save();

    res.status(200).json({
      message: "Order cancelled successfully",
      order
    });
  } catch (error) {
    next(error);
  }
};