import { Message } from "./models/message.model.js";

export async function getMessagesByConversation(conversationId: string) {
  return Message.find({ conversationId }).sort({ createdAt: 1 });
}
