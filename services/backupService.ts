
import { supabase } from './supabaseClient';
import { playSound } from './soundService';

// Definição de todos os grupos de dados para o backup
interface FullBackupData {
    version: string;
    timestamp: string;
    data: {
        profiles: any[];
        pharmacies: any[];
        global_products: any[];
        products: any[];
        orders: any[];
        prescriptions: any[];
        prescription_quotes: any[];
        support_tickets: any[];
        support_messages: any[];
        notifications: any[];
        carousel_slides: any[];
        partners: any[];
    }
}

export interface RestoreOptions {
    config: boolean;      // Banners e Parceiros
    users: boolean;       // Perfis
    pharmacies: boolean;  // Farmácias
    catalog: boolean;     // Catálogo Global
    inventory: boolean;   // Stock das lojas
    orders: boolean;      // Pedidos
    prescriptions: boolean; // Receitas e Orçamentos
    support: boolean;     // SAC e Notificações
}

/**
 * Gera um arquivo JSON com o estado atual de TODO o banco de dados.
 */
export const generateFullSystemBackup = async (): Promise<void> => {
    try {
        console.log("Iniciando exportação de dados...");
        
        const [
            { data: profiles }, { data: pharmacies }, { data: global_products },
            { data: products }, { data: orders }, { data: prescriptions },
            { data: quotes }, { data: tickets }, { data: messages },
            { data: notifications }, { data: slides }, { data: partners }
        ] = await Promise.all([
            supabase.from('profiles').select('*'),
            supabase.from('pharmacies').select('*'),
            supabase.from('global_products').select('*'),
            supabase.from('products').select('*'),
            supabase.from('orders').select('*'),
            supabase.from('prescriptions').select('*'),
            supabase.from('prescription_quotes').select('*'),
            supabase.from('support_tickets').select('*'),
            supabase.from('support_messages').select('*'),
            supabase.from('notifications').select('*'),
            supabase.from('carousel_slides').select('*'),
            supabase.from('partners').select('*')
        ]);

        const backupData: FullBackupData = {
            version: "2.0",
            timestamp: new Date().toISOString(),
            data: {
                profiles: profiles || [],
                pharmacies: pharmacies || [],
                global_products: global_products || [],
                products: products || [],
                orders: orders || [],
                prescriptions: prescriptions || [],
                prescription_quotes: quotes || [],
                support_tickets: tickets || [],
                support_messages: messages || [],
                notifications: notifications || [],
                carousel_slides: slides || [],
                partners: partners || []
            }
        };

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `FARMOLINK_FULL_DUMP_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        playSound('save');
    } catch (error) {
        console.error("Erro no backup:", error);
        alert("Falha crítica ao extrair dados.");
    }
};

/**
 * Restaura dados de forma inteligente usando upsert.
 */
export const restoreFullSystemBackup = async (jsonData: any, options: RestoreOptions): Promise<{success: boolean, message?: string}> => {
    try {
        if (!jsonData.data) return { success: false, message: "Arquivo de backup inválido." };

        const { data } = jsonData;

        // Função de limpeza para evitar erros como "coluna access_code não encontrada"
        // Remove campos que costumam dar conflito ou que não existem no esquema atual
        const cleanData = (table: string, items: any[]) => {
            if (!items) return [];
            return items.map(item => {
                const cleaned = { ...item };
                // Lista de colunas fantasmas ou removidas do DB para ignorar no upsert
                const forbidden = ['access_code', 'temp_pass', 'legacy_id', 'search_vector'];
                forbidden.forEach(key => delete cleaned[key]);
                return cleaned;
            });
        };

        const safeUpsert = async (table: string, items: any[]) => {
            if (!items || items.length === 0) return;
            const cleaned = cleanData(table, items);
            const { error } = await supabase.from(table).upsert(cleaned, { onConflict: 'id' });
            if (error) throw new Error(`${table}: ${error.message}`);
        };

        // Ordem de execução respeitando chaves estrangeiras
        if (options.config) {
            await safeUpsert('carousel_slides', data.carousel_slides);
            await safeUpsert('partners', data.partners);
        }
        
        if (options.catalog) {
            await safeUpsert('global_products', data.global_products);
        }

        if (options.users) {
            await safeUpsert('profiles', data.profiles);
        }

        if (options.pharmacies) {
            await safeUpsert('pharmacies', data.pharmacies);
        }

        if (options.inventory) {
            await safeUpsert('products', data.products);
        }

        if (options.orders) {
            await safeUpsert('orders', data.orders);
        }

        if (options.prescriptions) {
            await safeUpsert('prescriptions', data.prescriptions);
            await safeUpsert('prescription_quotes', data.prescription_quotes || data.quotes);
        }

        if (options.support) {
            await safeUpsert('support_tickets', data.support_tickets);
            await safeUpsert('support_messages', data.support_messages);
            await safeUpsert('notifications', data.notifications);
        }

        return { success: true };
    } catch (error: any) {
        console.error("Erro no restauro:", error);
        return { success: false, message: error.message };
    }
};
