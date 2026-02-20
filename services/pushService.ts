import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { upsertPushToken, deactivatePushToken } from './dataService';
import { playSound, triggerHapticFeedback } from './soundService';

type NavigateFn = (page: string) => void;

let initializedForUserId: string | null = null;
let currentToken: string | null = null;
let removeListeners: (() => Promise<void>) | null = null;

const isNativePlatform = (): boolean => {
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

const resolveTargetPageFromPush = (notification: any): string | null => {
    const data = (notification?.data || {}) as Record<string, any>;
    const page = data.page || data.route || data.target_page;
    return typeof page === 'string' && page.trim() ? page : null;
};

export const initializePushNotifications = async (userId: string, onNavigate?: NavigateFn): Promise<void> => {
    if (!userId || !isNativePlatform()) return;
    if (initializedForUserId === userId) return;

    if (removeListeners) {
        await removeListeners();
        removeListeners = null;
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.createChannel({
        id: 'farmolink-important',
        name: 'FarmoLink Importantes',
        description: 'Alertas importantes de pedidos, suporte e sistema',
        importance: 5,
        sound: 'default',
        visibility: 1
    }).catch(() => undefined);

    await PushNotifications.register();

    try {
        await LocalNotifications.requestPermissions();
        await LocalNotifications.createChannel({
            id: 'farmolink-important',
            name: 'FarmoLink Importantes',
            description: 'Alertas importantes de pedidos, suporte e sistema',
            importance: 5,
            sound: 'default',
            visibility: 1
        });

        await LocalNotifications.addListener('localNotificationActionPerformed', (event: any) => {
            const targetPage = resolveTargetPageFromPush(event?.notification?.extra || event?.notification?.data);
            if (targetPage && onNavigate) onNavigate(targetPage);
        });
    } catch {
        // Sem local notifications, push nativo continua funcionando.
    }

    await PushNotifications.addListener('registration', async (token: Token) => {
        currentToken = token.value;
        await upsertPushToken(userId, token.value, 'android');
    });

    await PushNotifications.addListener('registrationError', (error: any) => {
        console.warn('Push registration error:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
        playSound('notification');
        triggerHapticFeedback([16, 40, 16]);

        // Em foreground, cria notificacao local para aparecer na barra.
        try {
            const when = Date.now() + 350;
            const title = notification?.title || 'FarmoLink';
            const body = notification?.body || notification?.data?.message || 'Nova atualizacao';

            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: Math.floor(Date.now() % 2147483000),
                        title,
                        body,
                        schedule: { at: new Date(when) },
                        channelId: 'farmolink-important',
                        extra: notification?.data || {}
                    }
                ]
            });
        } catch {
            // Ignora se local notification estiver indisponivel.
        }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
        playSound('click');
        triggerHapticFeedback(12);

        const targetPage = resolveTargetPageFromPush(action.notification);
        if (targetPage && onNavigate) onNavigate(targetPage);
    });

    removeListeners = async () => {
        await PushNotifications.removeAllListeners().catch(() => undefined);
        await LocalNotifications.removeAllListeners().catch(() => undefined);
    };

    initializedForUserId = userId;
};

export const teardownPushNotifications = async (): Promise<void> => {
    if (removeListeners) {
        await removeListeners();
        removeListeners = null;
    }
    if (currentToken) {
        await deactivatePushToken(currentToken);
    }
    initializedForUserId = null;
    currentToken = null;
};
