import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

type EngagementNudgeParams = {
  userId: string;
  nudgeKey: string;
  cooldownMs: number;
  title: string;
  message: string;
  page?: string;
  type?: string;
};

const STORAGE_PREFIX = 'farmolink_engagement_nudges_';

const readNudges = (userId: string): Record<string, number> => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
};

const writeNudges = (userId: string, values: Record<string, number>) => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(values));
  } catch {
    // Ignora falhas de storage em ambientes restritos.
  }
};

const canDispatchNudge = (userId: string, nudgeKey: string, cooldownMs: number): boolean => {
  const now = Date.now();
  const values = readNudges(userId);
  const lastSent = Number(values[nudgeKey] || 0);
  if (!lastSent) return true;
  return now - lastSent >= Math.max(0, cooldownMs);
};

const markNudgeSent = (userId: string, nudgeKey: string) => {
  const values = readNudges(userId);
  values[nudgeKey] = Date.now();
  writeNudges(userId, values);
};

const sendLocalMarketingNotification = async (
  title: string,
  message: string,
  data: Record<string, string> = {}
): Promise<boolean> => {
  if (!title.trim() || !message.trim()) return false;

  try {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483000),
            title: title.trim(),
            body: message.trim(),
            schedule: { at: new Date(Date.now() + 350) },
            channelId: 'farmolink-marketing',
            extra: data
          }
        ]
      });
      return true;
    }
  } catch {
    // Continua para fallback web.
  }

  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title.trim(), { body: message.trim() });
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(title.trim(), { body: message.trim() });
          return true;
        }
      }
    }
  } catch {
    // Sem suporte de notificacao web.
  }

  return false;
};

export const dispatchMarketingNudge = async (params: EngagementNudgeParams): Promise<boolean> => {
  const {
    userId,
    nudgeKey,
    cooldownMs,
    title,
    message,
    page = 'home',
    type = 'MARKETING',
  } = params;

  if (!userId || !nudgeKey) return false;
  if (!canDispatchNudge(userId, nudgeKey, cooldownMs)) return false;

  const sent = await sendLocalMarketingNotification(title, message, {
    type,
    page
  });

  if (sent) {
    markNudgeSent(userId, nudgeKey);
  }

  return sent;
};

