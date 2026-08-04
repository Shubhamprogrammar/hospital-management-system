import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { PatientChatMessage } from "../../db/mongo/models/patientChatMessage.model.js";
import { emitToRoom } from "../../core/utils/socket.js";

/**
 * Patient starts a conversation — relationship check (BR-01/FR 26.4-01):
 * patient must have appointment history with the chosen doctor, or use the
 * general reception queue (staffId/reception).
 */
export async function startConversation(data: {
  patientId: string;
  patientUserId: string;
  doctorId?: string;
  departmentId?: string;
}) {
  // Resolve the patient from the caller's linked profile when no explicit
  // patientId is supplied (frontend sends only the actor's session).
  const patient = await prisma.patient.findFirst({
    where: data.patientId
      ? { id: data.patientId, deletedAt: null }
      : { userId: data.patientUserId, deletedAt: null },
  });
  if (!patient) throw new AppError("Patient not found", 404, undefined, "NOT_FOUND");

  if (data.doctorId) {
    // Relationship-existence check (FR 26.4-01)
    const hasRelation = await prisma.appointment.findFirst({
      where: {
        patientId: data.patientId,
        doctorId: data.doctorId,
      },
    });
    if (!hasRelation) {
      throw new AppError(
        "You can only chat with doctors you have an appointment history with",
        403,
        undefined,
        "ERR_NO_RELATIONSHIP",
      );
    }
  }

  const existing = await prisma.patientChatConversation.findFirst({
    where: {
      patientId: data.patientId,
      staffId: data.doctorId,
      status: { in: ["OPEN", "ANSWERED"] },
    },
  });
  if (existing) return existing;

  return prisma.patientChatConversation.create({
    data: {
      patientId: data.patientId,
      staffId: data.doctorId,
      departmentId: data.departmentId,
    },
  });
}

export async function listConversations(actor: { id: string; role: string }) {
  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    if (!patient) return [];
    return prisma.patientChatConversation.findMany({
      where: { patientId: patient.id },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  // Staff inbox: assigned conversations or department queue
  if (actor.role === "HOSPITAL_ADMIN" || actor.role === "SUPER_ADMIN") {
    return prisma.patientChatConversation.findMany({
      where: { status: { in: ["OPEN", "ANSWERED"] } },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  return prisma.patientChatConversation.findMany({
    where: {
      staffId: actor.id,
      status: { in: ["OPEN", "ANSWERED"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });
}

export async function getMessages(conversationId: string, actor: { id: string; role: string }) {
  const conversation = await prisma.patientChatConversation.findUnique({
    where: { id: conversationId },
    include: { patient: true },
  });
  if (!conversation) throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");

  // Authorization: patient can only read own; staff only assigned/admin
  if (actor.role === "PATIENT") {
    if (conversation.patient.userId !== actor.id) {
      throw new AppError("You cannot access this conversation", 403, undefined, "FORBIDDEN");
    }
  } else if (conversation.staffId && conversation.staffId !== actor.id && actor.role !== "HOSPITAL_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("You cannot access this conversation", 403, undefined, "FORBIDDEN");
  }

  const messages = await PatientChatMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();
  return messages;
}

export async function sendMessage(
  conversationId: string,
  data: { senderId: string; senderRole: "PATIENT" | "STAFF"; body: string },
) {
  const conversation = await prisma.patientChatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");
  if (conversation.status === "CLOSED") {
    throw new AppError("Conversation is closed", 409, undefined, "ERR_CONVERSATION_CLOSED");
  }

  const message = await PatientChatMessage.create({
    conversationId,
    senderType: data.senderRole,
    senderId: data.senderId,
    body: data.body,
  });

  await prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      // CLOSED already throws above, so a patient reply re-opens the thread
      status: data.senderRole === "STAFF" ? "ANSWERED" : "OPEN",
    },
  });

  emitToRoom(`conversation:${conversationId}`, "patient-chat:message-new", message);
  return message;
}

/** Escalate to appointment or ambulance (FR 26.4-04). */
export async function escalateConversation(
  conversationId: string,
  data: { escalateTo: "APPOINTMENT" | "AMBULANCE"; details?: Record<string, unknown> },
) {
  const conversation = await prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: { status: "ESCALATED" },
  });
  return { conversation, escalateTo: data.escalateTo, details: data.details };
}

export async function closeConversation(conversationId: string) {
  return prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: { status: "CLOSED" },
  });
}
