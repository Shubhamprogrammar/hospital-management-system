import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { env } from "../config/env";

/**
 * Matches server/src/config/auth.ts's `user.additionalFields` so
 * session.user carries the hospital-specific profile fields, and
 * signUp.email()/etc. accept them with full type safety.
 */
export const authClient = createAuthClient({
  baseURL: env.AUTH_URL,
  plugins: [
    adminClient(),
    inferAdditionalFields({
      user: {
        phone: { type: "string", required: false },
        dateOfBirth: { type: "date", required: false },
        gender: { type: "string", required: false },
        address: { type: "string", required: false },
        bloodGroup: { type: "string", required: false },
      },
    }),
  ],
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
