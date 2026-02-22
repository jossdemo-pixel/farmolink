
import { createClient } from '@supabase/supabase-js';

// Credenciais via env (Vercel / local). Não commitar chaves no repo.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Config ausente: defina VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseKey;
const projectRef =
  supabaseUrl
    .replace(/^https?:\/\//, '')
    .split('.')[0]
    .trim() || 'default';

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

const keyPayload = decodeJwtPayload(supabaseKey);
const keyRef = String((keyPayload as { ref?: string } | null)?.ref || '').trim();
if (keyRef && keyRef !== projectRef) {
  throw new Error(
    `Config inconsistente do Supabase: URL ref "${projectRef}" difere da ANON KEY ref "${keyRef}".`
  );
}

const storageKey = `farmolink-auth-token-${projectRef}`;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey
  },
  global: {
    headers: { 'x-application-name': 'farmolink-mobile' }
  }
});

export const getSupabaseProjectRef = (): string => projectRef;

export const enforceSessionProjectMatch = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = String(session?.access_token || '').trim();
    if (!accessToken) return true;

    const tokenPayload = decodeJwtPayload(accessToken) as { ref?: string; iss?: string } | null;
    const tokenRef = String(tokenPayload?.ref || '').trim();
    const tokenIss = String(tokenPayload?.iss || '').trim().toLowerCase();
    const issuerMatchesProject =
      tokenIss.length > 0 && (
        tokenIss.includes(`${projectRef}.supabase.co`) ||
        tokenIss.includes(projectRef)
      );

    // Access tokens may come with either ref or issuer hints depending on environment/version.
    // We only trust the session when at least one project hint matches current projectRef.
    const projectMatches = (tokenRef && tokenRef === projectRef) || issuerMatchesProject;
    if (projectMatches) return true;

    Object.keys(window.localStorage)
      .filter((k) => k.includes('farmolink-auth-token'))
      .forEach((k) => window.localStorage.removeItem(k));
    await supabase.auth.signOut().catch(() => undefined);
    console.warn(
      `[FarmoLink Auth] Sessao descartada: token_ref=${tokenRef} token_iss=${tokenIss} project_ref=${projectRef}`
    );
    return false;
  } catch {
    return false;
  }
};

/**
 * safeQuery: Utilitário para evitar falhas críticas em conexões instáveis.
 */
export const safeQuery = async <T>(fn: () => Promise<T>, retries = 3): Promise<T | null> => {
    try {
        const result = await fn();
        const potentialError = (result as any)?.error;
        
        if (potentialError) {
            console.warn("[FarmoLink DB]:", potentialError.message || potentialError);
            if (potentialError.status === 401) {
                await supabase.auth.refreshSession();
                return retries > 0 ? safeQuery(fn, retries - 1) : null;
            }
            return null;
        }
        return result;
    } catch (err: any) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            return safeQuery(fn, retries - 1);
        }
        console.error("Erro Crítico FarmoLink:", err.message || err);
        return null;
    }
};
