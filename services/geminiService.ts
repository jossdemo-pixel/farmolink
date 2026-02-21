import { supabase } from './supabaseClient';
import { PrescriptionRequest } from '../types';

const TIMEOUT = 30000;
const VISION_TIMEOUT = 45000;

export interface BotActionEvent {
  type: string;
  payload?: Record<string, unknown>;
}

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const extractSearchTokens = (value: string) => {
  const stopwords = new Set([
    'com',
    'para',
    'uma',
    'umas',
    'uns',
    'dos',
    'das',
    'que',
    'como',
    'sobre',
    'onde',
    'quero',
    'preciso',
    'tem',
    'por',
    'favor',
    'de',
    'da',
    'do',
    'na',
    'no',
    'a',
    'o',
    'e'
  ]);

  return Array.from(
    new Set(
      normalizeText(value)
        .split(/[^a-z0-9]+/g)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3 && !stopwords.has(part))
    )
  ).slice(0, 4);
};

const withTimeout = <T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error('timeout');
      (err as any).name = 'AbortError';
      reject(err);
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const isAuthError = (error: any, data?: any): boolean => {
  const text = `${error?.message || ''} ${data?.error || ''} ${data?.details || ''}`.toLowerCase();
  return (
    text.includes('401') ||
    text.includes('unauthorized') ||
    text.includes('nao autenticado') ||
    text.includes('sessao invalida') ||
    text.includes('jwt')
  );
};

const extractEdgeInvokeError = async (error: any, data?: any): Promise<Error> => {
  if (data?.details || data?.error) {
    return new Error(data?.details || data?.error);
  }

  const fallback = error?.message || 'Falha na Edge Function';
  try {
    const response = error?.context;
    if (!response) return new Error(fallback);

    const body = await response.clone().json().catch(async () => {
      const text = await response.clone().text().catch(() => '');
      return text ? { error: text } : null;
    });

    const detailed =
      body?.details ||
      body?.error ||
      body?.reason ||
      body?.message ||
      body?.msg;

    return new Error(detailed ? String(detailed) : fallback);
  } catch {
    return new Error(fallback);
  }
};

const invokeGemini = async (
  body: Record<string, unknown>,
  retryOnAuthError = false
): Promise<{ data: any; error: any; authFailed: boolean }> => {
  const { data: firstSessionData } = await supabase.auth.getSession();
  const firstToken = firstSessionData?.session?.access_token;
  const firstInvokePayload: any = { body };
  if (firstToken) {
    firstInvokePayload.headers = { Authorization: `Bearer ${firstToken}` };
  }

  const first = await supabase.functions.invoke('gemini', firstInvokePayload);

  if (!first.error && !first.data?.error) {
    return { data: first.data, error: null, authFailed: false };
  }

  const firstError =
    first.error ? await extractEdgeInvokeError(first.error, first.data) : await extractEdgeInvokeError(null, first.data);
  const firstAuthFailed = isAuthError(firstError, first.data);

  if (retryOnAuthError && firstAuthFailed) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed?.session?.access_token;
    const secondInvokePayload: any = { body };
    if (refreshedToken) {
      secondInvokePayload.headers = { Authorization: `Bearer ${refreshedToken}` };
    }

    const second = await supabase.functions.invoke('gemini', secondInvokePayload);

    if (!second.error && !second.data?.error) {
      return { data: second.data, error: null, authFailed: false };
    }

    const secondError =
      second.error ? await extractEdgeInvokeError(second.error, second.data) : await extractEdgeInvokeError(null, second.data);

    return {
      data: second.data,
      error: secondError,
      authFailed: isAuthError(secondError, second.data)
    };
  }

  return { data: first.data, error: firstError, authFailed: firstAuthFailed };
};

