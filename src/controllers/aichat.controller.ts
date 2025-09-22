import { Request, Response, NextFunction } from "express";
import { AIMessage } from "../models/aimessage.model";
import { getSocketIO, getConnectedUsers } from "../lib/socket";
import { AICHATBOT } from "../services/ai.services";
export const sendMessageAI = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { from, to, content } = req.body;

    // Validate required fields
    if (!from || !to || !content) {
      return res.status(400).json({
        error: "Missing required fields: from, to, content"
      });
    }
      
    // Create and save the message
    const message = new AIMessage({
      from,
      to,
      content
    });

    const savedMessage = await message.save();

    // Get Socket.IO instance and connected users
    const io = getSocketIO();
    const connectedUsers = getConnectedUsers();
    const AIRESPONSE=AICHATBOT(savedMessage.content)

    const aiMessage = new AIMessage({
      from:savedMessage.to,
      to:savedMessage.from,
      content:AIRESPONSE
    });

    // Check if the receiver is connected
    const receiverSocketId = connectedUsers.get(savedMessage.from);

    if (receiverSocketId) {
      // Emit message to the specific receiver
      io.to(receiverSocketId).emit("newMessage", {
        _id: aiMessage._id,
        from: aiMessage.from,
        to: aiMessage.to,
        content: aiMessage.content,
        createdAt: aiMessage.createdAt,
      });
    }
    

    // Return success response
    res.status(201).json({
      message: "Message sent successfully",
      data: {
        _id: savedMessage._id,
        from: savedMessage.from,
        to: savedMessage.to,
        content: savedMessage.content,
        aireply: aiMessage.content,
        createdAt: savedMessage.createdAt,
      }
    });

  } catch (error) {
    console.error("Error sending message:", error);
    next(error);
  }
};

export const getMessagesAI = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId1, userId2 } = req.query;

    if (!userId1 || !userId2) {
      return res.status(400).json({
        error: "Missing required query parameters: userId1, userId2"
      });
    }

    // Get messages between two users
    const messages = await AIMessage.find({
      $or: [
        { from: userId1, to: userId2 },
        { from: userId2, to: userId1 }
      ]
    }).sort({ createdAt: 1 });

    res.status(200).json({
      messages
    });

  } catch (error) {
    console.error("Error fetching messages:", error);
    next(error);
  }
};
