import { supabase, safeQuery } from './supabaseClient';
import { CarouselSlide, Partner, Notification, UserRole, Product, Pharmacy, Order, PrescriptionRequest, SettlementCycle } from '../types';
import { enqueueOfflineAction, isOfflineNow } from './offlineService';

export * from './authService';
export * from './pharmacyService';
export * from './productService';
export * from './orderService';
export * from './backupService';

export const DEFAULT_LEGAL_UPDATED_AT = '2026-02-12';

export const DEFAULT_TERMS_OF_USE_TEXT = `1. Natureza da Plataforma
A FarmoLink e uma plataforma digital de intermediacao entre utentes e farmacias parceiras. A FarmoLink nao fabrica nem vende medicamentos diretamente.

2. Elegibilidade e Conta
O utilizador deve fornecer dados verdadeiros e manter a conta segura. O uso indevido da conta pode resultar em bloqueio ou encerramento.

3. Medicamentos e Receita Medica
Medicamentos sujeitos a receita exigem validacao por farmacia e apresentacao da receita conforme a lei local. E proibido usar a plataforma para tentar adquirir medicamentos controlados sem receita valida.

4. Farmacias Parceiras e Licenciamento
Cada farmacia parceira declara que opera com licenca valida. A FarmoLink pode solicitar comprovativos legais e suspender parceiros em caso de irregularidade.

5. Precos, Pagamentos e Entregas
Precos, disponibilidade, prazos e condicoes de entrega sao definidos pela farmacia parceira. A confirmacao de pedido depende de validacao de stock e regras farmaceuticas.

6. Uso Proibido
E proibido: usar dados falsos, praticar fraude, tentar burlar exigencia de receita, ou publicar conteudo ilegal na plataforma.

7. Limites de Responsabilidade
A FarmoLink nao substitui consulta medica, diagnostico profissional ou orientacao clinica. Em caso de emergencia de saude, procure atendimento medico imediato.

8. Alteracoes dos Termos
Estes termos podem ser atualizados para refletir mudancas legais ou operacionais. A versao vigente estara sempre disponivel no app.`;

export const DEFAULT_PRIVACY_POLICY_TEXT = `1. Dados Coletados
Podemos coletar dados de cadastro (nome, email, telefone), dados de uso do app, pedidos, e informacoes relacionadas a receitas e medicamentos quando enviadas pelo utilizador.

2. Dados Sensiveis de Saude
Dados de receitas e medicamentos podem ser considerados sensiveis. Estes dados sao tratados com controles de acesso, criptografia e principio de minimizacao.

3. Finalidades do Tratamento
Usamos dados para autenticar contas, processar pedidos, permitir triagem farmaceutica, prestar suporte, cumprir obrigacoes legais e melhorar seguranca do servico.

4. Compartilhamento
Dados sao compartilhados apenas com farmacias parceiras e prestadores necessarios para execucao do servico, sempre dentro da finalidade contratada e requisitos legais.

5. Retencao e Seguranca
Dados sao mantidos pelo periodo necessario para operacao, auditoria e cumprimento legal. Adotamos medidas tecnicas e administrativas para proteger informacoes.

6. Direitos do Titular
O utilizador pode solicitar acesso, correcao e atualizacao de dados, nos limites da lei aplicavel. Pedidos podem ser feitos pelos canais de suporte da plataforma.

7. Menores de Idade
Contas devem ser usadas por pessoas legalmente aptas ou por responsaveis legais quando aplicavel.

8. Contato e Atualizacoes
Esta politica pode ser atualizada. A versao vigente estara publicada no app. Em caso de duvidas, use os canais oficiais de suporte.`;

export interface LegalContent {
    termsOfUse: string;
    privacyPolicy: string;
    updatedAt: string;
}

// --- SISTEMA DE CACHE PERSISTENTE (localStorage) ---
const CACHE_KEY_PREFIX = 'farmolink_cache_';
const CACHE_EXPIRATION = 1000 * 60 * 30; // 30 minutos

export const getCacheForUser = (userId: string) => {
    try {
        const cached = localStorage.getItem(CACHE_KEY_PREFIX + userId);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.lastSync > CACHE_EXPIRATION) return null;
        return parsed;
    } catch (e) { return null; }
};

export const setCacheForUser = (userId: string, data: Partial<any>) => {
    try {
        const existing = getCacheForUser(userId) || { products: [], pharmacies: [], lastSync: 0 };
        const newData = { ...existing, ...data, lastSync: Date.now() };
        localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(newData));
    } catch (e) { console.error("Erro ao salvar cache local", e); }
};


