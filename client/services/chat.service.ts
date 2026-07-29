import { api } from "./api";

export const chatService = {
  getMessages: (conversationId: string) =>
    api<unknown[]>(`/chat/messages?conversationId=${conversationId}`),
};
