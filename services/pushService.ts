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
    if (!PushNotifications) return;

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token: any) => {
        currentToken = token.value;
        await upsertPushToken(userId, token.value, 'android');
    });

    PushNotifications.addListener('registrationError', (error: any) => {
        console.warn('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
        playSound('notification');
        triggerHapticFeedback([16, 40, 16]);

        const targetPage = resolveTargetPageFromPush(notification);
        if (targetPage && onNavigate) onNavigate(targetPage);
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