export const getLastSyncForUser = (userId: string): number | null => {
    const cached = getCacheForUser(userId);
    if (!cached?.lastSync) return null;
    return Number(cached.lastSync) || null;
};

export const clearAllCache = () => {
    Object.keys(localStorage)
        .filter(key => key.startsWith(CACHE_KEY_PREFIX))
        .forEach(key => localStorage.removeItem(key));
    console.log("🧹 Cache local esvaziado.");
};

// --- REVIEWS ---
export const submitReview = async (orderId: string, pharmacyId: string, customerName: string, rating: number, comment: string) => {
    try {
        const { error } = await supabase.from('reviews').insert([{
            order_id: orderId,
            pharmacy_id: pharmacyId,
            customer_name: customerName,
            rating,
            comment
        }]);
        return !error;
    } catch (e) { return false; }
};

export const fetchPharmacyReviews = async (pharmacyId: string) => {
    // OTIMIZAÇÃO: select específico
    const { data } = await supabase
        .from('reviews')
        .select('customer_name, rating, comment, created_at')
        .eq('pharmacy_id', pharmacyId)
        .order('created_at', { ascending: false })
        .limit(20);
    return data || [];
};

// --- NOTIFICATIONS ---
export const fetchNotifications = async (): Promise<Notification[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];

    const { data } = await supabase.from('notifications')
        .select('id, user_id, title, message, type, is_read, created_at, link')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(15);
    
    return (data || []).map((n:any) => ({
        id: n.id, userId: n.user_id, title: n.title, message: n.message,
        type: n.type, read: n.is_read, date: n.created_at, link: n.link
    }));
}

export const markNotificationRead = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    return !error;
}

export const markNotificationsReadBatch = async (ids: string[]): Promise<boolean> => {
    if (!ids.length) return true;
    const { error } = await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    return !error;
}

export const deleteNotification = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    return !error;
}

export const upsertPushToken = async (
    userId: string,
    token: string,
    platform: 'android' | 'ios' | 'web' = 'android'
): Promise<boolean> => {
    if (!userId || !token) return false;

    const { error } = await supabase
        .from('push_tokens')
        .upsert(
            {
                user_id: userId,
                token,
                platform,
                is_active: true,
                device_label: navigator.userAgent,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'token' }
        );

    return !error;
};

export const deactivatePushToken = async (token: string): Promise<boolean> => {
    if (!token) return false;
    const { error } = await supabase
        .from('push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('token', token);
    return !error;
};

// --- LANDING ---
export const fetchLandingContent = async (): Promise<{ slides: CarouselSlide[], partners: Partner[] }> => {
    const { data: slides } = await supabase.from('carousel_slides').select('id, title, subtitle, image_url, button_text, order').order('order', { ascending: true });
    const { data: partners } = await supabase.from('partners').select('id, name, logo_url, active').eq('active', true);

    return {
        slides: (slides || []).map((s:any) => ({ id: s.id, title: s.title, subtitle: s.subtitle, imageUrl: s.image_url, buttonText: s.button_text, order: s.order })),
        partners: (partners || []).map((p:any) => ({ id: p.id, name: p.name, logoUrl: p.logo_url, active: p.active }))
    };
}

// Buscar todos os slides para edição pelo admin
export const fetchAllCarouselSlides = async (): Promise<CarouselSlide[]> => {
    try {
        const { data: slides, error } = await supabase
            .from('carousel_slides')
            .select('id, title, subtitle, image_url, button_text, order')
            .order('order', { ascending: true });
        
        if (error) {
            console.error("❌ Erro ao carregar slides:", error);
            return [];
        }

        console.log("✅ Slides carregados para edição:", slides);

        return (slides || []).map((s: any) => ({
            id: s.id,
            title: s.title,
            subtitle: s.subtitle,
            imageUrl: s.image_url,
            buttonText: s.button_text,
            order: s.order
        }));
    } catch (e) {
        console.error("❌ Erro fetchAllCarouselSlides:", e);
        return [];
    }
}

// Salvar todos os slides
export const saveAllCarouselSlides = async (slides: CarouselSlide[]): Promise<boolean> => {
    try {
        for (const slide of slides) {
            const { error } = await supabase
                .from('carousel_slides')
                .update({
                    title: slide.title,
                    subtitle: slide.subtitle,
                    image_url: slide.imageUrl,
                    button_text: slide.buttonText,
                    order: slide.order
                })
                .eq('id', slide.id);
            
            if (error) {
                console.error("❌ Erro ao salvar slide:", error);
                return false;
            }
        }
        console.log("✅ Todos os slides salvos com sucesso");
        return true;
    } catch (e) {
        console.error("❌ Erro saveAllCarouselSlides:", e);
        return false;
    }
}

// Salvar um slide individual
export const saveCarouselSlide = async (slide: CarouselSlide): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('carousel_slides')
            .update({
                title: slide.title,
                subtitle: slide.subtitle,
                image_url: slide.imageUrl,
                button_text: slide.buttonText,
                order: slide.order
            })
            .eq('id', slide.id);
        
        if (error) {
            console.error("❌ Erro ao salvar slide:", error);
            return false;
        }
        console.log("✅ Slide salvo com sucesso");
        return true;
    } catch (e) {
        console.error("❌ Erro saveCarouselSlide:", e);
        return false;
    }
}

