import { supabase } from './supabaseClient';
import { PrescriptionRequest } from '../types';

/**
 * FarmoLink AI Service - Production Bridge
 * Supports structured FarmoBot responses with safe fallback to legacy chat.
 */

const TIMEOUT = 30000;
const VISION_TIMEOUT = 45000;
const CONTEXT_LIMIT = 40;

const SEARCH_STOPWORDS = new Set([
  'a',
  'o',
  'os',
  'as',
  'de',
  'da',
  'do',
  'dos',
  'das',
  'um',
  'uma',
  'para',
  'por',
  'com',
  'sem',
  'que',
  'qual',
  'quais',
  'quanto',
  'tem',
  'tenho',
  'queria',
  'quero',
  'preciso',
  'saber',
  'sobre',
  'no',
  'na',
  'nos',
  'nas',
  'me',
  'minha',
  'meu',
  'favor',
  'porfavor',
  'favor',
]);

const CATALOG_INTENT_REGEX = /\b(tem|disponivel|stock|preco|valor|custa|produto|medicamento|reservar|reserva|comprar|carrinho)\b/;
const NON_CATALOG_INTENT_REGEX = /\b(agendar|agendamento|consulta|horario|suporte|reclamar|erro|problema|enviar receita|upload receita)\b/;

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const shouldBuildProductsContext = (message: string): boolean => {
  const normalized = normalizeText(message);
  if (!normalized) return false;

  const hasCatalogSignal = CATALOG_INTENT_REGEX.test(normalized);
  if (hasCatalogSignal) return true;

  if (NON_CATALOG_INTENT_REGEX.test(normalized)) return false;

  return extractSearchTerms(message).length > 0 && normalized.split(/\s+/).length <= 5;
};

const extractSearchTerms = (message: string): string[] => {
  const normalized = normalizeText(message).replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SEARCH_STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 4);
};

const buildProductsContext = async (message: string) => {
  const terms = extractSearchTerms(message);
  if (terms.length === 0) return [];
  let products: any[] = [];

  const orFilter = terms.map((t) => `name.ilike.%${t}%`).join(',');
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, pharmacy_id, stock, requires_prescription')
    .or(orFilter)
    .limit(CONTEXT_LIMIT);
  if (!error && Array.isArray(data)) products = data;
  if (products.length === 0) return [];

  const pharmacyIds = Array.from(
    new Set(products.map((p) => String(p.pharmacy_id || '')).filter(Boolean)),
  );
  const pharmacyMap: Record<string, { name: string; is_available: boolean; status: string }> = {};

  if (pharmacyIds.length > 0) {
    const { data: pharmacies } = await supabase
      .from('pharmacies')
      .select('id, name, is_available, status')
      .in('id', pharmacyIds);

    (pharmacies || []).forEach((ph: any) => {
      pharmacyMap[String(ph.id)] = {
        name: String(ph.name || 'Farmacia'),
        is_available: !!ph.is_available,
        status: String(ph.status || ''),
      };
    });
  }

  return products.map((p: any) => {
    const pharmacyId = String(p.pharmacy_id || '');
    const meta = pharmacyMap[pharmacyId];
    return {
      id: p.id,
      name: p.name,
      price: Number(p.price || 0),
      stock: Number(p.stock || 0),
      requiresPrescription: !!p.requires_prescription,
      pharmacyId,
      pharmacyName: meta?.name || 'Farmacia',
      pharmacyAvailable: !!meta?.is_available,
      pharmacyStatus: meta?.status || '',
    };
  });
};

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

const EDGE_RETRYABLE_MESSAGES = [
  'failed to send a request to the edge function',
  'edge function returned a non-2xx status code',
  'network',
  'fetch',
  'timeout',
];

const isRetryableEdgeError = (error: any): boolean => {
  const rawMessage = String(error?.message || error?.name || '').toLowerCase();
  if (!rawMessage) return false;
  return EDGE_RETRYABLE_MESSAGES.some((token) => rawMessage.includes(token));
};

