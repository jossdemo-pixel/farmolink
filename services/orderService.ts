
import { supabase, safeQuery } from './supabaseClient';
import { Order, OrderStatus, PrescriptionRequest, PrescriptionQuote, QuotedItem, UserRole, PrescriptionStatus, User } from '../types';

const safeJsonParse = (data: any): any[] => {
    try {
        if (data === null || data === undefined) return [];
        if (Array.isArray(data)) return data;
        if (typeof data === 'object' && data !== null) return [data];
        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (!trimmed || trimmed === 'null' || trimmed === '[object Object]') return [];
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [parsed];
        }
    } catch (e) { console.warn("Falha no parse:", e); }
    return [];
};

/**
 * Gera um hash simples para identificar imagens duplicadas
 */
const generateImageHash = (url: string): string => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
};

const checkPrescriptionDuplicate = async (customerId: string, imageUrl: string): Promise<boolean> => {
    const hash = generateImageHash(imageUrl);
    const { data } = await supabase
        .from('prescriptions')
        .select('id')
        .eq('customer_id', customerId)
        .eq('image_hash', hash)
        .neq('status', 'CANCELLED')
        .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);
    return (data?.length || 0) > 0;
};

const getCommissionRateForPharmacy = async (pharmacyId: string): Promise<number> => {
    try {
        const { data } = await supabase
            .from('pharmacies')
            .select('commission_rate')
            .eq('id', pharmacyId)
            .maybeSingle();

        const rate = Number(data?.commission_rate);
        if (!Number.isFinite(rate)) return 10;
        return Math.max(0, Math.min(100, rate));
    } catch {
        return 10;
    }
};

export const createPrescriptionRequest = async (
    customerId: string, 
    imageUrl: string, 
    pharmacyIds: string[], 
    notes?: string,
    aiMetadata?: PrescriptionRequest['ai_metadata']
): Promise<{ success: boolean; error?: string; isDuplicate?: boolean }> => {
    if (!navigator.onLine) {
        return { success: false, error: "Sem internet. Nao e possivel enviar receita offline." };
    }

    if (!imageUrl || imageUrl.startsWith('blob:')) {
        return { success: false, error: "Aguarde o carregamento da foto." };
    }

    const isDuplicate = await checkPrescriptionDuplicate(customerId, imageUrl);
    if (isDuplicate) {
        return { success: false, error: "Esta receita já foi enviada e está a ser tratada.", isDuplicate: true };
    }

    let finalStatus: PrescriptionStatus = 'WAITING_FOR_QUOTES';
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    const cleanTargets = Array.isArray(pharmacyIds) ? pharmacyIds : [];

    const { error } = await supabase.from('prescriptions').insert([{
        customer_id: customerId, 
        image_url: imageUrl, 
        image_hash: generateImageHash(imageUrl),
        notes: notes || (cleanTargets.length > 0 ? 'Pedido Manual' : 'Análise por IA'), 
        status: finalStatus, 
        target_pharmacies: cleanTargets, 
        ai_metadata: aiMetadata || { confidence: 1, extracted_text: 'Envio Manual', is_validated: true, suggested_items: [] },
        expires_at: expiresAt.toISOString()
    }]);
    
    if (error) {
        console.error("Erro insert RX:", error);
        return { success: false, error: "Erro ao guardar no sistema. Tente de novo." };
    }
    return { success: true };
};

export const deletePrescriptionRequest = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('prescriptions').delete().eq('id', id);
    return !error;
};