// --- SUPPORT ---

export interface SupportActionResult {
    success: boolean;
    error?: string;
}

export const createSupportTicket = async (
    userId: string,
    name: string,
    email: string,
    subject: string,
    message: string
): Promise<SupportActionResult> => {
    if (isOfflineNow()) {
        enqueueOfflineAction('support_ticket_create', { userId, name, email, subject, message });
        return { success: true };
    }
    try {
        const { data: ticket, error: tError } = await supabase.from('support_tickets').insert([{
            user_id: userId, user_name: name, user_email: email, subject, status: 'OPEN'
        }]).select('id').single();
        if (tError) return { success: false, error: tError.message || 'Falha ao abrir chamado.' };
        
        const { error: mError } = await supabase.from('support_messages').insert([{
            ticket_id: ticket.id, sender_id: userId, sender_name: name, sender_role: 'CUSTOMER', message
        }]);
        if (mError) return { success: false, error: mError.message || 'Chamado criado, mas a mensagem inicial falhou.' };
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Falha inesperada ao abrir chamado.' };
    }
};

export const fetchUserTickets = async (userId: string) => {
    const { data, error } = await supabase.from('support_tickets').select('id, subject, status, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) console.error('Erro fetchUserTickets:', error);
    return data || [];
};

export const fetchAllSupportTickets = async () => {
    const { data, error } = await supabase.from('support_tickets').select('id, user_name, user_email, subject, status, created_at').order('created_at', { ascending: false });
    if (error) console.error('Erro fetchAllSupportTickets:', error);
    return data || [];
};

export const fetchTicketMessages = async (ticketId: string) => {
    const { data, error } = await supabase.from('support_messages').select('id, sender_name, sender_role, message, created_at, sender_id').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    if (error) console.error('Erro fetchTicketMessages:', error);
    return data || [];
};

export const sendTicketMessage = async (
    ticketId: string,
    senderId: string,
    senderName: string,
    senderRole: string,
    message: string
): Promise<SupportActionResult> => {
    if (isOfflineNow()) {
        enqueueOfflineAction('support_message_send', { ticketId, senderId, senderName, senderRole, message });
        return { success: true };
    }
    const { error } = await supabase.from('support_messages').insert([{
        ticket_id: ticketId, sender_id: senderId, sender_name: senderName, sender_role: senderRole, message
    }]);
    if (error) return { success: false, error: error.message || 'Falha ao enviar mensagem.' };

    // Quando o admin responde, dispara notificação imediata para o cliente.
    if (senderRole === 'ADMIN') {
        try {
            const { data: ticket } = await supabase
                .from('support_tickets')
                .select('user_id')
                .eq('id', ticketId)
                .maybeSingle();

            if (ticket?.user_id) {
                await supabase.functions.invoke('push-dispatch', {
                    body: {
                        singleUserId: ticket.user_id,
                        title: 'SUPORTE RESPONDEU',
                        message: 'Recebeste uma nova resposta no teu atendimento.',
                        type: 'SUPPORT_REPLY',
                        page: 'support',
                        persistNotification: true
                    }
                });
            }
        } catch (e) {
            console.warn('Falha ao acionar push de suporte:', e);
        }
    }

    return { success: true };
};

export const updateTicketStatus = async (ticketId: string, status: string): Promise<SupportActionResult> => {
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
    if (error) return { success: false, error: error.message || 'Falha ao atualizar status do chamado.' };
    return { success: true };
};

// --- MARKETING ---

export const updateCarouselSlide = async (slide: CarouselSlide) => {
    const { error } = await supabase.from('carousel_slides').update({
        title: slide.title, subtitle: slide.subtitle, image_url: slide.imageUrl, button_text: slide.buttonText, order: slide.order
    }).eq('id', slide.id);
    return { success: !error };
};

export const addCarouselSlide = async (slide: Omit<CarouselSlide, 'id'>) => {
    const { error } = await supabase.from('carousel_slides').insert([{
        title: slide.title, subtitle: slide.subtitle, image_url: slide.imageUrl, button_text: slide.buttonText, order: slide.order
    }]);
    return !error;
};

export const addPartner = async (name: string, logoUrl: string) => {
    const { error } = await supabase.from('partners').insert([{ name, logo_url: logoUrl, active: true }]);
    return !error;
};

export const deletePartner = async (id: string) => {
    const { error } = await supabase.from('partners').delete().eq('id', id);
    return !error;
};

// --- SYSTEM ---

export interface NotificationDispatchResult {
    success: boolean;
    error?: string;
    details?: any;
}

const extractEdgeInvokeError = async (error: any): Promise<string> => {
    const fallback = error?.message || 'Erro ao chamar edge function.';
    try {
        const response = error?.context;
        if (!response) return fallback;

        const body = await response.clone().json().catch(async () => {
            const text = await response.clone().text().catch(() => '');
            return text ? { error: text } : null;
        });

        const detailed =
            body?.error ||
            body?.details ||
            body?.reason ||
            body?.message ||
            body?.msg;

        if (!detailed) return fallback;
        return String(detailed);
    } catch {
        return fallback;
    }
};

const isJwtEdgeError = (message: string): boolean => {
    const msg = String(message || '').toLowerCase();
    return (
        msg.includes('invalid jwt') ||
        msg.includes('jwt') ||
        msg.includes('unauthorized') ||
        msg.includes('token') && msg.includes('invalid')
    );
};

const invokePushDispatchWithAutoRefresh = async (
    body: Record<string, unknown>
): Promise<{ data: any; error: string | null }> => {
    const { data: firstSessionData } = await supabase.auth.getSession();
    const firstToken = firstSessionData?.session?.access_token;
    if (!firstToken) {
        return { data: null, error: 'Sessao expirada. Entre novamente para enviar comunicados.' };
    }

    const first = await supabase.functions.invoke('push-dispatch', {
        body,
        headers: { Authorization: `Bearer ${firstToken}` }
    });

    if (!first.error) {
        return { data: first.data, error: null };
    }

    const firstErrText = await extractEdgeInvokeError(first.error);
    if (!isJwtEdgeError(firstErrText)) {
        return { data: null, error: firstErrText };
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    const refreshedToken = refreshed?.session?.access_token;
    if (!refreshedToken) {
        return { data: null, error: 'Sessao expirada. Entre novamente para enviar comunicados.' };
    }

    const second = await supabase.functions.invoke('push-dispatch', {
        body,
        headers: { Authorization: `Bearer ${refreshedToken}` }
    });

    if (!second.error) {
        return { data: second.data, error: null };
    }

    return { data: null, error: await extractEdgeInvokeError(second.error) };
};

export const sendSystemNotification = async (
    target: 'ALL' | 'CUSTOMER' | 'PHARMACY',
    title: string,
    message: string
): Promise<NotificationDispatchResult> => {
    try {
        const body = {
            title,
            message,
            type: 'SYSTEM',
            target,
            page: target === 'PHARMACY' ? 'pharmacy-orders' : 'home',
            persistNotification: true
        };
        const { data, error } = await invokePushDispatchWithAutoRefresh(body);
        if (error) return { success: false, error };
        if (!data?.success) return { success: false, error: data?.error || data?.reason || 'Push não enviado.', details: data };
        return { success: true, details: data };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Falha inesperada ao enviar comunicado.' };
    }
};

export const sendSystemNotificationToUser = async (
    userId: string,
    title: string,
    message: string,
    page: string = 'home'
): Promise<NotificationDispatchResult> => {
    try {
        if (!userId || !title.trim() || !message.trim()) {
            return { success: false, error: 'Destinatário, assunto e mensagem são obrigatórios.' };
        }

        const body = {
            singleUserId: userId,
            title: title.trim(),
            message: message.trim(),
            type: 'SYSTEM',
            page,
            persistNotification: true
        };
        const { data, error } = await invokePushDispatchWithAutoRefresh(body);
        if (error) return { success: false, error };
        if (!data?.success) return { success: false, error: data?.error || data?.reason || 'Push não enviado.', details: data };
        return { success: true, details: data };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Falha inesperada ao enviar comunicado.' };
    }
};

export interface NotificationRecipient {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}

export const fetchNotificationRecipients = async (
    role?: 'CUSTOMER' | 'PHARMACY' | 'ADMIN',
    searchTerm?: string
): Promise<NotificationRecipient[]> => {
    try {
        let query = supabase
            .from('profiles')
            .select('id, name, email, role')
            .order('name', { ascending: true })
            .limit(500);

        if (role) query = query.eq('role', role);
        const normalizedSearch = String(searchTerm || '').trim().replace(/[%_,]/g, ' ');
        if (normalizedSearch) {
            query = query.or(`name.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%`);
        }

        const { data, error } = await query;
        if (error) return [];

        return (data || [])
            .filter((p: any) => !!p?.id)
            .map((p: any) => ({
                id: p.id,
                name: p.name || 'Sem nome',
                email: p.email || '',
                role: p.role
            }));
    } catch {
        return [];
    }
};

// --- CACHE PARA RELATÓRIOS FINANCEIROS ---
const FINANCIAL_CACHE_KEY = 'farmolink_financial_report';
export const DEFAULT_FINANCIAL_SETTLEMENT_CYCLE: SettlementCycle = 'MONTHLY';

export const getCachedFinancialReport = (): any[] | null => {
    return null;
};

export const setCachedFinancialReport = (_data: any[]) => {
    try {
        localStorage.removeItem(FINANCIAL_CACHE_KEY);
    } catch (e) { console.error("Erro cache financeiro", e); }
};

export const fetchFinancialSettlementCycle = async (): Promise<SettlementCycle> => {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('config_value')
            .eq('config_key', 'financial_settlement_cycle')
            .maybeSingle();

        if (error) {
            console.error("Erro ao carregar ciclo financeiro:", error);
            return DEFAULT_FINANCIAL_SETTLEMENT_CYCLE;
        }

        return data?.config_value === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY';
    } catch (e) {
        console.error("Erro fetchFinancialSettlementCycle:", e);
        return DEFAULT_FINANCIAL_SETTLEMENT_CYCLE;
    }
};

export const saveFinancialSettlementCycle = async (cycle: SettlementCycle): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('system_config')
            .upsert([{
                config_key: 'financial_settlement_cycle',
                config_value: cycle,
                config_type: 'text',
                description: 'Periodicidade de liquidacao financeira (MONTHLY|WEEKLY)',
                updated_at: new Date().toISOString()
            }], { onConflict: 'config_key' });

        if (error) {
            console.error("Erro ao salvar ciclo financeiro:", error);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Erro saveFinancialSettlementCycle:", e);
        return false;
    }
};

