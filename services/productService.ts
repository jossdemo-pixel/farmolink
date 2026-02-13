
import { supabase } from './supabaseClient';
import { Product, GlobalProduct } from '../types';

const GLOBAL_CATALOG_KEY = 'farmolink_master_catalog_v3';
const PHARMACY_STOCK_KEY_PREFIX = 'farmolink_stock_v3_';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos

// --- HELPERS DE CACHE ---

const getLocalCatalog = (): GlobalProduct[] | null => {
    try {
        const data = localStorage.getItem(GLOBAL_CATALOG_KEY);
        return data ? JSON.parse(data) : null;
    } catch { return null; }
};

const setLocalCatalog = (data: GlobalProduct[]) => {
    try {
        localStorage.setItem(GLOBAL_CATALOG_KEY, JSON.stringify(data));
    } catch (e) { console.error("Erro cache global", e); }
};

const getLocalStock = (pharmacyId: string): Product[] | null => {
    try {
        const raw = localStorage.getItem(PHARMACY_STOCK_KEY_PREFIX + pharmacyId);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return null; 
        const now = Date.now();
        if (now - parsed.timestamp > CACHE_DURATION_MS) return null;
        return parsed.data;
    } catch { return null; }
};

const setLocalStock = (pharmacyId: string, data: Product[]) => {
    try {
        const payload = { timestamp: Date.now(), data: data };
        localStorage.setItem(PHARMACY_STOCK_KEY_PREFIX + pharmacyId, JSON.stringify(payload));
    } catch (e) { console.error("Erro cache stock", e); }
};

// --- LÓGICA DE CORRESPONDÊNCIA / DUPLICADOS ---

const normalizeForMatch = (str: string) => {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
};

export const areProductNamesSimilar = (nameA: string, nameB: string): boolean => {
    const normA = normalizeForMatch(nameA);
    const normB = normalizeForMatch(nameB);
    if (normA === normB) return true;
    return normA.includes(normB) || normB.includes(normA);
};

// Sugere itens do Catálogo Mestre com base na similaridade do nome
// Usa combinação de normalização, substring e sobreposição de tokens
export const findSimilarGlobalProducts = async (name: string, limit: number = 5): Promise<GlobalProduct[]> => {
    const cleanName = (name || '').trim();
    if (cleanName.length < 3) return [];

    // Garante que temos o catálogo em cache (fetchGlobalCatalog já faz o cache local)
    const { data: all } = await fetchGlobalCatalog(undefined, 0, 5000);
    const allProducts = all || [];

    const target = normalizeForMatch(cleanName);
    const targetTokens = new Set(target.split(' ').filter(Boolean));

    const withScore = allProducts.map((p) => {
        const norm = normalizeForMatch(p.name);

        // igualdade exata tem prioridade máxima
        if (norm === target) return { product: p, score: 1.0 };

        let score = 0;

        // substring forte
        if (norm.includes(target) || target.includes(norm)) {
            score = 0.8;
        }

        // sobreposição de tokens (tipo Jaccard simples)
        const tokens = new Set(norm.split(' ').filter(Boolean));
        const intersection = [...targetTokens].filter(t => tokens.has(t)).length;
        const union = new Set([...targetTokens, ...tokens]).size || 1;
        const jaccard = intersection / union;

        score = Math.max(score, jaccard);

        return { product: p, score };
    })
    // filtra candidatos pouco parecidos
    .filter(item => item.score >= 0.55);

    if (withScore.length === 0) return [];

    withScore.sort((a, b) => b.score - a.score);
    return withScore.slice(0, limit).map(item => item.product);
};

// --- FUNÇÕES GLOBAIS (ADMIN) ---

