/**
 * Generates a unique health ID in format HMS-{YY}-{sequence} (FRD 9.4).
 */
export function generateUhid(sequence: number): string {
  const year = new Date().getFullYear() % 100;
  return `HMS-${String(year).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Generates an admission number in format IPD-{YY}-{seq} (FRD 12.4).
 */
export function generateAdmissionNo(sequence: number): string {
  const year = new Date().getFullYear() % 100;
  return `IPD-${String(year).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Generates an OPD token number in format {deptCode}-{seq} (FRD 11.4).
 */
export function generateTokenNumber(deptCode: string, sequence: number): string {
  return `${deptCode}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Generates an invoice number (FRD 21.7).
 */
export function generateInvoiceNo(sequence: number): string {
  const year = new Date().getFullYear() % 100;
  return `INV-${String(year).padStart(2, "0")}-${String(sequence).padStart(5, "0")}`;
}

/** 6-digit OTP (FRD 4.6). */
export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
