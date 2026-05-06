import mongoose, { Document, Schema } from "mongoose";

export interface IFeedback extends Document {
  user: mongoose.Types.ObjectId;
  message: string;
  createdAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

const Feedback = mongoose.model<IFeedback>("Feedback", FeedbackSchema);
export default Feedback;
