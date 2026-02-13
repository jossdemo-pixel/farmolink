
import { supabase } from './supabaseClient';
import { PrescriptionRequest } from '../types';

/**
 * FarmoLink AI Service - Production Bridge
 * Com melhor tratamento de timeout e erros para APK
 */

const TIMEOUT = 30000; // 30 segundos
const VISION_TIMEOUT = 45000; // 45 segundos para visão (mais complexo)

export const checkAiHealth = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
        
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        
        const { data, error } = await supabase.functions.invoke('gemini', { 
            body: { action: 'ping' },
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        
        clearTimeout(timeoutId);
        
        if (error) {
            console.error("AI Health check failed:", error);
            return false;
        }
        return data?.status === 'ok';
    } catch (e) { 
        console.error("AI Health check error:", e);
        return false; 
    }
};

export const fetchChatHistory = async (userId: string) => {
    try {
        const { data } = await supabase
            .from('bot_conversations')
            .select('role, content')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        return data || [];
    } catch (e) {
        console.error("Erro ao carregar histórico:", e);
        return [];
    }
};

export const saveChatMessage = async (userId: string, role: 'user' | 'model', content: string) => {
    try {
        await supabase.from('bot_conversations').insert([{ user_id: userId, role, content }]);
    } catch (e) {
        console.error("Erro ao salvar mensagem:", e);
    }
};

export const getChatSession = () => {
    return {
        sendMessage: async ({ message, userName, history, userId }: { message: string, userName?: string, history?: any[], userId: string }) => {
            try {
                // Validação básica
                if (!message?.trim()) {
                    return { text: "Por favor, escreva uma mensagem." };
                }

                // Busca contexto de produtos
                const { data: products } = await supabase
                    .from('products')
                    .select('name, price')
                    .limit(5);

                // Timeout para chat
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
                
                // Obtém token
                const session = await supabase.auth.getSession();
                const token = session.data.session?.access_token;

                const { data, error } = await supabase.functions.invoke('gemini', {
                    body: { 
                        action: 'chat', 
                        message,
                        userName,
                        history: history?.map(h => ({ role: h.role, content: h.text || h.content })),
                        productsContext: products?.map(p => ({ item: p.name, price: p.price }))
                    },
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });

                clearTimeout(timeoutId);

                if (error) {
                    console.error("Erro na Edge Function:", error);
                    
                    // Mensagens de erro mais específicas
                    if (error.message?.includes('timeout')) {
                        throw new Error("Resposta demorou muito. Por favor, tente novamente.");
                    }
                    throw new Error(error.message || "Erro ao processar sua mensagem");
                }

                if (data?.error) throw new Error(data.details || data.error);
                
                // Salva histórico de forma assíncrona
                saveChatMessage(userId, 'user', message);
                if (data?.text) {
                    saveChatMessage(userId, 'model', data.text);
                }

                return { text: data?.text || "Desculpe, recebi uma resposta vazia." };
            } catch (error: any) {
                console.error("Falha no Chat:", error.message);
                
                if (error.name === 'AbortError') {
                    return { text: "Tempo limite excedido. Sua conexão é lenta. Tente novamente mais tarde." };
                }
                
                return { text: `Erro: ${error.message}. Por favor, verifique sua conexão.` };
            }
        }
    };
};

export const analyzePrescriptionVision = async (imageUrl: string): Promise<PrescriptionRequest['ai_metadata']> => {
    if (!navigator.onLine) {
        return {
            confidence: 0,
            extracted_text: "Sem internet. A leitura por IA esta indisponivel offline.",
            is_validated: false,
            suggested_items: []
        };
    }
    try {
        let optimizedUrl = imageUrl;
        if (imageUrl.includes('cloudinary')) {
            // Otimiza imagem para processamento mais rápido
            optimizedUrl = imageUrl.replace('/upload/', '/upload/w_800,q_auto:eco,f_auto/');
        }

        // Timeout para visão (mais demorado)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT);
        
        // Obtém token
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const { data, error } = await supabase.functions.invoke('gemini', {
            body: { 
                action: 'vision', 
                imageUrl: optimizedUrl,
                timeout: VISION_TIMEOUT
            },
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        clearTimeout(timeoutId);

        if (error) {
            console.error("Erro Vision:", error);
            throw error;
        }

        if (!data || data.error) {
            throw new Error(data?.details || "Erro no processamento da imagem.");
        }

        return {
            confidence: data.confidence ?? 0.0,
            extracted_text: data.extracted_text || "Texto não identificado.",
            is_validated: false,
            suggested_items: data.suggested_items || []
        };
    } catch (err: any) {
        console.error("Erro Vision IA:", err.message);
        
        // Mensagens de erro mais específicas
        let errorMessage = "Não foi possível ler automaticamente a receita (erro de conexão). Por favor, descreva os medicamentos.";
        
        if (err.name === 'AbortError') {
            errorMessage = "Processamento demorou muito. Tente com uma foto de melhor qualidade ou mais clara.";
        } else if (err.message?.includes('401')) {
            errorMessage = "Erro de autenticação. Por favor, faça login novamente.";
        }
        
        return { 
            confidence: 0, 
            extracted_text: errorMessage, 
            is_validated: false, 
            suggested_items: [] 
        };
    }
};

export const standardizeProductVoice = async (text: string) => {
    return { name: text, price: 0 };
};

export const formatProductNameForCustomer = (name: string): string => {
    return name.replace(/[\(\)].*?[\(\)]/g, '').trim();
};
