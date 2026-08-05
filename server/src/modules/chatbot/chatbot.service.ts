import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { ChatbotMessage } from "../../db/mongo/models/chatbotMessage.model.js";
import { ChatbotFeedback } from "../../db/mongo/models/chatbotFeedback.model.js";

/**
 * Red-flag symptom keywords — deterministic safety guardrail (FRD 27.5 BR-02).
 * Bypasses the LLM entirely for that turn.
 */
const RED_FLAG_KEYWORDS = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "shortness of breath",
  "unconscious",
  "severe bleeding",
  "suicidal",
  "stroke",
  "paralysis",
  "seizure",
];

const EMERGENCY_RESPONSE =
  "⚠️ Your symptoms may indicate a medical emergency. Please call your local emergency number (e.g., 911/108) immediately or go to the nearest emergency department. This is a chatbot and cannot provide emergency medical care.";

export async function startSession(userId: string, userType: "PATIENT" | "STAFF") {
  return prisma.chatbotSession.create({
    data: { userId, userType },
  });
}

export async function sendUserMessage(
  sessionId: string,
  data: { userId: string; userRole: "PATIENT" | "STAFF"; message: string },
) {
  const session = await prisma.chatbotSession.findFirst({
    where: { id: sessionId, userId: data.userId },
  });
  if (!session) throw new AppError("Session not found", 404, undefined, "NOT_FOUND");
  if (session.status === "ENDED") {
    throw new AppError("Session has ended — start a new conversation", 409, undefined, "CONFLICT");
  }

  if (!data.message || data.message.length > 2000) {
    throw new AppError("Message must be 1–2000 characters", 400, undefined, "VALIDATION_ERROR");
  }

  // Persist user turn
  const userMessage = await ChatbotMessage.create({
    sessionId,
    role: "USER",
    content: data.message,
  });

  // Deterministic red-flag guardrail (FR 27.5 BR-02)
  const lower = data.message.toLowerCase();
  const redFlag = RED_FLAG_KEYWORDS.find((k) => lower.includes(k));

  if (redFlag) {
    const assistantMessage = await ChatbotMessage.create({
      sessionId,
      role: "ASSISTANT",
      content: EMERGENCY_RESPONSE,
    });
    return {
      reply: EMERGENCY_RESPONSE,
      guardrailTriggered: true,
      messageIds: { user: userMessage._id, assistant: assistantMessage._id },
    };
  }

  // LLM integration point — deterministic fallback assistant
  const reply = await generateReply(data.message, data.userRole);

  const assistantMessage = await ChatbotMessage.create({
    sessionId,
    role: "ASSISTANT",
    content: reply,
  });

  return {
    reply,
    guardrailTriggered: false,
    messageIds: { user: userMessage._id, assistant: assistantMessage._id },
  };
}

export async function getSessionHistory(sessionId: string, userId: string) {
  const session = await prisma.chatbotSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) throw new AppError("Session not found", 404, undefined, "NOT_FOUND");

  const messages = await ChatbotMessage.find({ sessionId })
    .sort({ createdAt: 1 })
    .lean();
  return { session, messages };
}

export async function submitFeedback(
  sessionId: string,
  data: { messageId: string; rating: "UP" | "DOWN"; comment?: string; userId: string },
) {
  const session = await prisma.chatbotSession.findFirst({
    where: { id: sessionId, userId: data.userId },
  });
  if (!session) throw new AppError("Session not found", 404, undefined, "NOT_FOUND");

  return ChatbotFeedback.create({
    sessionId,
    messageId: data.messageId,
    rating: data.rating,
    comment: data.comment,
  });
}

/**
 * Role-scoped assistant reply (FR 27.4). Deterministic fallback that
 * mirrors the LLM contract; swap with a streaming provider call.
 */
async function generateReply(message: string, userRole: "PATIENT" | "STAFF"): Promise<string> {
  const lower = message.toLowerCase();

  if (userRole === "PATIENT") {
    if (lower.includes("appointment") || lower.includes("book")) {
      return "I can help you book an appointment. You can book via the Appointments page, or I can check doctor availability — just tell me the department or doctor you'd like to see. Note: I can only help guide you; final booking requires your confirmation.";
    }
    if (lower.includes("report") || lower.includes("lab")) {
      return "Your lab reports are available in the Reports section of your patient portal once released by the laboratory. If a report shows as 'pending', it is still awaiting verification.";
    }
    return "I'm your hospital assistant. I can help with appointment bookings, FAQs, and general guidance. For medical advice, please consult a doctor — and for emergencies, call emergency services immediately.";
  }

  // Staff bot: internal knowledge base (RAG point)
  if (lower.includes("opd") || lower.includes("queue")) {
    return "OPD queue guidance: patients check in at reception, tokens are issued per department, vitals are recorded before consultation. Live queue is available on the OPD dashboard.";
  }
  if (lower.includes("policy") || lower.includes("sop")) {
    return "Internal policies are available in the knowledge base. For role-specific SOPs, refer to your department handbook.";
  }
  return "Staff assistant ready. I can help with documentation lookup and quick clinical references. What do you need?";
}
