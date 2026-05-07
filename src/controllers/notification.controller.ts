import { Request, Response } from 'express';
import { Notification } from '../models/notification.model';
import mongoose from 'mongoose';
import { getSocketIO, getConnectedUsers } from '../lib/socket';

export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Fetch notifications directed to the user, or global announcements
    const notifications = await Notification.find({
      $or: [
        { recipient: userId },
        { recipient: null } // Global announcements
      ]
    })
    .sort({ createdAt: -1 })
    .limit(30) // limit to recent 30
    .exec();

    return res.status(200).json(notifications);
  } catch (error) {
    console.error('Error in getMyNotifications:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Mark user's notifications as read
    // Note: Global announcements are shared, so we can't just mark them as 'read: true' for everyone 
    // simply by updating the document. If we wanted per-user read state for global announcements, 
    // we'd need a separate 'readBy' array on the announcement, or create individual notifications per user.
    // Since this is a simple system, we'll only update the ones directed to the specific user.
    await Notification.updateMany(
      { recipient: userId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ message: 'Marked all as read' });
  } catch (error) {
    console.error('Error in markAllRead:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const markOneRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      // Might be a global announcement, or doesn't belong to user
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.status(200).json(notification);
  } catch (error) {
    console.error('Error in markOneRead:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin only
export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, body, link } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required' });
    }

    const announcement = new Notification({
      type: 'announcement',
      recipient: null, // Global
      title,
      body,
      link
    });

    await announcement.save();

    // Push via socket to all connected users
    const io = getSocketIO();
    io.emit('notification', announcement);

    return res.status(201).json({ message: 'Announcement created', announcement });
  } catch (error) {
    console.error('Error in createAnnouncement:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
