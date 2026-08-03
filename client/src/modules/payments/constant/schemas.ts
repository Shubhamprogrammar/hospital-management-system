import { z } from "zod";

export const paymentSchema = z.object({
  billId: z.string().min(1, "Select a bill"),
  amount: z.string().min(1, "Amount required"),
  mode: z.enum(["CASH", "CARD", "UPI", "NET_BANKING", "INSURANCE", "WALLET"]),
});

export type PaymentValues = z.infer<typeof paymentSchema>;

export const PAYMENT_MODES = [
  "CASH",
  "CARD",
  "UPI",
  "NET_BANKING",
  "INSURANCE",
  "WALLET",
] as const;
