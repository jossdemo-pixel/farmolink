
import { supabase, safeQuery } from './supabaseClient';
import { Pharmacy, PharmacyInput, PharmacyFinancials, User, OrderStatus, CommissionStatus } from '../types';

const normalizeOrderStatus = (status?: string) =>
  (status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const isCompletedOrder = (status?: string) => {
  const s = normalizeOrderStatus(status);
  return s === 'CONCLUIDO' || s === 'COMPLETED';
};

export const recoverPharmacyLink = async (user: User): Promise<string | null> => {
    try {
        const { data: existing } = await supabase.from('pharmacies').select('id').eq('owner_email', user.email).maybeSingle();
        let pharmId = existing?.id;
        if (!pharmId) {
             const { data: newPharm, error: createError } = await supabase.from('pharmacies').insert([{
                name: `Farmácia de ${user.name}`,
                status: 'PENDING',
                owner_email: user.email,
                is_available: false,
                delivery_active: true,
                address: 'Pendente de Configuração',
                rating: 5.0,
                delivery_fee: 600,
                min_time: '35 min',
                commission_rate: 10
            }]).select().single();
            if (createError) throw createError;
            pharmId = newPharm?.id;
        }
        if (pharmId) {
            await supabase.from('profiles').update({ pharmacy_id: pharmId }).eq('id', user.id);
            return pharmId;
        }
        return null;
    } catch (e) { return null; }
}

export const fetchPharmacies = async (isAdmin: boolean = false): Promise<Pharmacy[]> => {
  const res = await safeQuery(async () => {
    let query = supabase.from('pharmacies').select('*');
    if (!isAdmin) query = query.eq('status', 'APPROVED');
    return query;
  });

  return (res?.data || []).map((p: any) => ({
    id: p.id, 
    name: p.name, 
    nif: p.nif, 
    address: p.address || 'Pendente',
    rating: Number(p.rating), 
    deliveryFee: Number(p.delivery_fee), 
    minTime: p.min_time,
    isAvailable: !!p.is_available,
    deliveryActive: !!(p.delivery_active ?? true), 
    status: p.status, 
    ownerEmail: p.owner_email,
    commissionRate: p.commission_rate, 
    phone: p.phone, 
    distance: 'N/A',
    review_score: p.review_score,
    receives_low_conf_rx: p.receives_low_conf_rx,
    logoUrl: p.logo_url,
    description: p.description,
    openingHours: p.opening_hours,
    paymentMethods: Array.isArray(p.payment_methods) ? p.payment_methods : [],
    instagram: p.instagram,
    latitude: Number.isFinite(Number(p.latitude)) ? Number(p.latitude) : undefined,
    longitude: Number.isFinite(Number(p.longitude)) ? Number(p.longitude) : undefined
  }));
};

export const fetchPharmacyById = async (id: string): Promise<Pharmacy | null> => {
  if (!id) return null;
  const res = await safeQuery(async () => supabase.from('pharmacies').select('*').eq('id', id).single());
  const data = res?.data;
  if (!data) return null;
  return {
    id: data.id, 
    name: data.name, 
    nif: data.nif, 
    address: data.address || 'Pendente',
    rating: Number(data.rating), 
    deliveryFee: Number(data.delivery_fee), 
    minTime: data.min_time,
    isAvailable: !!data.is_available,
    deliveryActive: !!(data.delivery_active ?? true),
    status: data.status, 
    ownerEmail: data.owner_email,
    commissionRate: data.commission_rate, 
    phone: data.phone, 
    distance: 'N/A',
    review_score: data.review_score,
    receives_low_conf_rx: data.receives_low_conf_rx,
    logoUrl: data.logo_url,
    description: data.description,
    openingHours: data.opening_hours,
    paymentMethods: Array.isArray(data.payment_methods) ? data.payment_methods : [],
    instagram: data.instagram,
    latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : undefined,
    longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : undefined
  };
};

export const updatePharmacyDetails = async (id: string, input: PharmacyInput): Promise<boolean> => {
  const res = await safeQuery(async () => supabase.from('pharmacies').update({
    name: input.name, 
    nif: input.nif, 
    address: input.address,
    delivery_fee: input.deliveryFee, 
    min_time: input.minTime, 
    phone: input.phone,
    logo_url: input.logoUrl,
    description: input.description,
    opening_hours: input.openingHours,
    payment_methods: input.paymentMethods || [],
    instagram: input.instagram
  }).eq('id', id));
  return !!res && !res.error;
};

// FIX: Update puro sem select() para forçar gravação ignorando cache de schema
export const togglePharmacyAvailability = async (id: string, isAvailable: boolean): Promise<boolean> => {
  if (!id) return false;
  const { error } = await supabase.from('pharmacies')
      .update({ is_available: isAvailable })
      .eq('id', id);
  
  if (error) {
      console.error("ERRO GRAVAÇÃO DISPONIBILIDADE:", error.message);
      return false;
  }
  return true;
};

export const togglePharmacyDelivery = async (id: string, active: boolean): Promise<boolean> => {
  if (!id) return false;
  const { error } = await supabase.from('pharmacies')
      .update({ delivery_active: active })
      .eq('id', id);

  if (error) {
      console.error("ERRO GRAVAÇÃO DELIVERY:", error.message);
      return false;
  }
  return true;
};

export const fetchFinancialReport = async (): Promise<PharmacyFinancials[]> => {
    try {
        const { data: pharmacies } = await supabase
            .from('pharmacies')
            .select('id, name, commission_rate');
        if (!pharmacies) return [];
        const { data: orders } = await supabase
            .from('orders')
            .select('pharmacy_id, status, total, commission_amount, commission_status, commission_paid_amount');
        const allOrders = orders || [];

        return pharmacies.map((p: any) => {
            const pharmOrders = allOrders.filter((o: any) => o.pharmacy_id === p.id);
            const completedOrders = pharmOrders.filter((o: any) => isCompletedOrder(o.status));
            const pendingOrders = pharmOrders.filter((o: any) => {
                const normalized = normalizeOrderStatus(o.status);
                return !isCompletedOrder(o.status) && !normalized.includes('CANCELADO') && normalized !== 'REJEITADO';
            });

            const totalSales = completedOrders.reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0);

            const totalFees = completedOrders.reduce((acc: number, o: any) => {
                const comm = o.commission_amount ?? (Number(o.total) * (p.commission_rate || 10) / 100);
                return acc + Number(comm);
            }, 0);

            const paidFees = completedOrders.reduce((acc: number, o: any) => {
                const commission = Number(o.commission_amount || 0);
                const paidByAmount = Number(o.commission_paid_amount || 0);
                const paidFromLegacyStatus = o.commission_status === 'PAID' && paidByAmount <= 0 ? commission : 0;
                return acc + Math.min(commission, Math.max(0, paidByAmount + paidFromLegacyStatus));
            }, 0);

            const pendingValue = pendingOrders.reduce((acc: number, o: any) => acc + (Number(o.total) || 0), 0);

            return {
                id: p.id,
                name: p.name,
                commissionRate: p.commission_rate || 10,
                stats: {
                    totalSales: totalSales,
                    platformFees: totalFees,
                    netEarnings: totalSales - totalFees,
                    pendingClearance: pendingValue,
                    paidFees: paidFees,
                    unpaidFees: Math.max(0, totalFees - paidFees)
                }
            };
        });
    } catch (e) { return []; }
};