export const resetCommissionDebtByAdmin = async (pharmacyId?: string): Promise<{ success: boolean, updatedCount: number, error?: string }> => {
    try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('reset_commission_debt_admin', {
            target_pharmacy_id: pharmacyId || null
        } as any);

        if (rpcError) {
            const rpcCode = (rpcError as any)?.code;
            const rpcMsg = (rpcError as any)?.message || '';
            const missingFn = rpcCode === '42883' || rpcCode === 'PGRST202' || rpcMsg.includes('reset_commission_debt_admin');
            if (missingFn) {
                return {
                    success: false,
                    updatedCount: 0,
                    error: 'Funcao reset_commission_debt_admin ausente no banco. Execute o database_setup.txt atualizado.'
                };
            }
            return { success: false, updatedCount: 0, error: rpcMsg || 'Falha ao executar reset financeiro.' };
        }

        localStorage.removeItem(FINANCIAL_CACHE_KEY);
        return { success: true, updatedCount: Number(rpcData || 0) };
    } catch (e) {
        console.error("Erro resetCommissionDebtByAdmin:", e);
        return { success: false, updatedCount: 0, error: 'Falha inesperada ao resetar dividas.' };
    }
};

export const updateCommissionStatusForPeriodByAdmin = async (
    pharmacyId: string,
    periodKey: string,
    cycle: SettlementCycle,
    status: 'PAID' | 'PENDING' = 'PAID'
): Promise<{ success: boolean, updatedCount: number, error?: string }> => {
    if (status === 'PENDING') {
        return { success: false, updatedCount: 0, error: 'Use resetCommissionDebtByAdmin para reset de dívida.' };
    }
    const result = await applyCommissionPaymentByPeriodByAdmin(pharmacyId, periodKey, cycle);
    return { success: result.success, updatedCount: result.updatedCount, error: result.error };
};

