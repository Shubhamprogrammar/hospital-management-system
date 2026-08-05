import { api } from "@/shared/services/api";
import type { User } from "@/shared/types";
import type {
  ChatbotSession,
  ChatConversation,
  ChatMessage,
  PatientChatConversation,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Staff chat ----------

export interface CreateConversationResult {
  conversation: ChatConversation;
  /** True when an existing thread with the same member set was resumed. */
  reused: boolean;
}

export function createConversation(input: { type?: "DIRECT" | "GROUP"; title?: string; participantIds: string[]; linkedEntityType?: string; linkedEntityId?: string }) {
  return api.post<CreateConversationResult>("/chat/conversations", input);
}

export function listConversations(params: PaginationParams & { search?: string } = {}) {
  return api.list<ChatConversation>("/chat/conversations", params);
}

/** Renames a group conversation (participant-only; GROUP type enforced server-side). */
export function updateConversationTitle(conversationId: string, input: { title: string }) {
  return api.patch<ChatConversation>(`/chat/conversations/${conversationId}`, input);
}

/** Adds staff members to a group conversation (any member can add). */
export function addConversationMembers(conversationId: string, input: { userIds: string[] }) {
  return api.post<ChatConversation>(`/chat/conversations/${conversationId}/members`, input);
}

/** Leaves a group conversation; the group is deleted if the last member leaves. */
export function leaveConversation(conversationId: string) {
  return api.post<{ left: boolean; deleted: boolean }>(`/chat/conversations/${conversationId}/leave`);
}

/** Deletes a group conversation for everyone (any member can delete). */
export function deleteConversation(conversationId: string) {
  return api.delete<{ deleted: boolean }>(`/chat/conversations/${conversationId}`);
}

/**
 * Whether the exact member set (current user + `participantIds`) already has a
 * thread — lets the picker hint that starting will resume an existing chat.
 */
export function lookupConversation(participantIds: string[]) {
  return api.get<{ conversation: ChatConversation | null; reused: boolean }>(
    "/chat/conversations/lookup",
    { participants: [...participantIds].sort().join(",") },
  );
}

export interface ConversationThreadStatus {
  userId: string;
  hasExistingThread: boolean;
}

/** Per-user 1:1 thread status with the current user — powers the picker badge. */
export function conversationThreadStatus(userIds: string[]) {
  return api.list<ConversationThreadStatus>("/chat/thread-status", {
    ids: [...userIds].sort().join(","),
  });
}

export function getChatMessages(conversationId: string, query: PaginationParams = {}) {
  return api.list<ChatMessage>(`/chat/conversations/${conversationId}/messages`, query);
}

/** Staff users for the "New conversation" picker — supports name/email autocomplete + role filter. */
export function listChatUsers(params: PaginationParams & { search?: string; role?: string } = {}) {
  return api.list<User>("/chat/users", params);
}

// The backend reads `body` (not `content`) for staff chat messages.
export function sendChatMessage(conversationId: string, input: { content: string }) {
  return api.post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, { body: input.content });
}

export function editChatMessage(messageId: string, input: { content: string }) {
  return api.patch<ChatMessage>(`/chat/messages/${messageId}`, { body: input.content });
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
