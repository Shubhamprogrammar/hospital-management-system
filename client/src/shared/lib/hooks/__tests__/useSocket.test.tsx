import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SocketProvider, useSocket, useSocketEvent } from "@/shared/lib/hooks/useSocket";

// --- Mocks -----------------------------------------------------------------
const ioMock = vi.fn();
const useSessionMock = vi.fn();

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => ioMock(...args),
}));

vi.mock("@/shared/lib/auth-client", () => ({
  useSession: () => useSessionMock(),
}));

/** Minimal fake socket capturing on/off handlers and tracking lifecycle calls. */
function createFakeSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
      return fakeSocket;
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(cb);
      return fakeSocket;
    }),
    disconnect: vi.fn(),
    emit: vi.fn(),
    /** Test helper: emit an event to every subscribed handler. */
    _emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.forEach((cb) => cb(...args));
    },
  };
}
type FakeSocket = ReturnType<typeof createFakeSocket>;
let fakeSocket: FakeSocket;

const sessionUser = { id: "u1", name: "Test Admin", email: "admin@hospital.com" };

function wrapper({ children }: { children: ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}

describe("SocketProvider / useSocket", () => {
  beforeEach(() => {
    ioMock.mockReset();
    useSessionMock.mockReset();
    fakeSocket = createFakeSocket();
  });

  it("connects to the socket URL when a session user exists", async () => {
    useSessionMock.mockReturnValue({ data: { user: sessionUser } });
    ioMock.mockReturnValue(fakeSocket);

    const { result } = renderHook(() => useSocket(), { wrapper });

    await waitFor(() => expect(ioMock).toHaveBeenCalled());
    expect(ioMock).toHaveBeenCalledWith("http://test.local", {
      withCredentials: true,
      autoConnect: true,
    });
    expect(result.current).toBe(fakeSocket);
  });

  it("provides a null socket when there is no session user", () => {
    useSessionMock.mockReturnValue({ data: { user: null } });

    const { result } = renderHook(() => useSocket(), { wrapper });

    expect(ioMock).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("disconnects the socket on unmount", async () => {
    useSessionMock.mockReturnValue({ data: { user: sessionUser } });
    ioMock.mockReturnValue(fakeSocket);

    const { unmount } = renderHook(() => useSocket(), { wrapper });
    await waitFor(() => expect(ioMock).toHaveBeenCalled());

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("reconnects when the session user id changes", async () => {
    useSessionMock.mockReturnValue({ data: { user: sessionUser } });
    ioMock.mockReturnValueOnce(fakeSocket).mockReturnValueOnce(createFakeSocket());

    const { rerender } = renderHook(() => useSocket(), { wrapper });
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1));

    useSessionMock.mockReturnValue({ data: { user: { ...sessionUser, id: "u2" } } });
    rerender();

    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(2));
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("useSocketEvent", () => {
  beforeEach(() => {
    ioMock.mockReset();
    useSessionMock.mockReset();
    fakeSocket = createFakeSocket();
  });

  it("subscribes to the event and fires the handler with the payload", async () => {
    useSessionMock.mockReturnValue({ data: { user: sessionUser } });
    ioMock.mockReturnValue(fakeSocket);
    const handler = vi.fn();

    renderHook(() => useSocketEvent<{ conversationId: string }>("chat:message:new", handler), { wrapper });

    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith("chat:message:new", expect.any(Function)),
    );

    act(() => fakeSocket._emit("chat:message:new", { conversationId: "c1" }));

    expect(handler).toHaveBeenCalledWith({ conversationId: "c1" });
  });

  it("unsubscribes from the event on unmount", async () => {
    useSessionMock.mockReturnValue({ data: { user: sessionUser } });
    ioMock.mockReturnValue(fakeSocket);
    const handler = vi.fn();

    const { unmount } = renderHook(() => useSocketEvent("notifications:new", handler), { wrapper });

    await waitFor(() =>
      expect(fakeSocket.on).toHaveBeenCalledWith("notifications:new", expect.any(Function)),
    );

    unmount();

    expect(fakeSocket.off).toHaveBeenCalledWith("notifications:new", expect.any(Function));
  });
});
