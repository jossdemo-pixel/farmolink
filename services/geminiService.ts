import { supabase } from './supabaseClient';
import { PrescriptionRequest } from '../types';

/**
 * FarmoLink AI Service - Production Bridge
 * Supports structured FarmoBot responses with safe fallback to legacy chat.
 */

const TIMEOUT = 30000;
const VISION_TIMEOUT = 45000;

export type BotConversationStatus = 'bot_active' | 'escalated_pharmacy' | 'escalated_admin' | 'resolved';
export type BotMode = 'COMMERCIAL' | 'EDUCATIONAL' | 'SENSITIVE' | 'NAVIGATION';
export type BotRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BotEscalationTarget = 'BOT' | 'PHARMACY' | 'ADMIN';

export interface BotActionEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface FarmoBotReply {
  greeting: string;
  objective: string;
  safety?: string;
  cta?: string;
}

export interface FarmoBotMessageResult {
  text: string;
  actions: BotActionEvent[];
  reply?: FarmoBotReply;
  conversationId?: string;
  conversationStatus?: BotConversationStatus;
  mode?: BotMode;
  riskLevel?: BotRiskLevel;
  escalationTarget?: BotEscalationTarget;
  triggers?: string[];
}

const BOT_ACTION_ALIASES: Record<string, string> = {
  upload_prescription: 'OPEN_UPLOAD_RX',
  reserve_product: 'ADD_TO_CART',
  find_nearby_pharmacies: 'OPEN_PHARMACIES_NEARBY',
  view_other_pharmacies: 'OPEN_PHARMACIES_NEARBY',
  open_support: 'OPEN_SUPPORT',
  open_cart: 'OPEN_CART',
  open_prescriptions: 'OPEN_PRESCRIPTIONS',
  escalate_pharmacy: 'ESCALATE_PHARMACY',
  escalate_admin: 'ESCALATE_ADMIN',
};

const normalizeActionType = (rawType: string): string => {
  const cleaned = String(rawType || '').trim();
  if (!cleaned) return '';
  return BOT_ACTION_ALIASES[cleaned] || cleaned.toUpperCase();
};

const parseActions = (actionsRaw: unknown): BotActionEvent[] => {
  if (!Array.isArray(actionsRaw)) return [];
  return actionsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const type = normalizeActionType((item as any).type);
      if (!type) return null;
      return {
        type,
        payload: (item as any).payload && typeof (item as any).payload === 'object' ? (item as any).payload : {},
      } as BotActionEvent;
    })
    .filter((a): a is BotActionEvent => !!a);
};

const composeReplyText = (reply?: Partial<FarmoBotReply>, fallbackText?: string): string => {
  if (reply?.objective || reply?.greeting || reply?.safety || reply?.cta) {
    const blocks = [reply?.greeting, reply?.objective, reply?.safety, reply?.cta]
      .map((b) => String(b || '').trim())
      .filter(Boolean);
    if (blocks.length > 0) return blocks.join(' ');
  }
  return fallbackText || 'Nao consegui gerar resposta agora. Tente novamente.';
};

