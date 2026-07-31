import { Schema, model } from "mongoose";

/**
 * Patient chat message (FRD 26.10). Retained per medical-record policy;
 * not user-deletable.
 */
export interface IPatientChatMessage {
  conversationId: string;
  senderType: "PATIENT" | "STAFF";
  senderId: string;
  body: string;
  attachments?: { s3Key: string; type: string; size: number }[];
  createdAt: Date;
}

const patientChatMessageSchema = new Schema<IPatientChatMessage>(
  {
    conversationId: { type: String, required: true, index: true },
    senderType: { type: String, enum: ["PATIENT", "STAFF"], required: true },
    senderId: { type: String, required: true },
    body: { type: String, required: true },
    attachments: [
      {
        s3Key: String,
        type: String,
        size: Number,
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

patientChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const PatientChatMessage = model<IPatientChatMessage>("PatientChatMessage", patientChatMessageSchema);
