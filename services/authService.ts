
import { supabase, safeQuery } from './supabaseClient';
import { User, UserRole } from '../types';
import { clearAllCache } from './dataService';
import { enqueueOfflineAction, isOfflineNow } from './offlineService';

// Função para traduzir mensagens de erro do Supabase
const translateErrorMessage = (message: string): string => {
  const translations: { [key: string]: string } = {
    'Email not confirmed': 'Confirma o email na tua caixa de entrada!',
    'Invalid login credentials': 'Email ou senha incorretos.',
    'User not found': 'Utilizador não encontrado.',
    'User already registered': 'Este email já está registado.',
    'Password should be at least 6 characters': 'A senha deve ter no mínimo 6 caracteres.',
    'Invalid email': 'Email inválido.',
  };

  for (const [key, value] of Object.entries(translations)) {
    if (message.includes(key)) return value;
  }
  
  return message;
};

export const signUpPartner = async (name: string, email: string, password: string, phone: string = ''): Promise<{ user: User | null, error: string | null }> => {
  if (isOfflineNow()) {
    return { user: null, error: 'Sem internet. Conecte-se para criar conta.' };
  }
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role: UserRole.PHARMACY, phone } }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Erro ao criar usuário no sistema.');

    const { data: newPharm, error: createPharmError } = await supabase.from('pharmacies').insert([{
        name: `Farmácia de ${name}`,
        status: 'PENDING',
        owner_email: email.toLowerCase().trim(),
        is_available: false,
        address: 'Pendente de Configuração',
        rating: 5.0,
        delivery_fee: 600, 
        min_time: '35 min', 
        commission_rate: 10
    }]).select().single();

    if (createPharmError || !newPharm) throw new Error('Erro ao criar registro da farmácia.');

    await supabase.from('profiles').upsert([{
      id: authData.user.id, name, email: email.toLowerCase().trim(), phone, role: UserRole.PHARMACY, pharmacy_id: newPharm.id 
    }]);

    return { user: { id: authData.user.id, name, email, role: UserRole.PHARMACY, pharmacyId: newPharm.id, phone }, error: null };
  } catch (error: any) {
    const errorMessage = translateErrorMessage(error.message || 'Falha no cadastro.');
    return { user: null, error: errorMessage };
  }
};

export const signUpUser = async (name: string, email: string, password: string, role: UserRole, phone: string = ''): Promise<{ user: User | null, error: string | null }> => {
  if (isOfflineNow()) {
    return { user: null, error: 'Sem internet. Conecte-se para criar conta.' };
  }
  try {
    let finalRole = role;
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail === 'jossdemo@gmail.com' || cleanEmail.startsWith('admin@')) finalRole = UserRole.ADMIN;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name, role: finalRole, phone } }
    });

    if (authError) throw authError;
    await supabase.from('profiles').upsert([{ id: authData.user!.id, name, email: cleanEmail, phone, role: finalRole, pharmacy_id: null }]);

    return { user: { id: authData.user!.id, name, email: cleanEmail, phone, role: finalRole }, error: null };
  } catch (error: any) {
    const errorMessage = translateErrorMessage(error.message || 'Falha no cadastro.');
    return { user: null, error: errorMessage };
  }
};