// --- ADMIN BANNERS (v1.4) ---

export const fetchAdminBanners = async (): Promise<any[]> => {
    try {
        const { data, error } = await supabase
            .from('admin_banners')
            .select('id, title, subtitle, image_url, button_text, button_action, "order", is_active')
            .eq('is_active', true)
            .order('"order"', { ascending: true });
        
        if (error) {
            console.error("❌ Erro ao carregar banners ativos:", error);
            return [];
        }

        console.log("✅ Banners ativos carregados:", data);

        return (data || []).map((b: any) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            image: b.image_url,
            ctaText: b.button_text || 'Ver Mais',
            ctaAction: b.button_action || 'pharmacies-list',
            order: b.order,
            active: b.is_active
        }));
    } catch (e) {
        console.error("❌ Erro fetchAdminBanners:", e);
        return [];
    }
};

export const fetchAllAdminBanners = async (): Promise<any[]> => {
    try {
        const { data, error } = await supabase
            .from('admin_banners')
            .select('*')
            .order('"order"', { ascending: true });
        
        if (error) {
            console.error("❌ Erro ao carregar todos os banners:", error);
            return [];
        }

        console.log("✅ Banners carregados do BD:", data);

        return (data || []).map((b: any) => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            image: b.image_url,
            ctaText: b.button_text || 'Ver Mais',
            ctaAction: b.button_action || 'pharmacies-list',
            order: b.order,
            active: b.is_active
        }));
    } catch (e) {
        console.error("❌ Erro fetchAllAdminBanners:", e);
        return [];
    }
};

