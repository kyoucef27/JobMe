import mongoose, { Document, Schema } from "mongoose";

export type InteractionType = "search" | "order" | "save" | "view";

export interface IBuyerInteraction extends Document {
  _id: mongoose.Types.ObjectId;
  buyer: mongoose.Types.ObjectId;
  type: InteractionType;
  query?: string;        // for type = 'search'
  gigId?: mongoose.Types.ObjectId; // for type = 'order' | 'save' | 'view'
  category?: string;    // denormalized from gig
  tags?: string[];      // denormalized from gig or extracted from search query
  weight: number;       // importance multiplier: order=4, save=3, view=1, search=2
  createdAt: Date;
  updatedAt: Date;
}

const buyerInteractionSchema = new Schema<IBuyerInteraction>(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["search", "order", "save", "view"],
      required: true,
    },
    query: {
      type: String,
      maxlength: 200,
    },
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gig",
    },
    category: {
      type: String,
    },
    tags: [{ type: String }],
    weight: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Fast lookups: per buyer ordered by recency
buyerInteractionSchema.index({ buyer: 1, createdAt: -1 });
// TTL index — auto-delete interactions older than 90 days to keep collection lean
buyerInteractionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

export const BuyerInteraction = mongoose.model<IBuyerInteraction>(
  "BuyerInteraction",
  buyerInteractionSchema
);
export default BuyerInteraction;
