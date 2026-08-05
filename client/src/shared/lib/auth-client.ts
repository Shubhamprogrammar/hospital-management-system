import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { env } from "../config/env";

/**
 * Matches server/src/config/auth.ts's `user.additionalFields` so
 * session.user carries the hospital-specific profile fields, and
 * signUp.email()/etc. accept them with full type safety.
 */
export const authClient = createAuthClient({
  // Same-origin auth: better-auth resolves `basePath` against
  // window.location.origin, and next.config.ts rewrites /api/v1/auth/* to the
  // backend — so session cookies stay first-party on the app's own domain.
  // (A relative `baseURL` string is rejected by the client; it must be absolute.)
  basePath: env.AUTH_PATH,
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