export const saveAdminBanner = async (banner: any): Promise<boolean> => {
    try {
        const data = {
            id: banner.id,
            title: banner.title,
            subtitle: banner.subtitle,
            image_url: banner.image,
            button_text: banner.ctaText,
            button_action: banner.ctaAction || 'pharmacies-list',
            "order": banner.order !== undefined ? banner.order : 1,
            is_active: banner.active !== false,
            updated_at: new Date().toISOString()
        };

        console.log("📤 Salvando banner individual:", data);

        const { error } = await supabase
            .from('admin_banners')
            .upsert([data]);

        if (error) {
            console.error("❌ Erro ao salvar banner:", error);
            return false;
        }
        console.log("✅ Banner salvo com sucesso!");
        return true;
    } catch (e) {
        console.error("❌ Erro saveAdminBanner:", e);
        return false;
    }
};

export const saveAllAdminBanners = async (banners: any[]): Promise<boolean> => {
    try {
        const batch = banners.map(b => ({
            id: b.id,
            title: b.title,
            subtitle: b.subtitle,
            image_url: b.image,
            button_text: b.ctaText,
            button_action: b.ctaAction || 'pharmacies-list',
            "order": b.order !== undefined ? b.order : 1,
            is_active: b.active !== false,
            updated_at: new Date().toISOString()
        }));

        console.log("📤 Salvando banners no Supabase:", batch);

        const { error } = await supabase
            .from('admin_banners')
            .upsert(batch);

        if (error) {
            console.error("❌ Erro ao salvar banners:", error);
            return false;
        }
        console.log("✅ Banners salvos com sucesso!");
        return true;
    } catch (e) {
        console.error("❌ Erro saveAllAdminBanners:", e);
        return false;
    }
};

export const deleteAdminBanner = async (id: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('admin_banners')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Erro ao deletar banner:", error);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Erro deleteAdminBanner:", e);
        return false;
    }
};

// --- ADMIN FAQ (v1.4) ---

export const fetchAdminFaq = async (): Promise<any[]> => {
    try {
        const { data, error } = await supabase
            .from('admin_faq')
            .select('id, question, answer, "order", is_active')
            .eq('is_active', true)
            .order('"order"', { ascending: true });
        
        if (error) {
            console.error("Erro ao carregar FAQ:", error);
            return [];
        }

        return (data || []).map((f: any) => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            order: f.order
        }));
    } catch (e) {
        console.error("Erro fetchAdminFaq:", e);
        return [];
    }
};

