import { Schema, model } from "mongoose";

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

export const Message = model("Message", messageSchema);
