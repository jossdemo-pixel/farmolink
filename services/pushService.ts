import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { upsertPushToken, deactivatePushToken } from './dataService';
import { playSound, triggerHapticFeedback } from './soundService';

type NavigateFn = (page: string) => void;

let initializedForUserId: string | null = null;
let currentToken: string | null = null;
let removeListeners: (() => Promise<void>) | null = null;

type NotificationChannelId = 'farmolink-important' | 'farmolink-general' | 'farmolink-marketing';

const PUSH_CHANNELS: Array<{
    id: NotificationChannelId;
    name: string;
    description: string;
    importance: 2 | 3 | 4 | 5;
}> = [
    {
        id: 'farmolink-important',
        name: 'FarmoLink Importantes',
        description: 'Alertas importantes de pedidos, receitas e suporte',
        importance: 5
    },
    {
        id: 'farmolink-general',
        name: 'FarmoLink Gerais',
        description: 'Atualizacoes gerais do sistema e da conta',
        importance: 4
    },
    {
        id: 'farmolink-marketing',
        name: 'FarmoLink Marketing',
        description: 'Campanhas, promocoes e novidades comerciais',
        importance: 3
    }
];

const resolveChannelIdFromType = (rawType: unknown): NotificationChannelId => {
    const type = String(rawType || '').trim().toUpperCase();
    if (!type) return 'farmolink-general';

    if (
        type.startsWith('ORDER') ||
        type.startsWith('RX') ||
        type.startsWith('SUPPORT')
    ) {
        return 'farmolink-important';
    }

    if (
        type.includes('MARKETING') ||
        type.includes('PROMO') ||
        type.includes('CAMPAIGN') ||
        type.includes('BANNER')
    ) {
        return 'farmolink-marketing';
    }

    if (type === 'SYSTEM') return 'farmolink-general';
    return 'farmolink-general';
};

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

    for (const channel of PUSH_CHANNELS) {
        await PushNotifications.createChannel({
            id: channel.id,
            name: channel.name,
            description: channel.description,
            importance: channel.importance,
            sound: 'default',
            visibility: 1
        }).catch(() => undefined);
    }

    try {
        await LocalNotifications.requestPermissions();
        for (const channel of PUSH_CHANNELS) {
            await LocalNotifications.createChannel({
                id: channel.id,
                name: channel.name,
                description: channel.description,
                importance: channel.importance,
                sound: 'default',
                visibility: 1
            });
        }

        await LocalNotifications.addListener('localNotificationActionPerformed', (event: any) => {
            const targetPage = resolveTargetPageFromPush(event?.notification?.extra || event?.notification?.data);
            if (targetPage && onNavigate) onNavigate(targetPage);
        });
    } catch {
        // Sem local notifications, push nativo continua funcionando.
    }

    await PushNotifications.addListener('registration', async (token: Token) => {
        currentToken = token.value;
        const saved = await upsertPushToken(userId, token.value, 'android');
        if (!saved) {
            console.warn('Falha ao gravar token push no backend.');
        }
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
            const channelId = resolveChannelIdFromType(notification?.data?.type);

            await LocalNotifications.schedule({
                notifications: [
                    {
                        id: Math.floor(Date.now() % 2147483000),
                        title,
                        body,
                        schedule: { at: new Date(when) },
                        channelId,
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

    // Regista depois dos listeners para nao perder o evento "registration"
    // em dispositivos que retornam token imediatamente.
    await PushNotifications.register();

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
