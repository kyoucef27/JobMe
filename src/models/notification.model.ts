import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  type: 'order_placed' | 'order_status' | 'order_delivered' | 'order_completed' | 'announcement';
  recipient: mongoose.Types.ObjectId | null; // null means global announcement
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
  type: {
    type: String,
    enum: ['order_placed', 'order_status', 'order_delivered', 'order_completed', 'announcement'],
    required: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  title: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  link: {
    type: String
  },
  read: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for efficient querying of unread notifications by user, and global announcements
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