export const fetchPrescriptionRequests = async (role: UserRole, userId?: string, pharmacyId?: string, page = 0, pageSize = 50): Promise<PrescriptionRequest[]> => {
    const rxSelect = `
        id, customer_id, image_url, notes, status, target_pharmacies, ai_metadata, created_at, expires_at,
        quotes:prescription_quotes(id, pharmacy_id, pharmacy_name, items, total, delivery_fee, status, created_at)
    `;

    const rawData = await safeQuery(async () => {
        if (role === UserRole.CUSTOMER && userId) {
            const { data } = await supabase.from('prescriptions')
                .select(rxSelect)
                .eq('customer_id', userId)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);
            return data;
        } 
        
        if (role === UserRole.PHARMACY && pharmacyId) {
            // Primeiro, busca receitas da farmácia sem limite pesado
            const { data: allRequests } = await supabase
                .from('prescriptions')
                .select(rxSelect)
                .in('status', ['WAITING_FOR_QUOTES', 'UNDER_REVIEW', 'ILLEGIBLE', 'COMPLETED'])
                .order('created_at', { ascending: false })
                .limit(200); 

            if (!allRequests) return [];

            // Filtra localmente para evitar queries extras
            const filtered = allRequests.filter((r: any) => {
                const targets = safeJsonParse(r.target_pharmacies);
                const isTargeted = Array.isArray(targets) && targets.includes(pharmacyId);
                const hasMyQuote = r.quotes?.some((q: any) => q.pharmacy_id === pharmacyId);
                const isRejectedByMe = r.status === 'ILLEGIBLE' && r.ai_metadata?.validated_by === pharmacyId;

                return isTargeted || hasMyQuote || isRejectedByMe;
            });

            // Aplica paginação local
            return filtered.slice(page * pageSize, (page + 1) * pageSize);
        }
        return [];
    });

    const now = Date.now();

    return (rawData || []).map((r: any) => {
        const rawStatus = r.status as PrescriptionStatus;
        let finalStatus = rawStatus;

        if (r.expires_at) {
            const expTime = new Date(r.expires_at).getTime();
            if (
                expTime < now &&
                rawStatus !== 'COMPLETED' &&
                rawStatus !== 'CANCELLED' &&
                rawStatus !== 'ILLEGIBLE'
            ) {
                finalStatus = 'EXPIRED';
            }
        }

        return {
            id: r.id,
            customerId: r.customer_id,
            imageUrl: r.image_url,
            date: new Date(r.created_at).toLocaleString('pt-AO'),
            status: finalStatus,
            targetPharmacies: safeJsonParse(r.target_pharmacies),
            notes: r.notes || '',
            ai_metadata: r.ai_metadata || null,
            expires_at: r.expires_at,
            quotes: (r.quotes || []).map((q: any) => ({
                id: q.id,
                prescriptionId: q.prescription_id,
                pharmacyId: q.pharmacy_id,
                pharmacyName: q.pharmacy_name,
                items: safeJsonParse(q.items),
                totalPrice: q.total || 0,
                deliveryFee: q.delivery_fee || 0,
                status: q.status,
                createdAt: q.created_at
            }))
        };
    });
};

export const validatePrescriptionAI = async (
    prescriptionId: string,
    pharmacyId: string,
    items: { name: string, quantity: number }[],
    isIllegible: boolean = false,
    customNotes?: string
): Promise<boolean> => {
    try {
        const updateData: any = { triaged_at: new Date().toISOString() };
        if (isIllegible) {
            updateData.status = 'ILLEGIBLE';
            updateData.notes = customNotes || 'Letra Ilegível: Sinalizado por um Farmacêutico.';
            updateData.ai_metadata = { validated_by: pharmacyId, is_validated: true, extracted_text: customNotes || "Ilegível" };
        } else {
            updateData.status = 'WAITING_FOR_QUOTES';
            updateData.ai_metadata = { is_validated: true, validated_by: pharmacyId, suggested_items: items, confidence: 1.0 };
        }
        const { error } = await supabase.from('prescriptions').update(updateData).eq('id', prescriptionId);
        return !error;
    } catch (e) { return false; }
};

export const sendPrescriptionQuote = async (
    prescriptionId: string,
    pharmacyId: string,
    pharmacyName: string,
    items: QuotedItem[],
    deliveryFee: number,
    notes?: string
): Promise<boolean> => {
    const totalPrice = items.reduce((acc, it) => acc + (Number(it.price) * Number(it.quantity || 1)), 0);
    const { error: quoteError } = await supabase.from('prescription_quotes').insert([{
        prescription_id: prescriptionId, pharmacy_id: pharmacyId, pharmacy_name: pharmacyName,
        items: items || [], total: totalPrice, delivery_fee: Number(deliveryFee),
        status: 'RESPONDED', notes: notes || ''
    }]);

    if (quoteError) return false;
    await supabase.from('prescriptions').update({ status: 'WAITING_FOR_QUOTES' }).eq('id', prescriptionId).neq('status', 'COMPLETED');
    return true;
};

