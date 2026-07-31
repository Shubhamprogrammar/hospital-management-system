import { Schema, model } from "mongoose";

/**
 * Internal staff chat message (FRD 25.10).
 * Stored in Mongo for high write volume; conversation metadata lives in Postgres.
 */
export interface IChatMessage {
  conversationId: string;
  senderId: string;
  body: string;
  attachments?: { s3Key: string; type: string; size: number }[];
  status: "SENT" | "DELIVERED" | "READ";
  editedAt?: Date;
  deletedForEveryoneAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IChatMessage>(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true, index: true },
    body: { type: String, required: true },
    attachments: [
      {
        s3Key: String,
        type: String,
        size: Number,
      },
    ],
    status: { type: String, enum: ["SENT", "DELIVERED", "READ"], default: "SENT" },
    editedAt: Date,
    deletedForEveryoneAt: Date,
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = model<IChatMessage>("Message", messageSchema);
