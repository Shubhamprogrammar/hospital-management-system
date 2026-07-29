import { Schema, model } from "mongoose";

const conversationSchema = new Schema(
  {
    participants: [{ type: String, required: true }],
  },
  { timestamps: true }
);

export const Conversation = model("Conversation", conversationSchema);
