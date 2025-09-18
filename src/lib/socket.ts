import { Server } from "socket.io";
import { Server as HTTPServer } from "http";

let io: Server;
const connectedUsers = new Map<string, string>(); // Map<userId, socketId>

export const initializeSocket = (server: HTTPServer) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:5500", // Live Server default port
        "http://127.0.0.1:5500", // Live Server alternative
        "http://localhost:8080", // Alternative port
        "http://127.0.0.1:3000"
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Get userId from query parameters
    const userId = socket.handshake.query.userId as string;

    if (userId) {
      // Store the mapping of userId to socketId
      connectedUsers.set(userId, socket.id);
      console.log(`User ${userId} connected with socket ${socket.id}`);
      
      // Join a room with their userId for easier targeting
      socket.join(userId);
      
      // Notify about online status (optional)
      socket.broadcast.emit("userOnline", userId);
    }

    // Handle user manually joining a room (optional)
    socket.on("joinRoom", (roomId: string) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);
    });

    // Handle marking messages as read (optional)
    socket.on("markAsRead", ({ messageId, userId }) => {
      // You can implement message read status update here
      socket.broadcast.emit("messageRead", { messageId, userId });
    });

    // Handle typing indicators (optional)
    socket.on("typing", ({ to, from }) => {
      const receiverSocketId = connectedUsers.get(to);
      if (receiverSocketId) {
        socket.to(receiverSocketId).emit("userTyping", { from });
      }
    });

    socket.on("stopTyping", ({ to, from }) => {
      const receiverSocketId = connectedUsers.get(to);
      if (receiverSocketId) {
        socket.to(receiverSocketId).emit("userStoppedTyping", { from });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      
      // Remove user from connected users map
      let disconnectedUserId: string | null = null;
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          disconnectedUserId = userId;
          break;
        }
      }

      if (disconnectedUserId) {
        console.log(`User ${disconnectedUserId} disconnected`);
        // Notify about offline status (optional)
        socket.broadcast.emit("userOffline", disconnectedUserId);
      }
    });
  });

  return io;
};

export const getSocketIO = (): Server => {
  if (!io) {
    throw new Error("Socket.IO not initialized! Call initializeSocket first.");
  }
  return io;
};

export const getConnectedUsers = (): Map<string, string> => {
  return connectedUsers;
};

export const isUserOnline = (userId: string): boolean => {
  return connectedUsers.has(userId);
};

export const getOnlineUsers = (): string[] => {
  return Array.from(connectedUsers.keys());
};
