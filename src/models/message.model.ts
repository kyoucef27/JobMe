import { Schema, model, models, Document } from "mongoose";

export type MessageType = "text" | "custom_offer";

export interface ICustomOffer {
  title: string;
  description: string;
  price: number;
  deliveryTime: number;   // days
  revisions: number;
  status: "pending" | "accepted" | "rejected" | "expired";
}

export interface IMessage extends Document {
  from: string;
  to: string;
  content: string;
  type: MessageType;
  offer?: ICustomOffer;
  createdAt: Date;
  read: boolean;
}

const messageSchema = new Schema<IMessage>(
  {
    from:    { type: String, required: true },
    to:      { type: String, required: true },
    content: { type: String, required: true },
    type:    { type: String, enum: ["text", "custom_offer"], default: "text" },
    read:    { type: Boolean, default: false },
    offer: {
      title:        { type: String },
      description:  { type: String },
      price:        { type: Number },
      deliveryTime: { type: Number },
      revisions:    { type: Number },
      status:       { type: String, enum: ["pending", "accepted", "rejected", "expired"], default: "pending" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Message =
  models.Message || model<IMessage>("Message", messageSchema);