export const fetchGlobalCatalog = async (searchTerm?: string, page = 0, pageSize = 50, forceRefresh = false): Promise<{ data: GlobalProduct[], total: number }> => {
    let allProducts = getLocalCatalog();

    if (!allProducts || forceRefresh) {
        const { data, error } = await supabase.from('global_products').select('id, name, category, image, reference_price').order('name', { ascending: true }).limit(5000); 
        if (!error && data) {
            allProducts = data.map((item:any) => ({
                id: item.id, name: item.name, description: '', category: item.category, 
                image: item.image, common: true, referencePrice: item.reference_price
            }));
            setLocalCatalog(allProducts);
        } else { allProducts = []; }
    }

    let filtered = allProducts || [];
    if (searchTerm && searchTerm.trim() !== '') {
        const lowerTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(lowerTerm));
    }

    const from = page * pageSize;
    const to = from + pageSize;
    return { data: filtered.slice(from, to), total: filtered.length };
}

// --- FUNÇÕES DE STOCK (FARMÁCIA) ---

export const fetchPharmacyInventory = async (pharmacyId: string, forceRefresh = false): Promise<Product[]> => {
    if (!pharmacyId) return [];
    if (!forceRefresh) {
        const cachedStock = getLocalStock(pharmacyId);
        if (cachedStock) return cachedStock;
    }

    const { data, error } = await supabase
        .from('products')
        .select('id, name, price, pharmacy_id, image, requires_prescription, stock, category, is_promotion, discount_price, global_product_id, unit_type')
        .eq('pharmacy_id', pharmacyId)
        .order('name', { ascending: true })
        .limit(3000);

    if (!error && data) {
        const localStock = data.map((item: any) => ({
            id: item.id, 
            name: item.name, 
            description: '', 
            price: Number(item.price),
            pharmacyId: item.pharmacy_id, 
            image: item.image, 
            requiresPrescription: item.requires_prescription, 
            stock: Number(item.stock), 
            category: item.category || 'Geral',
            isPromotion: item.is_promotion,
            discountPrice: item.discount_price ? Number(item.discount_price) : undefined,
            globalProductId: item.global_product_id,
            unitType: item.unit_type || 'Unidade'
        }));
        setLocalStock(pharmacyId, localStock);
        return localStock;
    }
    return [];
};

// Otimizada para Clientes (Server-Side)
export const fetchProducts = async (pharmacyId?: string, page = 0, pageSize = 20, searchTerm: string = ''): Promise<Product[]> => {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from('products').select('id, name, price, pharmacy_id, image, requires_prescription, stock, category, is_promotion, discount_price, unit_type');
  if (pharmacyId) query = query.eq('pharmacy_id', pharmacyId);
  if (searchTerm && searchTerm.length > 0) query = query.ilike('name', `%${searchTerm}%`);
  const { data } = await query.order('is_promotion', { ascending: false }).order('name', { ascending: true }).range(from, to);
  return (data || []).map((item: any) => ({
    id: item.id, name: item.name, description: '', price: Number(item.price), pharmacyId: item.pharmacy_id, 
    image: item.image, requiresPrescription: item.requires_prescription, stock: Number(item.stock), 
    category: item.category || 'Geral', isPromotion: item.is_promotion, discountPrice: item.discount_price, unitType: item.unit_type || 'Unidade'
  }));
};

