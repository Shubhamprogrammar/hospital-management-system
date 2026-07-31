import { Schema, model } from "mongoose";

/**
 * Chatbot message — LLM conversational turns (FRD 27.10).
 */
export interface IChatbotMessage {
  sessionId: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolCalls?: unknown[];
  toolResults?: unknown[];
  createdAt: Date;
}

const chatbotMessageSchema = new Schema<IChatbotMessage>(
  {
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ["USER", "ASSISTANT", "TOOL"], required: true },
    content: { type: String, required: true },
    toolCalls: [Schema.Types.Mixed],
    toolResults: [Schema.Types.Mixed],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

chatbotMessageSchema.index({ sessionId: 1, createdAt: 1 });

export const ChatbotMessage = model<IChatbotMessage>("ChatbotMessage", chatbotMessageSchema);
