import { Schema, model, Document } from "mongoose";

interface IMessage extends Document {
  _id: Schema.Types.Mixed ;
  from: string; 
  to: string; 
  content: string;  
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AIMessage = model<IMessage>("Message", messageSchema);
