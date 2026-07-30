import { authorize } from "./authorize.js";
import type { Role } from "../../config/auth.js";

/**
 * @deprecated Use `authorize()` instead.
 * Kept for backward compatibility.
 */
export function roleMiddleware(...roles: Role[]) {
  return authorize(...roles);
}
