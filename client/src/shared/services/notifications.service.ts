import { api } from "@/shared/services/api";
import type { NotificationPreference, NotificationTemplate } from "@/shared/types/domain";

export interface NotificationItem {
  id: string;
  userId: string;
  templateKey: string;
  channel: "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  payload: Record<string, unknown> | null;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "READ";
  createdAt: string;
  readAt: string | null;
}

export async function listNotifications(page = 1, limit = 10) {
  const { data, pagination, unread } = await api.raw<NotificationItem[]>("/notifications", {
    method: "GET",
    query: { page, limit },
  });
  return { items: data, pagination, unread: unread ?? 0 };
}

export function markNotificationRead(id: string) {
  return api.patch<NotificationItem>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.patch<{ updated: number }>("/notifications/read-all");
}

// ---------- Preferences & templates ----------

export function getNotificationPreferences() {
  return api.get<NotificationPreference[]>("/notifications/preferences");
}

export function updateNotificationPreferences(input: Array<Pick<NotificationPreference, "category" | "channel" | "isEnabled">>) {
  return api.patch<NotificationPreference[]>("/notifications/preferences", input);
}

export function listNotificationTemplates() {
  return api.get<NotificationTemplate[]>("/notifications/templates");
}

export function createNotificationTemplate(input: { key: string; channel: string; subject?: string; bodyTemplate: string; isCritical?: boolean }) {
  return api.post<NotificationTemplate>("/notifications/templates", input);
}
