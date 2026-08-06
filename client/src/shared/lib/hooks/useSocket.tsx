"use client";

import * as React from "react";
import { io, type Socket } from "socket.io-client";

import { env } from "@/shared/config/env";
import { useSession } from "@/shared/lib/auth-client";

const SocketContext = React.createContext<Socket | null>(null);

/**
 * Connects once the session is known, authenticating via the same
 * cookie session every REST call already uses (server/src/core/utils/socket.ts
 * falls back to cookie-based auth when no bearer token is supplied).
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [socket, setSocket] = React.useState<Socket | null>(null);

  React.useEffect(() => {
    if (!session?.user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- socket lifecycle must sync with the session
      setSocket(null);
      return;
    }

    // Same-origin session cookies only work in dev (cookies are host-scoped,
    // not port-scoped). In production the app and API live on different
    // domains, so the session cookie never reaches the socket host — pass the
    // session token as a bearer credential instead; the server's socket auth
    // (server/src/core/utils/socket.ts) prefers it over the cookie.
    const socketOptions: Parameters<typeof io>[1] = {
      withCredentials: true,
      autoConnect: true,
    };
    if (session.session?.token) {
      socketOptions.auth = { token: session.session.token };
    }
    const instance = io(env.SOCKET_URL, socketOptions);

    setSocket(instance);

    return () => {
      instance.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reconnect only when the user id changes
  }, [session?.user?.id]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return React.useContext(SocketContext);
}

/** Subscribes to `event` for the lifetime of the component; re-subscribes if the socket instance changes. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const socket = useSocket();

  // Keep the latest handler in a ref so the subscription stays stable across
  // renders while always invoking the current closure — which captures fresh
  // state like the active conversation id. Without this, an event handler that
  // reads `activeId` (or any other state) would be stuck with the value from
  // the first render after the socket connected.
  const handlerRef = React.useRef(handler);

  // Keep the ref pointing at the latest handler closure after every render so a
  // stable socket listener still sees fresh state (e.g. the active conversation
  // id) — a listener that captured `activeId` from its first render would never
  // invalidate the open thread's query when a new message arrives.
  React.useEffect(() => {
    handlerRef.current = handler;
  });

  React.useEffect(() => {
    if (!socket) return;
    const listener = (...args: unknown[]) => (handlerRef.current as (...a: unknown[]) => void)(...args);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
