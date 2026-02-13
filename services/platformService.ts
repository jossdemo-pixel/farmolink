
export const getPlatform = () => {
    // Detecta se está rodando via Capacitor/Cordova (Nativo) ou Browser comum
    const isNative = (window as any).Capacitor?.isNativePlatform || false;
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);
    
    return {
        isNative,
        isAndroid,
        isWeb: !isNative,
        platform: isNative ? 'android' : 'web'
    };
};

/**
 * Utilitário para adicionar classes CSS específicas de plataforma
 */
export const getSafePaddingClass = () => {
    const { isNative } = getPlatform();
    // No Android nativo, precisamos de espaço para a barra de status
    return isNative ? 'pt-10 pb-6' : 'pt-0 pb-0';
};
