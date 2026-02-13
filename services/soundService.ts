
import { TextToSpeech } from '@capacitor-community/text-to-speech';

// Detectar se está rodando no Android
const isAndroid = () => {
    try {
        return /android/i.test(navigator.userAgent);
    } catch {
        return false;
    }
};

// URLs de sons hospedados em CDN estável (Mixkit/Assets)
const SOUNDS = {
    click: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', 
    success: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3', 
    save: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
    notification: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', // Bell claro
    error: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3', 
    trash: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
    login: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
    logout: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', 
    cash: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'
};

const AUDIO_CACHE = new Map<string, HTMLAudioElement>();

// Habilita áudio automático através de interação do usuário
let audioContextInitialized = false;

const initAudioContext = () => {
    if (audioContextInitialized) return;
    
    try {
        // Criar um elemento dummy para inicializar contexto de áudio
        const dummyAudio = new Audio();
        dummyAudio.volume = 0;
        dummyAudio.play().catch(() => {
            // Esperado falhar, mas inicia o contexto
        });
        audioContextInitialized = true;
    } catch (e) {
        console.warn("Não foi possível inicializar contexto de áudio");
    }
};

export const playSound = (type: keyof typeof SOUNDS) => {
    try {
        initAudioContext();
        
        const audioUrl = SOUNDS[type] || SOUNDS.click;
        
        // Tenta usar cache se disponível
        let audio = AUDIO_CACHE.get(audioUrl);
        if (!audio) {
            audio = new Audio(audioUrl);
            audio.volume = 0.7;
            audio.crossOrigin = "anonymous";
            AUDIO_CACHE.set(audioUrl, audio);
        }
        
        // Reset para tocar novamente
        audio.currentTime = 0;
        
        // Tenta tocar com timeout para não travar UI
        const playPromise = audio.play();
        if (playPromise) {
            const timeoutId = setTimeout(() => {
                console.warn(`Audio timeout (${type})`);
            }, 5000);
            
            playPromise
                .then(() => clearTimeout(timeoutId))
                .catch(e => {
                    clearTimeout(timeoutId);
                    console.warn(`Áudio bloqueado (${type}):`, e.name);
                    // Fallha silenciosa - não quebra o app
                });
        }
    } catch (error) {
        // Silenciosamente ignora erros de som em APK
        console.warn("Erro ao tocar som:", error);
    }
};

export const playWelcomeMessage = (userName?: string) => {
    try {
        const firstName = userName ? userName.split(' ')[0] : '';
        const text = firstName 
            ? `Olá ${firstName}, seja bem vindo ao FarmoLink`
            : "Olá, Seja bem vindo ao FarmoLink";

        // Tenta usar Text-to-Speech nativo (Android/iOS via Capacitor)
        if (isAndroid()) {
            TextToSpeech.speak({
                text: text,
                lang: 'pt-PT',
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                category: 'default'
            }).then(() => {
                console.log("✅ Mensagem de boas-vindas reproduzida (nativa)");
            }).catch((error) => {
                console.warn("❌ Erro no Text-to-Speech nativo, tentando Web Speech API:", error);
                // Fallback para Web Speech API
                playWelcomeMessageFallback(text);
            });
        } else {
            // Em navegador web, usa Web Speech API
            playWelcomeMessageFallback(text);
        }
    } catch (e) {
        console.warn("Erro ao tentar tocar mensagem de boas-vindas:", e);
    }
};

// Fallback para Web Speech API (navegador web)
const playWelcomeMessageFallback = (text: string) => {
    if (!('speechSynthesis' in window)) {
        console.warn("Speech synthesis não disponível");
        return;
    }
    
    try {
        // Cancela qualquer síntese em progresso
        window.speechSynthesis.cancel();
        
        // Pequeno delay para garantir que o contexto de áudio está pronto
        setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-PT';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Log para debug
            utterance.onstart = () => {
                console.log("✅ Iniciando síntese de fala:", text);
            };
            
            utterance.onerror = (e) => {
                console.warn("❌ Erro na síntese de fala:", e.error);
            };
            
            utterance.onend = () => {
                console.log("✅ Síntese de fala concluída");
            };

            window.speechSynthesis.speak(utterance);
        }, 300);
    } catch (e) {
        console.warn("Erro ao tentar usar Web Speech API:", e);
    }
};
