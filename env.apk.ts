// env.apk.ts - Configurações específicas para APK
// Importe este arquivo em main.tsx para APK

export const APK_CONFIG = {
  // Timeouts adaptados para rede mobile
  API_TIMEOUT: 30000, // 30 segundos
  VISION_TIMEOUT: 45000, // 45 segundos
  CHAT_TIMEOUT: 30000,
  
  // Cache
  CACHE_EXPIRATION: 1000 * 60 * 30, // 30 minutos
  ENABLE_OFFLINE_MODE: true,
  
  // Audio
  AUDIO_CACHE_SIZE: 10,
  AUDIO_VOLUME: 0.7,
  
  // Logs
  ENABLE_CONSOLE_LOGS: false, // Desabilita em produção
  ENABLE_ERROR_REPORTING: true,
  
  // Otimizações
  PRELOAD_CRITICAL_DATA: true,
  LAZY_LOAD_IMAGES: true,
  IMAGE_OPTIMIZATION: {
    quality: 'auto:eco',
    width: 800,
    format: 'auto'
  },
  
  // Network
  USE_COMPRESSION: true,
  RETRY_FAILED_REQUESTS: true,
  MAX_RETRIES: 3,
  
  // Performance
  ENABLE_SERVICE_WORKER: true,
  BUNDLE_CHUNKS: true
};

// Detector de ambiente
export const isAPK = () => {
  const ua = navigator.userAgent || '';
  return ua.includes('Android') && !ua.includes('Chrome');
};

// Detector de conectividade
export const getNetworkStatus = async () => {
  if (!navigator.onLine) {
    return { online: false, speed: 'offline' };
  }
  
  try {
    const start = performance.now();
    await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
    const duration = performance.now() - start;
    
    let speed = 'slow';
    if (duration < 500) speed = 'fast';
    else if (duration < 1500) speed = 'medium';
    
    return { online: true, speed, latency: Math.round(duration) };
  } catch {
    return { online: navigator.onLine, speed: 'unknown' };
  }
};

// Otimização automática baseada em rede
export const getOptimalTimeouts = async () => {
  const { speed } = await getNetworkStatus();
  
  if (speed === 'slow') {
    return {
      API_TIMEOUT: 60000,
      VISION_TIMEOUT: 90000,
      CHAT_TIMEOUT: 60000
    };
  } else if (speed === 'medium') {
    return {
      API_TIMEOUT: 45000,
      VISION_TIMEOUT: 60000,
      CHAT_TIMEOUT: 45000
    };
  }
  
  return APK_CONFIG;
};