export const saveAdminFaq = async (faqs: any[]): Promise<boolean> => {
    try {
        const batch = faqs.map((f, idx) => ({
            id: f.id || `faq-${Date.now()}-${idx}`,
            question: f.question,
            answer: f.answer,
            order: idx + 1,
            is_active: true,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('admin_faq')
            .upsert(batch);

        if (error) {
            console.error("Erro ao salvar FAQ:", error);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Erro saveAdminFaq:", e);
        return false;
    }
};

// --- ADMIN ABOUT (v1.4) ---

export const fetchAdminAbout = async (): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('admin_about')
            .select('*')
            .eq('is_active', true)
            .order('"order"', { ascending: true });
        
        if (error) {
            console.error("Erro ao carregar About:", error);
            return null;
        }

        const items = data || [];
        return {
            mission: items.find((i: any) => i.section_type === 'mission')?.content || '',
            innovation: items.find((i: any) => i.section_type === 'innovation')?.content || '',
            values: items.filter((i: any) => i.section_type === 'value').map((v: any) => ({
                icon: v.icon_emoji,
                title: v.title,
                desc: v.content
            }))
        };
    } catch (e) {
        console.error("Erro fetchAdminAbout:", e);
        return null;
    }
};

export const saveAdminAbout = async (about: any): Promise<boolean> => {
    try {
        const batch = [
            {
                id: `about-mission-${Date.now()}`,
                section_type: 'mission',
                title: 'Nossa Missão',
                content: about.mission,
                order: 1,
                is_active: true,
                updated_at: new Date().toISOString()
            },
            {
                id: `about-innovation-${Date.now()}`,
                section_type: 'innovation',
                title: 'Inovação Local',
                content: about.innovation,
                order: 2,
                is_active: true,
                updated_at: new Date().toISOString()
            },
            ...about.values.map((v: any, idx: number) => ({
                id: `about-value-${idx}-${Date.now()}`,
                section_type: 'value',
                title: v.title,
                content: v.desc,
                icon_emoji: v.icon,
                order: 3 + idx,
                is_active: true,
                updated_at: new Date().toISOString()
            }))
        ];

        const { error } = await supabase
            .from('admin_about')
            .upsert(batch);

        if (error) {
            console.error("Erro ao salvar About:", error);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Erro saveAdminAbout:", e);
        return false;
    }
};

// --- LEGAL DOCS (TERMOS + POLITICA) ---
export const fetchLegalContent = async (): Promise<LegalContent> => {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('config_key, config_value')
            .in('config_key', ['legal_terms_of_use', 'legal_privacy_policy', 'legal_updated_at']);

        if (error) {
            console.error("Erro ao carregar conteudo legal:", error);
            return {
                termsOfUse: DEFAULT_TERMS_OF_USE_TEXT,
                privacyPolicy: DEFAULT_PRIVACY_POLICY_TEXT,
                updatedAt: DEFAULT_LEGAL_UPDATED_AT
            };
        }

        const map = Object.fromEntries((data || []).map((item: any) => [item.config_key, item.config_value]));
        const normalizeLegalValue = (value: unknown, fallback: string) => {
            const text = typeof value === 'string' ? value.trim() : '';
            return text.length > 0 ? text : fallback;
        };

        return {
            termsOfUse: normalizeLegalValue(map.legal_terms_of_use, DEFAULT_TERMS_OF_USE_TEXT),
            privacyPolicy: normalizeLegalValue(map.legal_privacy_policy, DEFAULT_PRIVACY_POLICY_TEXT),
            updatedAt: normalizeLegalValue(map.legal_updated_at, DEFAULT_LEGAL_UPDATED_AT)
        };
    } catch (e) {
        console.error("Erro fetchLegalContent:", e);
        return {
            termsOfUse: DEFAULT_TERMS_OF_USE_TEXT,
            privacyPolicy: DEFAULT_PRIVACY_POLICY_TEXT,
            updatedAt: DEFAULT_LEGAL_UPDATED_AT
        };
    }
};

export const saveLegalContent = async (legal: LegalContent): Promise<boolean> => {
    try {
        const payload = [
            {
                config_key: 'legal_terms_of_use',
                config_value: legal.termsOfUse,
                config_type: 'text',
                description: 'Texto dos Termos de Uso',
                updated_at: new Date().toISOString()
            },
            {
                config_key: 'legal_privacy_policy',
                config_value: legal.privacyPolicy,
                config_type: 'text',
                description: 'Texto da Politica de Privacidade',
                updated_at: new Date().toISOString()
            },
            {
                config_key: 'legal_updated_at',
                config_value: legal.updatedAt || DEFAULT_LEGAL_UPDATED_AT,
                config_type: 'text',
                description: 'Data da ultima atualizacao legal (YYYY-MM-DD)',
                updated_at: new Date().toISOString()
            }
        ];

        const { error } = await supabase
            .from('system_config')
            .upsert(payload, { onConflict: 'config_key' });

        if (error) {
            console.error("Erro ao salvar conteudo legal:", error);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Erro saveLegalContent:", e);
        return false;
    }
};

export interface FinancialLedgerEntry {
    id: string;
    orderId: string | null;
    pharmacyId: string | null;
    periodKey: string | null;
    cycle: string;
    operationType: string;
    note: string | null;
    appliedAmount: number;
    beforePaidAmount: number;
    afterPaidAmount: number;
    beforeStatus: string | null;
    afterStatus: string | null;
    createdBy: string | null;
    createdAt: string;
}

export const fetchFinancialLedgerEntries = async (opts?: {
    pharmacyId?: string;
    limit?: number;
}): Promise<FinancialLedgerEntry[]> => {
    try {
        const limit = opts?.limit ?? 150;
        let query = supabase
            .from('financial_ledger')
            .select('id, order_id, pharmacy_id, period_key, cycle, operation_type, note, applied_amount, before_paid_amount, after_paid_amount, before_status, after_status, created_by, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (opts?.pharmacyId) {
            query = query.eq('pharmacy_id', opts.pharmacyId);
        }

        const { data, error } = await query;
        if (error) {
            const code = (error as any)?.code;
            if (code === '42P01' || code === '42703') return [];
            console.error("Erro ao carregar ledger financeiro:", error);
            return [];
        }

        return (data || []).map((row: any) => ({
            id: row.id,
            orderId: row.order_id || null,
            pharmacyId: row.pharmacy_id || null,
            periodKey: row.period_key || null,
            cycle: row.cycle || 'MONTHLY',
            operationType: row.operation_type || 'SETTLEMENT',
            note: row.note || null,
            appliedAmount: Number(row.applied_amount || 0),
            beforePaidAmount: Number(row.before_paid_amount || 0),
            afterPaidAmount: Number(row.after_paid_amount || 0),
            beforeStatus: row.before_status || null,
            afterStatus: row.after_status || null,
            createdBy: row.created_by || null,
            createdAt: row.created_at
        }));
    } catch (e) {
        console.error("Erro fetchFinancialLedgerEntries:", e);
        return [];
    }
};

export const applyCommissionPaymentByPeriodByAdmin = async (
    pharmacyId: string,
    periodKey: string,
    cycle: SettlementCycle,
    paymentAmount?: number
): Promise<{ success: boolean, updatedCount: number, appliedAmount: number, remainingAmount: number, error?: string }> => {
    try {
        const payload = {
            p_pharmacy_id: pharmacyId,
            p_period_key: periodKey,
            p_cycle: cycle,
            p_payment_amount: paymentAmount && paymentAmount > 0 ? paymentAmount : null,
            p_note: 'Liquidacao registada pelo painel admin'
        };

        const { data, error } = await supabase.rpc('apply_commission_payment_by_period_admin', payload as any);
        if (error) {
            const errCode = (error as any)?.code;
            const errMsg = (error as any)?.message || '';
            const missingFn =
                errCode === '42883' ||
                errCode === 'PGRST202' ||
                errMsg.includes('apply_commission_payment_by_period_admin');
            if (missingFn) {
                return {
                    success: false,
                    updatedCount: 0,
                    appliedAmount: 0,
                    remainingAmount: paymentAmount && paymentAmount > 0 ? paymentAmount : 0,
                    error: 'Funcao apply_commission_payment_by_period_admin ausente no banco. Execute o database_setup.txt atualizado.'
                };
            }
            return {
                success: false,
                updatedCount: 0,
                appliedAmount: 0,
                remainingAmount: paymentAmount && paymentAmount > 0 ? paymentAmount : 0,
                error: errMsg || 'Falha ao executar liquidacao financeira.'
            };
        }

        const row = Array.isArray(data) ? data[0] : null;
        localStorage.removeItem(FINANCIAL_CACHE_KEY);
        return {
            success: true,
            updatedCount: Number((row as any)?.updated_count || 0),
            appliedAmount: Number((row as any)?.applied_amount || 0),
            remainingAmount: Number((row as any)?.remaining_amount || 0)
        };
    } catch (e) {
        console.error("Erro applyCommissionPaymentByPeriodByAdmin RPC:", e);
        return {
            success: false,
            updatedCount: 0,
            appliedAmount: 0,
            remainingAmount: paymentAmount && paymentAmount > 0 ? paymentAmount : 0,
            error: 'Falha inesperada ao executar liquidacao.'
        };
    }
};

export interface SupportContact {
    whatsappNumber: string;
    whatsappUrl: string;
}

const DEFAULT_SUPPORT_WHATSAPP = '244936793706';

const normalizePhoneForWa = (raw: string): string => (raw || '').replace(/\D/g, '');

export const fetchSupportContact = async (): Promise<SupportContact> => {
    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('config_value')
            .eq('config_key', 'support_whatsapp')
            .maybeSingle();

        const number = normalizePhoneForWa(data?.config_value || DEFAULT_SUPPORT_WHATSAPP) || DEFAULT_SUPPORT_WHATSAPP;
        return {
            whatsappNumber: number,
            whatsappUrl: `https://wa.me/${number}`
        };
    } catch {
        const number = DEFAULT_SUPPORT_WHATSAPP;
        return {
            whatsappNumber: number,
            whatsappUrl: `https://wa.me/${number}`
        };
    }
};

export const openSupportWhatsApp = async (message?: string): Promise<boolean> => {
    try {
        const contact = await fetchSupportContact();
        const url = message
            ? `${contact.whatsappUrl}?text=${encodeURIComponent(message)}`
            : contact.whatsappUrl;
        window.open(url, '_blank');
        return true;
    } catch {
        return false;
    }
};