export const approvePharmacy = async (id: string): Promise<{success: boolean, error?: string}> => {
    try {
        const { error } = await supabase.from('pharmacies').update({ status: 'APPROVED' }).eq('id', id);
        return { success: !error, error: error?.message };
    } catch (e: any) { return { success: false, error: e.message }; }
};

export const deletePharmacy = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('pharmacies').delete().eq('id', id);
    return !error;
};

export const getAdminStats = async () => {
    const res = await safeQuery(async () => {
        const users = supabase.from('profiles').select('*', { count: 'exact', head: true });
        const pharms = supabase.from('pharmacies').select('*', { count: 'exact', head: true });
        const today = new Date().toISOString().split('T')[0];
        const orders = supabase.from('orders').select('total').gte('created_at', today);
        
        const [u, p, o] = await Promise.all([users, pharms, orders]);
        return { 
            users: u.count || 0, 
            pharmacies: p.count || 0, 
            ordersToday: o.data?.length || 0, 
            totalRevenue: (o.data || []).reduce((acc, item) => acc + (Number(item.total) || 0), 0)
        };
    });
    return res || { users: 0, pharmacies: 0, ordersToday: 0, totalRevenue: 0 };
};

export const updatePharmacyCommission = async (id: string, rate: number): Promise<boolean> => {
    const { error } = await supabase.from('pharmacies').update({ commission_rate: rate }).eq('id', id);
    return !error;
};
