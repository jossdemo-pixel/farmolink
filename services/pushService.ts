import { upsertPushToken, deactivatePushToken } from './dataService';
import { playSound, triggerHapticFeedback } from './soundService';

type NavigateFn = (page: string) => void;

let initializedForUserId: string | null = null;
let currentToken: string | null = null;
let removeListeners: (() => Promise<void>) | null = null;

const isNativePlatform = (): boolean => {
    try {
        const capacitor = (window as any)?.Capacitor;
        if (capacitor?.isNativePlatform && typeof capacitor.isNativePlatform === 'function') {
            return capacitor.isNativePlatform();
        }
        return false;
    } catch {
        return false;
    }
};

const getPushPlugin = (): any | null => {
    try {
        return (window as any)?.Capacitor?.Plugins?.PushNotifications || null;
    } catch {
        return null;
    }
};

const getLocalNotificationsPlugin = (): any | null => {
    try {
        return (window as any)?.Capacitor?.Plugins?.LocalNotifications || null;
    } catch {
        return null;
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

    const PushNotifications = getPushPlugin();
    const LocalNotifications = getLocalNotificationsPlugin();
    if (!PushNotifications) return;

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    if (LocalNotifications) {
        try {
            await LocalNotifications.requestPermissions();
            await LocalNotifications.createChannel?.({
                id: 'farmolink-important',
                name: 'FarmoLink Importantes',
                description: 'Alertas importantes de pedidos, suporte e sistema',
                importance: 5,
                sound: 'default',
                visibility: 1
            });

            LocalNotifications.addListener('localNotificationActionPerformed', (event: any) => {
                const targetPage = resolveTargetPageFromPush(event?.notification?.extra || event?.notification?.data);
                if (targetPage && onNavigate) onNavigate(targetPage);
            });
        } catch (e) {
            console.warn('Local notifications setup warning:', e);
        }
    }

    PushNotifications.addListener('registration', async (token: any) => {
        currentToken = token.value;
        await upsertPushToken(userId, token.value, 'android');
    });

    PushNotifications.addListener('registrationError', (error: any) => {
        console.warn('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', async (notification: any) => {
        playSound('notification');
        triggerHapticFeedback([16, 40, 16]);

        // Em foreground, também cria notificação nativa na barra do Android.
        if (LocalNotifications) {
            try {
                const when = Date.now() + 350;
                const title = notification?.title || 'FarmoLink';
                const body = notification?.body || notification?.data?.message || 'Nova atualização';

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
            } catch (e) {
                console.warn('Local notification schedule warning:', e);
            }
        }
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
        playSound('click');
        triggerHapticFeedback(12);

        const targetPage = resolveTargetPageFromPush(action.notification);
        if (targetPage && onNavigate) onNavigate(targetPage);
    });

    removeListeners = async () => {
        await PushNotifications.removeAllListeners();
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