const invokeGeminiWithRetry = async (
  body: Record<string, unknown>,
  headers: Record<string, string>,
  attempts = 2,
) => {
  let lastData: any = null;
  let lastError: any = null;

  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase.functions.invoke('gemini', { body, headers });
    lastData = data;
    lastError = error;

    if (!error) return { data, error: null };
    if (!isRetryableEdgeError(error) || i === attempts - 1) break;

    await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
  }

  return { data: lastData, error: lastError };
};

const buildLocalFallbackResult = (message: string, productsContext: any[]): FarmoBotMessageResult => {
  const normalized = normalizeText(message);
  const hasCatalogIntent = /\b(tem|disponivel|stock|preco|valor|custa|farmacia|farmacias|reservar|comprar|carrinho)\b/.test(normalized);
  const contextItems = Array.isArray(productsContext) ? productsContext.slice(0, 3) : [];

  if (hasCatalogIntent && contextItems.length > 0) {
    const summary = contextItems
      .map((item: any) => `${item.name} (Kz ${Number(item.price || 0)} - ${item.pharmacyName || 'Farmacia'})`)
      .join('; ');

    return {
      text: `Ola. Estou com instabilidade na consulta em tempo real. Com base no catalogo local, encontrei: ${summary}. Quer abrir a lista de farmacias para confirmar disponibilidade agora?`,
      actions: [{ type: 'OPEN_PHARMACIES_NEARBY' }],
      conversationStatus: 'bot_active',
      mode: 'NAVIGATION',
      riskLevel: 'LOW',
      escalationTarget: 'BOT',
      triggers: [],
    };
  }

  return {
    text: 'Ola. Estou com instabilidade temporaria no FarmoBot. Posso seguir com navegacao segura: enviar receita, ver farmacias ou abrir carrinho.',
    actions: [{ type: 'OPEN_UPLOAD_RX' }, { type: 'OPEN_PHARMACIES_NEARBY' }, { type: 'OPEN_CART' }],
    conversationStatus: 'bot_active',
    mode: 'NAVIGATION',
    riskLevel: 'LOW',
    escalationTarget: 'BOT',
    triggers: [],
  };
};

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

export const clearChatHistory = async (userId: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('bot_conversations').delete().eq('user_id', userId);
    return !error;
  } catch (e) {
    console.error('Erro ao limpar historico:', e);
    return false;
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
      forceNewConversation,
    }: {
      message: string;
      userName?: string;
      history?: any[];
      userId: string;
      conversationId?: string;
      pharmacyId?: string;
      forceNewConversation?: boolean;
    }): Promise<FarmoBotMessageResult> => {
      let productsContext: any[] = [];
      try {
        if (!message?.trim()) {
          return { text: 'Por favor, escreva uma mensagem.', actions: [] };
        }

        const [sessionResult, productsContextResult] = await Promise.all([
          supabase.auth.getSession(),
          shouldBuildProductsContext(message) ? buildProductsContext(message) : Promise.resolve([]),
        ]);
        productsContext = productsContextResult;

        let token = sessionResult.data.session?.access_token;
        if (!token) {
          const refreshResult = await supabase.auth.refreshSession();
          token = refreshResult.data.session?.access_token || token;
        }
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const localFallback = buildLocalFallbackResult(message, productsContext);

        const structuredPayload = {
          action: 'farmobot_message',
          message,
          userName,
          userId,
          conversationId,
          pharmacyId,
          forceNewConversation: !!forceNewConversation,
          history: history?.map((h) => ({ role: h.role, content: h.text || h.content })),
          productsContext,
        };

        let { data, error } = await invokeGeminiWithRetry(structuredPayload, headers, 2);

        // Fallback for older edge implementation.
        if (error || data?.error) {
          const legacy = await invokeGeminiWithRetry(
            {
              action: 'chat',
              message,
              userName,
              history: history?.map((h) => ({ role: h.role, content: h.text || h.content })),
              productsContext: productsContext.map((p: any) => ({
                item: p.name,
                price: p.price,
                pharmacyName: p.pharmacyName,
              })),
            },
            headers,
            2,
          );
          data = legacy.data;
          error = legacy.error;
        }

        if (error) {
          console.error('Erro na Edge Function:', error);
          return localFallback;
        }

        if (data?.error) {
          console.error('Erro no payload da Edge Function:', data);
          return localFallback;
        }

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
        return buildLocalFallbackResult(message, productsContext);
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
