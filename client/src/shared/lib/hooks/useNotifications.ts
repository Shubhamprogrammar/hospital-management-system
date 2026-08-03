"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";

import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from "@/shared/services/notifications.service";
import { useSocketEvent } from "@/shared/lib/hooks/useSocket";

const NOTIFICATIONS_KEY = ["notifications", "inbox"] as const;

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => listNotifications(1, 10),
  });

  useSocketEvent<NotificationItem>("notifications:new", () => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  });

  useSocketEvent<{ count: number }>("notifications:unread-count-updated", () => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  return {
    notifications: query.data?.items ?? [],
    unread: query.data?.unread ?? 0,
    isLoading: query.isLoading,
    markRead,
    markAllRead,
  };
}