export const acceptQuoteAndCreateOrder = async (
    quote: PrescriptionQuote,
    customer: User,
    prescriptionId: string,
    isDelivery: boolean
): Promise<{ success: boolean; error?: string }> => {
    try {
        const commissionRate = await getCommissionRateForPharmacy(quote.pharmacyId);
        const commissionAmount = Number(quote.totalPrice) * (commissionRate / 100);

        // AUTONOMIA TOTAL: O pedido é criado com os itens snapshots da cotação.
        // Se o ID for 'rx-...', o trigger do banco apenas ignorará o desconto de stock.
        const orderPayload = {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_phone: customer.phone,
            pharmacy_id: quote.pharmacyId,
            total: Number(quote.totalPrice),
            status: OrderStatus.PENDING, 
            type: isDelivery ? 'DELIVERY' : 'PICKUP',
            address: isDelivery ? (customer.address || 'Luanda') : 'Levantamento na Loja',
            items: quote.items.map(i => ({
                id: i.productId || `rx-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                name: i.name,
                price: Number(i.price),
                quantity: Number(i.quantity),
                pharmacyId: quote.pharmacyId,
                image: 'https://cdn-icons-png.flaticon.com/512/883/883407.png'
            })),
            commission_amount: commissionAmount,
            commission_status: 'PENDING'
        };

        const { error: orderError } = await supabase.from('orders').insert([orderPayload]);
        if (orderError) throw orderError;

        await supabase.from('prescriptions').update({ status: 'COMPLETED' }).eq('id', prescriptionId);
        await supabase.from('prescription_quotes').update({ status: 'ACCEPTED' }).eq('id', quote.id);

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
};

export const createOrder = async (order: Omit<Order, 'id' | 'date'>): Promise<{ success: boolean; error?: string }> => {
  if (!navigator.onLine) {
    return { success: false, error: "Sem internet. Nao e possivel finalizar pedido offline." };
  }
  try {
    const commissionRate = await getCommissionRateForPharmacy(order.pharmacyId);
    const commissionAmount = order.total * (commissionRate / 100);
    const payload: Record<string, unknown> = {
      customer_name: order.customerName, customer_phone: order.customerPhone, items: order.items,
      total: order.total, status: order.status, type: order.type, pharmacy_id: order.pharmacyId,
      address: order.address, commission_amount: commissionAmount, commission_status: 'PENDING'
    };
    if (order.customerId) payload.customer_id = order.customerId;
    const { error } = await supabase.from('orders').insert([payload]);
    return { success: !error };
  } catch { return { success: false, error: "Falha ao fechar pedido." }; }
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<boolean> => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    return !error;
};

export const rejectOrderAndRestoreStock = async (
    orderId: string
): Promise<{ success: boolean; error?: string }> => {
    const updated = await updateOrderStatus(orderId, OrderStatus.REJECTED);
    if (!updated) return { success: false, error: 'Falha ao recusar pedido.' };
    return { success: true };
};

export const fetchOrders = async (pharmacyId?: string, customerId?: string): Promise<Order[]> => {
    const res = await safeQuery(async () => {
        let query = supabase.from('orders').select('*');
        if (pharmacyId) query = query.eq('pharmacy_id', pharmacyId);
        if (customerId) query = query.eq('customer_id', customerId);
        return query.order('created_at', { ascending: false });
    });
    return (res?.data || []).map((o: any) => ({
        id: o.id, customerId: o.customer_id, customerName: o.customer_name, customerPhone: o.customer_phone,
        items: safeJsonParse(o.items), total: Number(o.total), status: o.status,
        date: new Date(o.created_at).toLocaleString('pt-AO'), type: o.type,
        pharmacyId: o.pharmacy_id, address: o.address,
        createdAt: o.created_at,
        commissionAmount: Number(o.commission_amount),
        commissionStatus: o.commission_status,
        commissionPaidAmount: Number(o.commission_paid_amount || 0)
    }));
};