export const signInUser = async (email: string, password: string): Promise<{ user: User | null, error: string | null }> => {
  if (isOfflineNow()) {
    return { user: null, error: 'Sem internet. Nao e possivel entrar offline.' };
  }
  try {
    const cleanEmail = email.toLowerCase().trim();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (authError) throw authError;

    const userId = authData.user!.id;
    
    // Primeiro tenta usar o perfil existente (evita chamadas extras ao banco)
    const { data: existingProfile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (existingProfile) {
        return {
            user: {
                id: existingProfile.id,
                name: existingProfile.name || 'Usuário',
                email: existingProfile.email || cleanEmail,
                phone: existingProfile.phone,
                address: existingProfile.address,
                role: existingProfile.role as UserRole,
                pharmacyId: existingProfile.pharmacy_id
            },
            error: null
        };
    }

    // Fallback para cenários de migração: define role básico e cria perfil
    let finalRole = UserRole.CUSTOMER;
    let pharmacyId: string | undefined = undefined;

    if (cleanEmail === 'jossdemo@gmail.com' || cleanEmail.startsWith('admin@')) {
        finalRole = UserRole.ADMIN;
    } else {
        const { data: pharm } = await supabase.from('pharmacies').select('id').eq('owner_email', cleanEmail).maybeSingle();
        if (pharm) {
            finalRole = UserRole.PHARMACY;
            pharmacyId = pharm.id;
        }
    }

    await supabase.from('profiles').upsert([{
        id: userId, name: authData.user!.user_metadata?.name || 'Usuário', email: cleanEmail,
        phone: authData.user!.user_metadata?.phone || '', role: finalRole, pharmacy_id: pharmacyId
    }]);

    return {
        user: {
            id: userId,
            name: authData.user!.user_metadata?.name || 'Usuário',
            email: cleanEmail,
            phone: authData.user!.user_metadata?.phone || '',
            role: finalRole,
            pharmacyId
        },
        error: null
    };
  } catch (error: any) {
    const errorMessage = translateErrorMessage(error.message || 'Credenciais inválidas.');
    return { user: null, error: errorMessage };
  }
};

export const signOutUser = async () => {
  await supabase.auth.signOut();
  clearAllCache();
  const rememberEmail = localStorage.getItem('farmolink_remember_email');
  const rememberPassword = localStorage.getItem('farmolink_remember_password');
  const rememberedAccounts = localStorage.getItem('farmolink_remember_accounts');
  localStorage.clear();
  if (rememberEmail) localStorage.setItem('farmolink_remember_email', rememberEmail);
  if (rememberPassword) localStorage.setItem('farmolink_remember_password', rememberPassword);
  if (rememberedAccounts) localStorage.setItem('farmolink_remember_accounts', rememberedAccounts);
};

export const resetPassword = async (email: string): Promise<{ success: boolean, message: string }> => {
  if (isOfflineNow()) {
    return { success: false, message: 'Sem internet. Conecte-se para recuperar a senha.' };
  }
  try {
    const isLocalOrNative =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.origin.startsWith('capacitor://');

    const configuredRedirect = (import.meta as any)?.env?.VITE_PASSWORD_RESET_REDIRECT_URL as string | undefined;
    const redirectTo = configuredRedirect
      ? configuredRedirect
      : (isLocalOrNative ? undefined : `${window.location.origin}/reset-password`);

    const { error } = redirectTo
      ? await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      : await supabase.auth.resetPasswordForEmail(email);

    if (error) throw error;
    return { success: true, message: 'Link enviado com sucesso.' };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const updateUserPassword = async (password: string): Promise<{ success: boolean, error?: string }> => {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const authUser = session.user;
  const email = authUser.email?.toLowerCase().trim() || '';
  
  // 1) Lê o perfil atual e, se consistente, devolve direto (evita consultas extras)
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();

  if (profile) {
      return {
          id: profile.id,
          name: profile.name || authUser.user_metadata?.name || 'Usuário',
          email: profile.email || email,
          phone: profile.phone || '',
          address: profile.address || '',
          role: profile.role as UserRole,
          pharmacyId: profile.pharmacy_id as any
      };
  }

  // 2) Fallback: se não houver perfil (migração ou nova base), inferir de forma leve
  let inferredRole = UserRole.CUSTOMER;
  let inferredPharmId: string | null = null;

  if (email === 'jossdemo@gmail.com' || email.startsWith('admin@')) {
      inferredRole = UserRole.ADMIN;
  } else {
      const { data: pharm } = await supabase.from('pharmacies').select('id').eq('owner_email', email).maybeSingle();
      if (pharm) {
          inferredRole = UserRole.PHARMACY;
          inferredPharmId = pharm.id;
      }
  }

  await supabase.from('profiles').upsert({
      id: authUser.id,
      email,
      role: inferredRole,
      pharmacy_id: inferredPharmId,
      name: authUser.user_metadata?.name || 'Usuário'
  });

  return {
      id: authUser.id,
      name: authUser.user_metadata?.name || 'Usuário',
      email,
      phone: '',
      address: '',
      role: inferredRole,
      pharmacyId: inferredPharmId as any
  };
};

export const updateUserProfile = async (
  userId: string,
  data: { name: string, phone: string, address: string }
): Promise<{ success: boolean, error?: string, queued?: boolean }> => {
  if (isOfflineNow()) {
    enqueueOfflineAction('profile_update', {
      userId,
      name: data.name,
      phone: data.phone,
      address: data.address
    });
    return { success: true, queued: true };
  }
  try {
    const { error } = await supabase.from('profiles').update({ name: data.name, phone: data.phone, address: data.address }).eq('id', userId);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const adminUpdateUser = async (userId: string, data: { name: string, phone: string, role: UserRole }): Promise<{ success: boolean, error?: string }> => {
  try {
    const { error } = await supabase.from('profiles').update({ name: data.name, phone: data.phone, role: data.role }).eq('id', userId);
    return { success: !error, error: error?.message };
  } catch (error: any) { return { success: false, error: error.message }; }
};

export const clearPharmacyLink = async (userId: string): Promise<{ success: boolean, error?: string }> => {
  try {
    const { error } = await supabase.from('profiles').update({ pharmacy_id: null }).eq('id', userId);
    return { success: !error, error: error?.message };
  } catch (error: any) { return { success: false, error: error.message }; }
};

export const fetchAllUsers = async (): Promise<User[]> => {
    const res = await safeQuery(async () => supabase.from('profiles').select('*'));
    return (res?.data || []).map((p: any) => ({ 
        id: p.id, name: p.name, email: p.email, phone: p.phone, 
        address: p.address, role: p.role, pharmacyId: p.pharmacy_id 
    }));
};

