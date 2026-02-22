import { supabase, enforceSessionProjectMatch, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient';

type EdgeInvokeOptions = {
  functionName: string;
  body: Record<string, unknown>;
  allowAnonymous?: boolean;
  retryOnAuthError?: boolean;
  missingSessionError?: string;
  parseSoftError?: (data: any) => string | null;
  dataErrorExtractor?: (data: any) => string | null;
};

export type EdgeInvokeResult<T = any> = {
  data: T | null;
  error: string | null;
  authFailed: boolean;
};

const defaultMissingSessionError = 'Sessao expirada. Entre novamente.';

export const isJwtEdgeError = (message: string): boolean => {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('invalid jwt') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized') ||
    msg.includes('nao autenticado') ||
    msg.includes('sessao invalida') ||
    (msg.includes('token') && msg.includes('invalid'))
  );
};

export const extractEdgeInvokeError = async (error: any, data?: any): Promise<string> => {
  const dataMessage =
    data?.details ||
    data?.error ||
    data?.reason ||
    data?.message ||
    data?.msg;
  if (dataMessage) return String(dataMessage);

  const fallback = error?.message || 'Falha na chamada da edge function.';
  try {
    const response = error?.context;
    if (!response) return fallback;

    const body = await response.clone().json().catch(async () => {
      const text = await response.clone().text().catch(() => '');
      return text ? { error: text } : null;
    });

    if (body?.error && String(body.error).toLowerCase().includes('unauthorized')) {
      const reason = String(body?.reason || '').trim();
      const tokenRef = String(body?.token_ref || '').trim();
      const projectRef = String(body?.project_ref || '').trim();
      const details = [
        reason ? `reason=${reason}` : '',
        tokenRef ? `token_ref=${tokenRef}` : '',
        projectRef ? `project_ref=${projectRef}` : '',
      ].filter(Boolean).join(', ');
      return details ? `Unauthorized (${details})` : 'Unauthorized';
    }

    const detailed =
      body?.details ||
      body?.error ||
      body?.reason ||
      body?.message ||
      body?.msg;

    return detailed ? String(detailed) : fallback;
  } catch {
    return fallback;
  }
};

const getAccessToken = async (): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  return String(sessionData?.session?.access_token || '').trim();
};

const invokeEdge = async (
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string
) => {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${functionName}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    'x-application-name': 'farmolink-mobile',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.clone().json().catch(async () => {
    const text = await response.clone().text().catch(() => '');
    return text ? { error: text } : null;
  });

  if (response.ok) {
    return { data, error: null };
  }

  return {
    data,
    error: {
      message: String(data?.error || data?.message || `HTTP ${response.status}`),
      status: response.status,
      context: response,
    },
  };
};

const mapInvokeResponse = async (
  response: { data: any; error: any },
  opts: EdgeInvokeOptions
): Promise<EdgeInvokeResult> => {
  if (!response.error) {
    const dataError = opts.dataErrorExtractor?.(response.data) || null;
    if (dataError) {
      return {
        data: response.data,
        error: dataError,
        authFailed: isJwtEdgeError(dataError),
      };
    }

    const softError = opts.parseSoftError?.(response.data) || null;
    if (softError) {
      return { data: response.data, error: softError, authFailed: false };
    }

    return { data: response.data, error: null, authFailed: false };
  }

  const parsed = await extractEdgeInvokeError(response.error, response.data);
  return { data: response.data, error: parsed, authFailed: isJwtEdgeError(parsed) };
};

export const invokeEdgeWithAutoRefresh = async (
  opts: EdgeInvokeOptions
): Promise<EdgeInvokeResult> => {
  const {
    functionName,
    body,
    allowAnonymous = false,
    retryOnAuthError = true,
    missingSessionError = defaultMissingSessionError,
  } = opts;

  const projectSessionOk = await enforceSessionProjectMatch();
  if (!projectSessionOk && !allowAnonymous) {
    return { data: null, error: missingSessionError, authFailed: true };
  }

  const firstToken = await getAccessToken();
  if (!firstToken && !allowAnonymous) {
    return { data: null, error: missingSessionError, authFailed: true };
  }

  const firstResponse = await invokeEdge(functionName, body, firstToken);
  const firstResult = await mapInvokeResponse(firstResponse, opts);
  if (!firstResult.error) return firstResult;

  if (!retryOnAuthError || !firstResult.authFailed) {
    return firstResult;
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  const refreshedToken = String(refreshed?.session?.access_token || '').trim();
  if (!refreshedToken && !allowAnonymous) {
    return { data: null, error: missingSessionError, authFailed: true };
  }

  const secondResponse = await invokeEdge(functionName, body, refreshedToken);
  return mapInvokeResponse(secondResponse, opts);
};