export const checkAiHealth = async (): Promise<boolean> => {
  if (!navigator.onLine) return false;

  try {
    const { data, error } = await withTimeout(
      () => invokeGemini({ action: 'ping' }, false),
      TIMEOUT
    );

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
      userId
    }: {
      message: string;
      userName?: string;
      history?: any[];
      userId: string;
    }) => {
      try {
        if (!message?.trim()) {
          return { text: 'Por favor, escreva uma mensagem.' };
        }

        const searchTokens = extractSearchTokens(message);
        const firstToken = searchTokens[0] || '';

        let productsQuery = supabase
          .from('products')
          .select('id,name,price,stock,requires_prescription,pharmacy_id')
          .limit(50);

        if (firstToken) {
          productsQuery = productsQuery.ilike('name', `%${firstToken}%`);
        }

        let { data: products } = await productsQuery;

        if ((!products || products.length === 0) && firstToken) {
          const fallback = await supabase
            .from('products')
            .select('id,name,price,stock,requires_prescription,pharmacy_id')
            .limit(50);
          products = fallback.data || [];
        }

        const pharmacyIds = Array.from(
          new Set((products || []).map((p: any) => p.pharmacy_id).filter(Boolean))
        );

        let pharmacyMap = new Map<string, any>();
        if (pharmacyIds.length > 0) {
          const { data: pharmacies } = await supabase
            .from('pharmacies')
            .select('id,name,status,is_available')
            .in('id', pharmacyIds);

          pharmacyMap = new Map((pharmacies || []).map((ph: any) => [String(ph.id), ph]));
        }

        const { data, error, authFailed } = await withTimeout(
          () =>
            invokeGemini(
              {
                action: 'farmobot_message',
                message,
                userName,
                history: history?.map((h: any) => ({ role: h.role, content: h.text || h.content })),
                productsContext: (products || []).map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  price: p.price,
                  stock: p.stock,
                  requiresPrescription: p.requires_prescription,
                  pharmacyId: p.pharmacy_id,
                  pharmacyName: pharmacyMap.get(String(p.pharmacy_id || ''))?.name || 'Farmacia',
                  pharmacyStatus: pharmacyMap.get(String(p.pharmacy_id || ''))?.status || '',
                  pharmacyAvailable: !!pharmacyMap.get(String(p.pharmacy_id || ''))?.is_available
                }))
              },
              true
            ),
          TIMEOUT
        );

        if (error) {
          console.error('Erro na Edge Function:', error);

          if (authFailed) {
            throw new Error('Sessao expirada. Termine sessao e entre novamente.');
          }

          if (String(error?.message || '').toLowerCase().includes('timeout')) {
            throw new Error('Resposta demorou muito. Por favor, tente novamente.');
          }

          throw new Error(error?.message || 'Erro ao processar sua mensagem');
        }

        saveChatMessage(userId, 'user', message);
        if (data?.text) {
          saveChatMessage(userId, 'model', data.text);
        }

        return { text: data?.text || 'Desculpe, recebi uma resposta vazia.' };
      } catch (error: any) {
        console.error('Falha no Chat:', error?.message || error);

        if (error?.name === 'AbortError') {
          return { text: 'Tempo limite excedido. Tente novamente em instantes.' };
        }

        const normalizedError = String(error?.message || '').toLowerCase();
        if (
          normalizedError.includes('503') ||
          normalizedError.includes('unavailable') ||
          normalizedError.includes('high demand') ||
          normalizedError.includes('experiencing high demand')
        ) {
          return { text: 'O FarmoBot está com alta procura no momento. Tenta novamente em 1-2 minutos.' };
        }

        return { text: `Erro: ${error?.message || 'Falha de conexao'}.` };
      }
    }
  };
};

export const analyzePrescriptionVision = async (
  imageUrl: string
): Promise<PrescriptionRequest['ai_metadata']> => {
  if (!navigator.onLine) {
    return {
      confidence: 0,
      extracted_text: 'Sem internet. A leitura por IA esta indisponivel offline.',
      is_validated: false,
      suggested_items: []
    };
  }

  try {
    let optimizedUrl = imageUrl;
    if (imageUrl.includes('cloudinary')) {
      optimizedUrl = imageUrl.replace('/upload/', '/upload/w_800,q_auto:eco,f_auto/');
    }

    const { data, error, authFailed } = await withTimeout(
      () =>
        invokeGemini(
          {
            action: 'vision',
            imageUrl: optimizedUrl,
            timeout: VISION_TIMEOUT
          },
          false
        ),
      VISION_TIMEOUT
    );

    if (error) {
      console.error('Erro Vision:', error);

      if (authFailed) {
        throw new Error('Sessao expirada. Termine sessao e entre novamente.');
      }

      throw error;
    }

    if (!data) {
      throw new Error('Erro no processamento da imagem.');
    }

    return {
      confidence: data.confidence ?? 0,
      extracted_text: data.extracted_text || 'Texto nao identificado.',
      is_validated: false,
      suggested_items: data.suggested_items || []
    };
  } catch (err: any) {
    console.error('Erro Vision IA:', err?.message || err);

    let errorMessage =
      'Nao foi possivel ler automaticamente a receita. Descreva os medicamentos manualmente.';

    if (err?.name === 'AbortError') {
      errorMessage = 'Processamento demorou muito. Tente com uma foto mais clara.';
    } else if (String(err?.message || '').toLowerCase().includes('sessao expirada')) {
      errorMessage = 'Sessao expirada. Termine sessao e entre novamente.';
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
