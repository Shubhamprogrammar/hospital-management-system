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

    const instance = io(env.SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
    });

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

  React.useEffect(() => {
    if (!socket) return;
    socket.on(event, handler as (...args: unknown[]) => void);
    return () => {
      socket.off(event, handler as (...args: unknown[]) => void);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, event]);
}
