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
  // Trim get-session polling: the proxy re-validates the session on every
  // navigation, so don't also hammer `/get-session` on every window-focus
  // event (better-auth's default). refetchInterval stays 0 (no timer polling).
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
