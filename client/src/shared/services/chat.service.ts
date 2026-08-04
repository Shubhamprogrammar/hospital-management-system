import { api } from "@/shared/services/api";
import type {
  ChatbotSession,
  ChatConversation,
  ChatMessage,
  PatientChatConversation,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Staff chat ----------

export function createConversation(input: { type?: "DIRECT" | "GROUP"; title?: string; participantIds: string[]; linkedEntityType?: string; linkedEntityId?: string }) {
  return api.post<ChatConversation>("/chat/conversations", input);
}

export function listConversations(params: PaginationParams & { search?: string } = {}) {
  return api.list<ChatConversation>("/chat/conversations", params);
}

export function getChatMessages(conversationId: string, query: PaginationParams = {}) {
  return api.list<ChatMessage>(`/chat/conversations/${conversationId}/messages`, query);
}

export function sendChatMessage(conversationId: string, input: { content: string }) {
  return api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, input);
}

export function editChatMessage(messageId: string, input: { content: string }) {
  return api.patch<ChatMessage>(`/chat/messages/${messageId}`, input);
}

export function markConversationRead(conversationId: string) {
  return api.post<{ read: boolean }>(`/chat/conversations/${conversationId}/read`);
}

// ---------- Patient chat ----------

export function startPatientConversation(input: { departmentId?: string }) {
  return api.post<PatientChatConversation>("/patient-chat/conversations", input);
}

export function listPatientConversations(params: PaginationParams & { status?: string } = {}) {
  return api.list<PatientChatConversation>("/patient-chat/conversations", params);
}

export function getPatientChatMessages(conversationId: string, query: PaginationParams = {}) {
  return api.list<ChatMessage>(`/patient-chat/conversations/${conversationId}/messages`, query);
}

export function sendPatientChatMessage(conversationId: string, input: { body: string }) {
  return api.post<ChatMessage>(`/patient-chat/conversations/${conversationId}/messages`, input);
}

export function escalatePatientConversation(
  conversationId: string,
  input?: { escalateTo?: "APPOINTMENT" | "AMBULANCE"; details?: Record<string, unknown> },
) {
  return api.post<PatientChatConversation>(`/patient-chat/conversations/${conversationId}/escalate`, input);
}

export function closePatientConversation(conversationId: string) {
  return api.post<PatientChatConversation>(`/patient-chat/conversations/${conversationId}/close`);
}

// ---------- Chatbot ----------

export function startChatbotSession() {
  return api.post<ChatbotSession>("/chatbot/conversations");
}

export interface ChatbotReply {
  reply: string;
  guardrailTriggered: boolean;
  messageIds: { user: string; assistant: string };
}

export function sendChatbotMessage(sessionId: string, input: { content: string }) {
  return api.post<ChatbotReply>(`/chatbot/conversations/${sessionId}/messages`, input);
}

export function getChatbotHistory(sessionId: string) {
  return api.get<{ session: ChatbotSession; messages: Array<{ _id: string; sessionId: string; role: "USER" | "ASSISTANT"; content: string; createdAt: string }> }>(
    `/chatbot/conversations/${sessionId}`,
  );
}

export function sendChatbotFeedback(sessionId: string, input: { rating: "UP" | "DOWN"; comment?: string }) {
  return api.post<{ submitted: boolean }>(`/chatbot/conversations/${sessionId}/feedback`, input);
}
