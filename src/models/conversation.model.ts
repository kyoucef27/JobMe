import { Schema, model, models, Document } from "mongoose";

export interface IConversation extends Document {
  user1Id: string;        // first participant
  user2Id: string;        // second participant
  initiatorId: string;    // who opened the chat (buyer context)
  orderId?: string;       // if set, this is an order-scoped conversation
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    user1Id:     { type: String, required: true },
    user2Id:     { type: String, required: true },
    initiatorId: { type: String, required: true },
    orderId:     { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A general conversation (no orderId) must be unique per pair.
// An order conversation is always unique per orderId.
conversationSchema.index(
  { user1Id: 1, user2Id: 1, orderId: 1 },
  { unique: true, sparse: true }
);

export const Conversation =
  models.Conversation || model<IConversation>("Conversation", conversationSchema);
