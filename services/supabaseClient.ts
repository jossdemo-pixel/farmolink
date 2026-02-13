
import { createClient } from '@supabase/supabase-js';

// Credenciais via env (Vercel / local). Não commitar chaves no repo.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Config ausente: defina VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}
export const SUPABASE_URL = supabaseUrl;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'farmolink-auth-token'
  },
  global: {
    headers: { 'x-application-name': 'farmolink-mobile' }
  }
});

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