export const addProduct = async (product: any): Promise<{success: boolean, error?: string}> => {
  const { data, error } = await supabase.from('products').insert([{
    name: product.name, description: product.description, price: product.price, 
    pharmacy_id: product.pharmacyId, image: product.image, requires_prescription: product.requiresPrescription, 
    stock: product.stock, category: product.category, global_product_id: product.globalProductId,
    is_promotion: product.isPromotion || false, discount_price: product.discountPrice,
    unit_type: product.unitType || 'Unidade'
  }]).select().single();

  if (!error && data) {
      const newItem: Product = {
          id: data.id, name: data.name, description: data.description || '', price: Number(data.price),
          pharmacyId: data.pharmacy_id, image: data.image, requiresPrescription: data.requires_prescription,
          stock: Number(data.stock), category: data.category, globalProductId: data.global_product_id,
          isPromotion: data.is_promotion, discountPrice: data.discount_price, unitType: data.unit_type
      };
      const current = getLocalStock(product.pharmacyId);
      if (current) setLocalStock(product.pharmacyId, [...current, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true };
  }
  return { success: false, error: error?.message };
};

export const updateProduct = async (id: string, product: any): Promise<{success: boolean, error?: string}> => {
  const { error } = await supabase.from('products').update({
    name: product.name, description: product.description, price: product.price, 
    stock: product.stock, requires_prescription: product.requiresPrescription, 
    category: product.category, global_product_id: product.globalProductId,
    is_promotion: product.isPromotion, discount_price: product.discountPrice,
    image: product.image, unit_type: product.unitType
  }).eq('id', id);

  if (!error) {
      if (product.pharmacyId) {
          const current = getLocalStock(product.pharmacyId);
          if (current) {
              const updated = current.map(p => p.id === id ? { ...p, ...product } : p);
              setLocalStock(product.pharmacyId, updated);
          }
      }
      return { success: true };
  }
  return { success: false, error: error?.message };
};

export const setProductPromotion = async (id: string, isPromotion: boolean, discountPrice?: number): Promise<boolean> => {
    const { error } = await supabase.from('products').update({ is_promotion: isPromotion, discount_price: discountPrice }).eq('id', id);
    return !error;
};

export const bulkAddPharmacyProducts = async (items: any[]): Promise<{success: boolean, error?: string}> => {
    const cleanItems = items.map(i => ({
        name: i.name, description: i.description || i.name, price: Number(i.price) || 0, stock: Number(i.stock) || 0,
        requires_prescription: !!i.requires_prescription, category: i.category || 'Geral', pharmacy_id: i.pharmacy_id,
        image: i.image || 'https://cdn-icons-png.flaticon.com/512/883/883407.png', global_product_id: i.global_product_id || null, 
        unit_type: i.unit_type || 'Unidade'
    }));

    if (cleanItems.length === 0) return { success: false, error: "Lista vazia" };
    const { data, error } = await supabase.from('products').insert(cleanItems).select();
    
    if (!error && data && data.length > 0) {
        localStorage.removeItem(PHARMACY_STOCK_KEY_PREFIX + data[0].pharmacy_id); 
        return { success: true };
    }
    return { success: false, error: error?.message || "Erro desconhecido ao salvar no banco." };
};

export const bulkDeletePharmacyProducts = async (ids: string[]) => {
    const { data: items } = await supabase.from('products').select('pharmacy_id').in('id', ids).limit(1);
    const pharmacyId = items?.[0]?.pharmacy_id;
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (!error && pharmacyId) {
        const current = getLocalStock(pharmacyId);
        if (current) setLocalStock(pharmacyId, current.filter(p => !ids.includes(p.id)));
        return { success: true };
    }
    return { success: !error, error: error?.message };
};

export const clearCatalogCache = () => { localStorage.removeItem(GLOBAL_CATALOG_KEY); };

export const addGlobalProduct = async (p: any): Promise<{success: boolean, error?: string}> => {
    const { error } = await supabase.from('global_products').insert([p]);
    if (error) return { success: false, error: error.message };
    clearCatalogCache();
    return { success: true };
};

export const updateGlobalProduct = async (id: string, p: any): Promise<{success: boolean, error?: string}> => {
    const { error } = await supabase.from('global_products').update(p).eq('id', id);
    if (error) return { success: false, error: error.message };
    clearCatalogCache();
    return { success: true };
};

export const deleteGlobalProduct = async (id: string): Promise<{success: boolean, error?: string}> => {
    const { error } = await supabase.from('global_products').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    clearCatalogCache();
    return { success: true };
};

export const bulkAddGlobalProducts = async (items: any[]): Promise<boolean> => {
    const { error } = await supabase.from('global_products').insert(items);
    if (error) return false;
    clearCatalogCache();
    return true;
};