export const checkAiHealth = async (): Promise<boolean> => {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    const { data, error } = await supabase.functions.invoke('gemini', {
      body: { action: 'ping' },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    clearTimeout(timeoutId);

    if (error) {
      console.error('AI Health check failed:', error);
      return false;
    }
    return data?.status === 'ok';
  } catch (e) {
    console.error('AI Health check error:', e);
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
    console.error('Erro ao carregar historico:', e);
    return [];
  }
};

export const saveChatMessage = async (userId: string, role: 'user' | 'model', content: string) => {
  try {
    await supabase.from('bot_conversations').insert([{ user_id: userId, role, content }]);
  } catch (e) {
    console.error('Erro ao salvar mensagem:', e);
  }
};

export const getChatSession = () => {
  return {
    sendMessage: async ({
      message,
      userName,
      history,
      userId,
      conversationId,
      pharmacyId,
    }: {
      message: string;
      userName?: string;
      history?: any[];
      userId: string;
      conversationId?: string;
      pharmacyId?: string;
    }): Promise<FarmoBotMessageResult> => {
      try {
        if (!message?.trim()) {
          return { text: 'Por favor, escreva uma mensagem.', actions: [] };
        }

        const { data: products } = await supabase
          .from('products')
          .select('id, name, price, pharmacy_id')
          .limit(12);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        const structuredPayload = {
          action: 'farmobot_message',
          message,
          userName,
          userId,
          conversationId,
          pharmacyId,
          history: history?.map((h) => ({ role: h.role, content: h.text || h.content })),
          productsContext: (products || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            pharmacyId: p.pharmacy_id,
          })),
        };

        let { data, error } = await supabase.functions.invoke('gemini', {
          body: structuredPayload,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        // Fallback for older edge implementation.
        if (error || data?.error) {
          const legacy = await supabase.functions.invoke('gemini', {
            body: {
              action: 'chat',
              message,
              userName,
              history: history?.map((h) => ({ role: h.role, content: h.text || h.content })),
              productsContext: (products || []).map((p: any) => ({ item: p.name, price: p.price })),
            },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          data = legacy.data;
          error = legacy.error;
        }

        clearTimeout(timeoutId);

        if (error) {
          console.error('Erro na Edge Function:', error);
          if (error.message?.includes('timeout')) {
            throw new Error('Resposta demorou muito. Por favor, tente novamente.');
          }
          throw new Error(error.message || 'Erro ao processar sua mensagem');
        }

        if (data?.error) throw new Error(data.details || data.error);

        const reply = data?.reply || undefined;
        const actions = parseActions(data?.actions);
        const text = composeReplyText(reply, data?.text || 'Desculpe, recebi uma resposta vazia.');

        saveChatMessage(userId, 'user', message);
        saveChatMessage(userId, 'model', text);

        return {
          text,
          reply,
          actions,
          conversationId: data?.conversation_id || data?.conversationId,
          conversationStatus: data?.conversation_status || data?.conversationStatus,
          mode: data?.mode,
          riskLevel: data?.risk_level || data?.riskLevel,
          escalationTarget: data?.escalation_target || data?.escalationTarget,
          triggers: Array.isArray(data?.triggers) ? data.triggers : [],
        };
      } catch (error: any) {
        console.error('Falha no Chat:', error.message);

        if (error.name === 'AbortError') {
          return {
            text: 'Tempo limite excedido. Sua conexao esta lenta. Tente novamente mais tarde.',
            actions: [],
          };
        }

        return {
          text: `Erro: ${error.message}. Por favor, verifique sua conexao.`,
          actions: [],
        };
      }
    },
  };
};

export const analyzePrescriptionVision = async (imageUrl: string): Promise<PrescriptionRequest['ai_metadata']> => {
  if (!navigator.onLine) {
    return {
      confidence: 0,
      extracted_text: 'Sem internet. A leitura por IA esta indisponivel offline.',
      is_validated: false,
      suggested_items: [],
    };
  }
  try {
    let optimizedUrl = imageUrl;
    if (imageUrl.includes('cloudinary')) {
      optimizedUrl = imageUrl.replace('/upload/', '/upload/w_800,q_auto:eco,f_auto/');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    const { data, error } = await supabase.functions.invoke('gemini', {
      body: {
        action: 'vision',
        imageUrl: optimizedUrl,
        timeout: VISION_TIMEOUT,
      },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    clearTimeout(timeoutId);

    if (error) {
      console.error('Erro Vision:', error);
      throw error;
    }

    if (!data || data.error) {
      throw new Error(data?.details || 'Erro no processamento da imagem.');
    }

    return {
      confidence: data.confidence ?? 0.0,
      extracted_text: data.extracted_text || 'Texto nao identificado.',
      is_validated: false,
      suggested_items: data.suggested_items || [],
    };
  } catch (err: any) {
    console.error('Erro Vision IA:', err.message);

    let errorMessage = 'Nao foi possivel ler automaticamente a receita (erro de conexao). Por favor, descreva os medicamentos.';

    if (err.name === 'AbortError') {
      errorMessage = 'Processamento demorou muito. Tente com uma foto de melhor qualidade ou mais clara.';
    } else if (err.message?.includes('401')) {
      errorMessage = 'Erro de autenticacao. Por favor, faca login novamente.';
    }

    return {
      confidence: 0,
      extracted_text: errorMessage,
      is_validated: false,
      suggested_items: [],
    };
  }
};

export const standardizeProductVoice = async (text: string) => {
  return { name: text, price: 0 };
};

export const formatProductNameForCustomer = (name: string): string => {
  return name.replace(/[\(\)].*?[\(\)]/g, '').trim();
};
