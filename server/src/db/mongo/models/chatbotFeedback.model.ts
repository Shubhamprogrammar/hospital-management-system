import { Schema, model } from "mongoose";

/**
 * Chatbot feedback — thumbs up/down on a response (FRD 27.10).
 */
export interface IChatbotFeedback {
  sessionId: string;
  messageId: string;
  rating: "UP" | "DOWN";
  comment?: string;
  createdAt: Date;
}

const chatbotFeedbackSchema = new Schema<IChatbotFeedback>(
  {
    sessionId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    rating: { type: String, enum: ["UP", "DOWN"], required: true },
    comment: String,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const ChatbotFeedback = model<IChatbotFeedback>("ChatbotFeedback", chatbotFeedbackSchema);
