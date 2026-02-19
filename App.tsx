
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserRole, Product, Pharmacy, Order, OrderStatus, PrescriptionRequest, CartItem } from './types';
import { MainLayout } from './components/Layout';
import { AuthView, UpdatePasswordView } from './components/Auth';
import { LandingPage } from './components/LandingPage';
import { LoadingOverlay, Toast, NumericInput } from './components/UI';
import { ChatBot } from './components/ChatBot';
import { getCurrentUser, signOutUser } from './services/authService';
import { fetchPharmacies } from './services/pharmacyService';
import { fetchProducts, fetchPharmacyInventory } from './services/productService'; // Importação atualizada
import { fetchOrders, fetchPrescriptionRequests, createOrder } from './services/orderService';
import { getCacheForUser, getLastSyncForUser, setCacheForUser } from './services/dataService';
import { playSound } from './services/soundService';
import { getCurrentPosition, calculateDistance } from './services/locationService';
import { WifiOff, Wifi, AlertCircle, LayoutDashboard, ShoppingBag, Store, FileText, User as UserIcon, MessageCircle, Settings, Database, Image as ImageIcon, Wallet, Pill, History, ShieldCheck, Star, Megaphone, Info, Trash2 } from 'lucide-react';
import { isOfflineNow, processOfflineQueue } from './services/offlineService';
import { SUPABASE_URL } from './services/supabaseClient';

// --- Static View Imports ---
import { HomeView, AllPharmaciesView, CartView, PharmacyProfileView } from './views/CustomerShop'; // NOVA VIEW
// MÓDULOS REFATORADOS
import { PrescriptionUploadView } from './views/CustomerUploadRx';
import { CustomerOrdersView } from './views/CustomerOrderList';
import { PrescriptionsListView } from './views/CustomerPrescriptionList';

import { CustomerProfileView } from './views/CustomerProfile';
import { SupportView } from './views/SupportView';
import { PharmacyOverview, PharmacyOrdersModule } from './views/PharmacyMain';
import { PharmacyRequestsModule } from './views/PharmacyRequests';
import { PharmacySettingsView, PharmacyReviewsView, PharmacyPromotionsView } from './views/PharmacyConfig';
import { PharmacyProductsView } from './views/PharmacyProductsView';
import { PharmacyFinancialView, AdminFinancialView } from './views/FinancialViews';
import { AdminOverview, AdminGlobalOrders } from './views/AdminMain';
import { AdminUserManagement, AdminPharmacyManagement } from './views/AdminManagement';
import { AdminCatalogView } from './views/AdminCatalogView';
import { AdminMarketingView } from './views/AdminMarketingView';
import { AdminSettingsView, AdminBackupView } from './views/AdminSystem';
import { AdminSupportView } from './views/AdminSupport';
import { AboutView, FAQView, TermsOfUseView, PrivacyPolicyView } from './views/PublicInfoViews';

type ConnectivityNoticeState = {
    status: 'offline' | 'online';
    message: string;
};

type AddToCartOptions = {
    quantity?: number;
    askQuantity?: boolean;
};

export const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [page, setPage] = useState('home');
    const [loading, setLoading] = useState(true);
    const [isAppLoading, setIsAppLoading] = useState(false);
    const [lastBackPress, setLastBackPress] = useState(0);
    const [showExitHint, setShowExitHint] = useState(false);
    const [networkError, setNetworkError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState<boolean>(isOfflineNow());
    const [connectivityNotice, setConnectivityNotice] = useState<ConnectivityNoticeState | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
    const [syncNotice, setSyncNotice] = useState<string | null>(null);
    const isSyncingQueueRef = useRef(false);
    const connectivityNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    const [products, setProducts] = useState<Product[]>([]);
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [prescriptions, setPrescriptions] = useState<PrescriptionRequest[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [activePharmacyId, setActivePharmacyId] = useState<string | null>(null);
    const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
    const [pendingCartProduct, setPendingCartProduct] = useState<Product | null>(null);
    const [pendingCartQuantity, setPendingCartQuantity] = useState<number>(1);
    const [uxToast, setUxToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
    const lastCustomerPageRef = useRef<string>('home');

    const isPasswordRecoveryFlow = useCallback(() => {
        try {
            const searchParams = new URLSearchParams(window.location.search);
            const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
            const hashParams = new URLSearchParams(hashRaw);
            const pathname = window.location.pathname.toLowerCase();

            return (
                searchParams.get('type') === 'recovery' ||
                hashParams.get('type') === 'recovery' ||
                pathname.includes('/reset-password') ||
                pathname.includes('/update-password')
            );
        } catch (e) {
            return false;
        }
    }, []);

    const probeInternet = useCallback(async (): Promise<boolean> => {
        if (!navigator.onLine) return false;

        const endpoints = [
            { url: `${SUPABASE_URL}/auth/v1/health`, mode: 'cors' as RequestMode },
            { url: 'https://www.gstatic.com/generate_204', mode: 'no-cors' as RequestMode }
        ];

        for (const endpoint of endpoints) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4500);

                const res = await fetch(endpoint.url, {
                    method: 'GET',
                    cache: 'no-store',
                    mode: endpoint.mode,
                    signal: controller.signal
                });

                clearTimeout(timeout);

                if (endpoint.mode === 'no-cors') return true;
                if (res.ok) return true;
            } catch (e) {
                // tenta próximo endpoint
            }
        }

        return false;
    }, []);

    // Detecta fluxo de recuperação de senha via URL do Supabase.
    useEffect(() => {
        try {
            if (isPasswordRecoveryFlow()) {
                setPage('reset-password');
            }
        } catch (e) {
            // Ignora parse failures de URL.
        }
    }, [isPasswordRecoveryFlow]);

    const showConnectivityNotice = useCallback((status: 'offline' | 'online') => {
        const message = status === 'offline'
            ? 'Está offline.'
            : 'Conexão está online.';

        setConnectivityNotice({ status, message });

        if (connectivityNoticeTimerRef.current) {
            clearTimeout(connectivityNoticeTimerRef.current);
        }

        connectivityNoticeTimerRef.current = setTimeout(() => {
            setConnectivityNotice(null);
            connectivityNoticeTimerRef.current = null;
        }, 4200);
    }, []);

    useEffect(() => {
        return () => {
            if (connectivityNoticeTimerRef.current) {
                clearTimeout(connectivityNoticeTimerRef.current);
            }
        };
    }, []);
    
    const syncOfflineQueue = useCallback(async () => {
        if (isSyncingQueueRef.current || !navigator.onLine) return;
        isSyncingQueueRef.current = true;
        try {
            const result = await processOfflineQueue();

            if (result.processed > 0) {
                setSyncNotice(`${result.processed} acao(oes) offline sincronizadas.`);
                setTimeout(() => setSyncNotice(null), 4000);
            }

            if (result.failed > 0 && navigator.onLine) {
                setTimeout(() => {
                    syncOfflineQueue();
                }, 10000);
            }
        } finally {
            isSyncingQueueRef.current = false;
        }
    }, []);

    const refreshConnectivity = useCallback(async () => {
        const reachable = await probeInternet();
        const nextOffline = !reachable;

        setIsOffline(prevOffline => {
            if (prevOffline !== nextOffline) {
                showConnectivityNotice(nextOffline ? 'offline' : 'online');
            }
            return nextOffline;
        });

        if (reachable) {
            setNetworkError(null);
            await syncOfflineQueue();
        }
    }, [probeInternet, showConnectivityNotice, syncOfflineQueue]);

    // --- Detector de erros de rede + sincronizacao offline ---
    useEffect(() => {
        const handleOnline = () => {
            refreshConnectivity();
        };

        const handleOffline = () => {
            setIsOffline(prevOffline => {
                if (!prevOffline) {
                    showConnectivityNotice('offline');
                }
                return true;
            });
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                refreshConnectivity();
            }
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        document.addEventListener('visibilitychange', handleVisibility);

        const timer = setInterval(() => {
            refreshConnectivity();
        }, 12000);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('visibilitychange', handleVisibility);
            clearInterval(timer);
        };
    }, [refreshConnectivity, showConnectivityNotice]);

    // --- Back Button Logic - Melhorado para APK com Capacitor ---
    useEffect(() => {
        const handleBackButton = (e?: Event) => {
            if (e) e.preventDefault();
            
            const isAtRoot = page === 'home' || page === 'dashboard' || page === 'admin-dashboard';
            
            if (!user || isAtRoot) {
                // Se não autenticado ou na página raiz, preparar para sair
                const now = Date.now();
                if (now - lastBackPress < 2000) {
                    // Duplo clique = sair do app
                    try {
                        const win = window as any;
                        // Tenta Capacitor (APK) - método correto
                        if (win.Capacitor?.Plugins?.App) {
                            console.log("Encerrando app via Capacitor");
                            win.Capacitor.Plugins.App.exitApp();
                        }
                        // Tenta Android WebView direto
                        else if (win.Android?.exitApp) {
                            console.log("Encerrando app via Android WebView");
                            win.Android.exitApp();
                        }
                        // Fallback para browser
                        else {
                            console.log("Encerrando via window.close()");
                            window.close();
                        }
                    } catch (err) {
                        console.warn("Erro ao sair:", err);
                    }
                } else {
                    // Primeiro clique = mostrar aviso
                    setLastBackPress(now);
                    setShowExitHint(true);
                    setTimeout(() => setShowExitHint(false), 2000);
                }
                return;
            }

            // Mapa de navegação com todas as páginas
            const navigationMap: Record<string, string> = {
                // Customer
                'pharmacy-detail': 'pharmacies-list',
                'pharmacies-list': 'home',
                'cart': 'home',
                'upload-rx': 'home',
                'orders': 'home',
                'prescriptions': 'home',
                'profile': 'home',
                'support': 'home',
                // Pharmacy
                'pharmacy-main': 'dashboard',
                'pharmacy-orders': 'pharmacy-main',
                'pharmacy-requests': 'pharmacy-main',
                'pharmacy-products': 'pharmacy-main',
                'pharmacy-settings': 'pharmacy-main',
                'pharmacy-financial': 'pharmacy-main',
                // Admin
                'admin-main': 'admin-dashboard',
                'admin-users': 'admin-dashboard',
                'admin-pharmacies': 'admin-dashboard',
                'admin-catalog': 'admin-dashboard',
                'admin-marketing': 'admin-dashboard',
                'admin-system': 'admin-dashboard',
                'admin-support': 'admin-dashboard',
                'terms-of-use': user?.role === UserRole.ADMIN ? 'admin-dashboard' : (user?.role === UserRole.PHARMACY ? 'dashboard' : 'home'),
                'privacy-policy': user?.role === UserRole.ADMIN ? 'admin-dashboard' : (user?.role === UserRole.PHARMACY ? 'dashboard' : 'home')
            };

            // Navega para a página anterior
            const nextPage = navigationMap[page];
            if (nextPage) {
                console.log(`Navegando de ${page} para ${nextPage}`);
                setPage(nextPage);
            } else {
                // Fallback baseado no role do usuário
                console.log(`Fallback: navegando com base em role ${user?.role}`);
                if (user?.role === UserRole.CUSTOMER) setPage('home');
                else if (user?.role === UserRole.PHARMACY) setPage('dashboard');
                else if (user?.role === UserRole.ADMIN) setPage('admin-dashboard');
            }
        };

        // Listeners para diferentes eventos - ordem importa!
        // 1. Capacitor hardwareBackPress (Android 5+)
        if ((window as any).Capacitor?.Plugins?.App) {
            (window as any).Capacitor.Plugins.App.addListener('backButton', handleBackButton);
        }
        
        // 2. Event listeners padrão como fallback
        document.addEventListener('backbutton', handleBackButton);
        document.addEventListener('ionBackButton', handleBackButton);
        
        return () => {
            document.removeEventListener('backbutton', handleBackButton);
            document.removeEventListener('ionBackButton', handleBackButton);
        };
    }, [page, lastBackPress, user]);

    const updateDistances = useCallback((coords: {lat: number, lng: number}, phList: Pharmacy[]) => {
        return phList.map(ph => {
            if (ph.latitude && ph.longitude) {
                const dist = calculateDistance(coords.lat, coords.lng, ph.latitude, ph.longitude);
                return { ...ph, distanceKm: dist };
            }
            return ph;
        }).sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    }, []);

    const showUxToast = (msg: string, type: 'success' | 'info' = 'info') => {
        setUxToast({ msg, type });
    };

    const loadData = useCallback(async (currUser: User) => {
        try {
            // 1) Tenta usar cache local para exibir algo mesmo em rede fraca
            const cached = getCacheForUser(currUser.id);
            if (cached) {
                if (cached.products) setProducts(cached.products);
                if (cached.pharmacies) setPharmacies(cached.pharmacies);
                if (cached.orders) setOrders(cached.orders);
                if (cached.prescriptions) setPrescriptions(cached.prescriptions);
                if (cached.lastSync) setLastSyncAt(Number(cached.lastSync));
            }

            // 2) Busca dados atualizados do servidor (uma vez por chamada de carga completa)
            const [pData, phData] = await Promise.all([
                fetchProducts(undefined, 0),
                fetchPharmacies(currUser.role === UserRole.ADMIN)
            ]);
            
            let finalPharmacies = phData;
            if (currUser.role === UserRole.CUSTOMER) {
                const coords = await getCurrentPosition();
                if (coords) {
                    setUserCoords(coords);
                    finalPharmacies = updateDistances(coords, phData);
                }
            }

            setProducts(pData || []);
            setPharmacies(finalPharmacies || []);

            let oData: Order[] | undefined;
            let rxData: PrescriptionRequest[] | undefined;

            if (currUser.role === UserRole.CUSTOMER) {
                [oData, rxData] = await Promise.all([
                    fetchOrders(undefined, currUser.id),
                    fetchPrescriptionRequests(UserRole.CUSTOMER, currUser.id)
                ]);
                setOrders(oData || []);
                setPrescriptions(rxData || []);
            } else if (currUser.role === UserRole.PHARMACY) {
                [oData, rxData] = await Promise.all([
                    fetchOrders(currUser.pharmacyId),
                    fetchPrescriptionRequests(UserRole.PHARMACY, undefined, currUser.pharmacyId)
                ]);
                setOrders(oData || []);
                setPrescriptions(rxData || []);
            }

            // 3) Atualiza cache para reduzir futuras chamadas completas
            setCacheForUser(currUser.id, {
                products: pData || [],
                pharmacies: finalPharmacies || [],
                orders: oData || [],
                prescriptions: rxData || []
            });
            setLastSyncAt(Date.now());
        } catch (err) {
            console.error("Erro ao carregar dados iniciais:", err);
        }
    }, [updateDistances]);

    const checkSession = useCallback(async () => {
        setLoading(true);
        try {
            const currUser = await getCurrentUser();
            if (currUser) {
                setUser(currUser);
                setLastSyncAt(getLastSyncForUser(currUser.id));

                // Em recuperação de senha, mantém a tela de redefinição.
                if (isPasswordRecoveryFlow()) {
                    setPage('reset-password');
                    return;
                }

                await loadData(currUser);
                if (currUser.role === UserRole.PHARMACY) setPage('dashboard');
                else if (currUser.role === UserRole.ADMIN) setPage('admin-dashboard');
                else setPage('home');
            }
        } catch (e) {
            console.warn("Sessão não pôde ser verificada:", e);
        } finally {
            setLoading(false);
        }
    }, [isPasswordRecoveryFlow, loadData]);

    useEffect(() => {
        checkSession();
    }, [checkSession]);

    useEffect(() => {
        if (user?.role === UserRole.CUSTOMER && page !== 'cart') {
            lastCustomerPageRef.current = page;
        }
    }, [page, user?.role]);

    useEffect(() => {
        if (navigator.onLine) {
            syncOfflineQueue();
        }
    }, [syncOfflineQueue]);

    const handleLoginSuccess = (userData: User) => {
        setUser(userData);
        loadData(userData);
        if (userData.role === UserRole.PHARMACY) setPage('dashboard');
        else if (userData.role === UserRole.ADMIN) setPage('admin-dashboard');
        else setPage('home');
        playSound('login');
        
        // Toca mensagem de boas-vindas para clientes (com delay para garantir carregamento de áudio)
        if (userData.role === UserRole.CUSTOMER) {
            setTimeout(() => {
                const { playWelcomeMessage } = require('./services/soundService');
                playWelcomeMessage(userData.name);
            }, 1000);
        }
    };

    const handleLogout = async () => {
        setIsAppLoading(true);
        try {
            await signOutUser();
            setUser(null);
            setCart([]);
            setActivePharmacyId(null);
            setPage('home');
            playSound('logout');
        } finally {
            setIsAppLoading(false);
        }
    };

    // Refresh leve: apenas pedidos e receitas, para não recarregar catálogos sempre
    const refreshOrdersAndPrescriptions = useCallback(async () => {
        if (!user) return;
        try {
            let oData: Order[] | undefined;
            let rxData: PrescriptionRequest[] | undefined;

            if (user.role === UserRole.CUSTOMER) {
                [oData, rxData] = await Promise.all([
                    fetchOrders(undefined, user.id),
                    fetchPrescriptionRequests(UserRole.CUSTOMER, user.id)
                ]);
            } else if (user.role === UserRole.PHARMACY) {
                [oData, rxData] = await Promise.all([
                    fetchOrders(user.pharmacyId),
                    fetchPrescriptionRequests(UserRole.PHARMACY, undefined, user.pharmacyId)
                ]);
            } else {
                return;
            }

            setOrders(oData || []);
            setPrescriptions(rxData || []);
            setCacheForUser(user.id, {
                orders: oData || [],
                prescriptions: rxData || []
            });
            setLastSyncAt(Date.now());
        } catch (err) {
            console.warn("Falha ao atualizar pedidos/receitas:", err);
        }
    }, [user]);

    const addToCartDirect = (product: Product, quantity: number = 1) => {
        const maxStock = typeof product.stock === 'number' ? product.stock : Infinity;
        if (!maxStock || maxStock <= 0) {
            alert("Este produto está sem stock disponível no momento.");
            return false;
        }

        const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
        if (safeQuantity > maxStock) {
            alert(`Stock insuficiente para ${product.name}. Disponível: ${maxStock} unidade(s).`);
            return false;
        }

        const shouldResetCart = !!(activePharmacyId && activePharmacyId !== product.pharmacyId);
        if (shouldResetCart && !confirm("Esvaziar carrinho da outra farmácia?")) return false;

        const baselineCart = shouldResetCart ? [] : cart;
        const baselineExisting = baselineCart.find(item => item.id === product.id);
        if (baselineExisting && (baselineExisting.quantity + safeQuantity) > maxStock) {
            alert(`Stock insuficiente para ${product.name}. Disponível: ${maxStock} unidade(s).`);
            return false;
        }

        setActivePharmacyId(product.pharmacyId);
        setCart(prev => {
            const cartToUse = shouldResetCart ? [] : prev;
            const existing = cartToUse.find(item => item.id === product.id);
            if (existing) {
                return cartToUse.map(item => item.id === product.id ? { ...item, quantity: item.quantity + safeQuantity } : item);
            }
            return [...cartToUse, { ...product, quantity: safeQuantity }];
        });

        playSound('success');
        showUxToast(`${product.name} adicionado (${safeQuantity}). Toque no carrinho para finalizar.`, 'success');
        return true;
    };

    const openAddToCartModal = (product: Product, initialQuantity: number = 1) => {
        const maxStock = typeof product.stock === 'number' ? product.stock : Infinity;
        if (!maxStock || maxStock <= 0) {
            alert("Este produto está sem stock disponível no momento.");
            return;
        }

        const safeInitialQuantity = Math.max(1, Math.floor(Number(initialQuantity) || 1));
        const clampedInitial = maxStock === Infinity
            ? safeInitialQuantity
            : Math.min(safeInitialQuantity, maxStock);

        setPendingCartProduct(product);
        setPendingCartQuantity(clampedInitial);
        playSound('click');
        showUxToast(`Produto selecionado: ${product.name}`, 'info');
    };

    const closeAddToCartModal = () => {
        setPendingCartProduct(null);
        setPendingCartQuantity(1);
    };

    const removeItemFromCart = (productId: string) => {
        setCart(prev => {
            const updated = prev.filter(item => item.id !== productId);
            if (updated.length === 0 && page !== 'pharmacy-detail') setActivePharmacyId(null);
            return updated;
        });
    };

    const removePendingProductFromModal = () => {
        if (!pendingCartProduct) return;
        removeItemFromCart(pendingCartProduct.id);
        showUxToast(`${pendingCartProduct.name} removido do carrinho.`, 'info');
        closeAddToCartModal();
    };

    const confirmAddToCartFromModal = () => {
        if (!pendingCartProduct) return;
        const maxStock = typeof pendingCartProduct.stock === 'number' ? pendingCartProduct.stock : Infinity;
        const safeQuantity = Math.max(1, Math.floor(Number(pendingCartQuantity) || 1));

        if (maxStock !== Infinity && safeQuantity > maxStock) {
            alert(`Stock insuficiente para ${pendingCartProduct.name}. Disponível: ${maxStock} unidade(s).`);
            setPendingCartQuantity(maxStock);
            return;
        }

        addToCartDirect(pendingCartProduct, safeQuantity);
        closeAddToCartModal();
    };

    const handleAddToCart = (product: Product, options: AddToCartOptions = {}) => {
        const { quantity = 1, askQuantity = true } = options;
        if (askQuantity) {
            openAddToCartModal(product, quantity);
            return;
        }
        addToCartDirect(product, quantity);
    };

    const updateCartQuantity = (id: string, delta: number) => {
        setCart(prev => {
            const updated = prev.map(item => {
                if (item.id !== id) return item;
                const maxStock = typeof item.stock === 'number' ? item.stock : Infinity;
                const nextQty = item.quantity + delta;

                if (delta > 0 && nextQty > maxStock) {
                    alert(`Stock insuficiente para ${item.name}. Disponível: ${maxStock} unidade(s).`);
                    playSound('error');
                    return item;
                }

                return { ...item, quantity: Math.max(0, nextQty) };
            }).filter(item => item.quantity > 0);
            if (updated.length === 0 && page !== 'pharmacy-detail') setActivePharmacyId(null);
            return updated;
        });
    };

    const handleCheckout = async (type: 'DELIVERY' | 'PICKUP', address: string, total: number) => {
        if (!user || cart.length === 0) return;
        if (!navigator.onLine) {
            showConnectivityNotice('offline');
            return;
        }

        const hasPrescriptionItems = cart.some(it => !!it.requiresPrescription);
        if (hasPrescriptionItems) {
            const accepted = confirm(
                'Este pedido inclui medicamentos sujeitos a receita medica. ' +
                'A farmacia podera exigir validacao e retencao da receita conforme a lei local. Deseja continuar?'
            );
            if (!accepted) return;
        }

        // Validação final de stock antes de criar o pedido (usa apenas dados já em memória)
        const invalidItems = cart.filter(it => {
            const maxStock = typeof it.stock === 'number' ? it.stock : Infinity;
            return maxStock !== Infinity && maxStock >= 0 && it.quantity > maxStock;
        });

        if (invalidItems.length > 0) {
            const msg = invalidItems
                .map(it => `- ${it.name}: pedido ${it.quantity}, stock ${it.stock}`)
                .join('\n');
            alert(`Alguns itens excedem o stock disponível:\n\n${msg}\n\nAtualize as quantidades antes de finalizar.`);
            return;
        }

        setIsAppLoading(true);
        setNetworkError(null);
        try {
            const result = await createOrder({
                customerId: user.id,
                customerName: user.name, customerPhone: user.phone || '', items: cart, total,
                status: OrderStatus.PENDING, type, pharmacyId: activePharmacyId!,
                address: type === 'DELIVERY' ? (address || user.address || '') : 'Retirada'
            });
            if (result.success) {
                playSound('cash');
                showUxToast('Venda confirmada com sucesso.', 'success');
                setCart([]);
                setPage('orders');
                loadData(user);
            } else {
                const errorMsg = result.error || 'Erro desconhecido ao processar o pedido';
                setNetworkError(errorMsg);
                console.error('Erro no checkout:', errorMsg);
            }
        } catch (err: any) {
            const errorMsg = err?.message || 'Erro de conexão ao processar o pedido';
            setNetworkError(errorMsg);
            console.error('Erro crítico no checkout:', err);
        } finally {
            setIsAppLoading(false);
        }
    };

    const getMenuItems = () => {
        if (user?.role === UserRole.ADMIN) return [
            { id: 'admin-dashboard', label: 'INÍCIO', icon: LayoutDashboard },
            { id: 'admin-users', label: 'UTENTES E EQUIPA', icon: UserIcon },
            { id: 'admin-pharmacies', label: 'FARMÁCIAS PARCEIRAS', icon: Store },
            { id: 'admin-orders', label: 'MONITOR DE VENDAS', icon: History },
            { id: 'admin-catalog', label: 'CATÁLOGO MESTRE', icon: Database },
            { id: 'admin-financial', label: 'FINANCEIRO REDE', icon: Wallet },
            { id: 'admin-support', label: 'SUPORTE (SAC)', icon: MessageCircle },
            { id: 'admin-settings', label: 'CONFIGURAÇÕES', icon: Settings },
            { id: 'admin-backup', label: 'SEGURANÇA E DADOS', icon: ShieldCheck },
            { id: 'privacy-policy', label: 'POLITICA PRIVACIDADE', icon: ShieldCheck }
        ];
        if (user?.role === UserRole.PHARMACY) return [
            { id: 'dashboard', label: 'INÍCIO', icon: LayoutDashboard },
            { id: 'pharmacy-orders', label: 'PEDIDOS DO UTENTE', icon: ShoppingBag },
            { id: 'pharmacy-requests', label: 'TRIAGEM DE RECEITAS', icon: FileText },
            { id: 'pharmacy-products', label: 'STOCK E PREÇOS', icon: Pill },
            { id: 'pharmacy-financial', label: 'AUDITORIA MENSAL', icon: Wallet },
            { id: 'pharmacy-reviews', label: 'SATISFAÇÃO UTENTE', icon: Star },
            { id: 'pharmacy-promotions', label: 'CAMPANHAS SAÚDE', icon: Megaphone },
            { id: 'about', label: 'SOBRE NÓS', icon: Info },
            { id: 'privacy-policy', label: 'POLITICA PRIVACIDADE', icon: ShieldCheck },
            { id: 'support', label: 'SUPORTE TÉCNICO', icon: MessageCircle },
            { id: 'pharmacy-settings', label: 'CONFIGURAÇÕES', icon: Settings },
        ];
        return [
            { id: 'home', label: 'INÍCIO', icon: LayoutDashboard },
            { id: 'pharmacies-list', label: 'FARMÁCIAS', icon: Store },
            { id: 'upload-rx', label: 'ENVIAR RECEITA', icon: FileText },
            { id: 'prescriptions', label: 'MINHAS CONSULTAS', icon: FileText },
            { id: 'orders', label: 'MEUS MEDICAMENTOS', icon: History },
            { id: 'profile', label: 'PERFIL SAÚDE', icon: UserIcon },
            { id: 'about', label: 'SOBRE NÓS', icon: Info },
            { id: 'privacy-policy', label: 'POLITICA PRIVACIDADE', icon: ShieldCheck },
            { id: 'support', label: 'AJUDA DIRETA', icon: MessageCircle },
        ];
    };

    const renderContent = () => {
        if (page === 'reset-password' || page === 'update-password') {
            return (
                <UpdatePasswordView
                    onComplete={async () => {
                        await checkSession();
                        setPage('login');
                        window.history.replaceState({}, document.title, '/');
                    }}
                />
            );
        }

        if (!user) {
            if (page === 'login') return <AuthView onLogin={handleLoginSuccess} onNavigate={setPage} />;
            if (page === 'terms-of-use') return <TermsOfUseView onNavigate={setPage} />;
            if (page === 'privacy-policy') return <PrivacyPolicyView onNavigate={setPage} />;
            return <LandingPage onLoginClick={() => setPage('login')} onNavigate={setPage} />;
        }
        
        const stats = {
            pendingOrders: orders.filter(o => o.status === 'Pendente' || o.status === 'Preparando').length,
            revenue: orders.filter(o => o.status === 'Concluído').reduce((acc, o) => acc + o.total, 0),
            productsCount: products.filter(p => p.pharmacyId === user.pharmacyId).length
        };

        // OTIMIZAÇÃO CRÍTICA: Simples navegação para ativar a view PharmacyProfile
        // Não faz fetch aqui para evitar travamentos
        const onViewPharmacy = (id: string) => { 
            setActivePharmacyId(id);
            setPage('pharmacy-detail');
        };

        switch (page) {
            case 'home': return <HomeView products={products} pharmacies={pharmacies} onAddToCart={handleAddToCart} onNavigate={setPage} onViewPharmacy={onViewPharmacy} />;
            case 'pharmacies-list': return <AllPharmaciesView pharmacies={pharmacies} onViewPharmacy={onViewPharmacy} />;
            case 'pharmacy-detail': 
                const pharm = pharmacies.find(p => p.id === activePharmacyId);
                // SELECIONA A NOVA VIEW OTIMIZADA
                return pharm ? (
                    <PharmacyProfileView 
                        pharmacy={pharm} 
                        onAddToCart={handleAddToCart} 
                        onBack={() => setPage('pharmacies-list')} 
                    />
                ) : <div className="p-10 text-center">Farmácia não encontrada</div>;
            case 'cart': return <CartView items={cart} pharmacies={pharmacies} updateQuantity={updateCartQuantity} onRemoveItem={removeItemFromCart} userAddress={user.address} onBack={() => setPage(lastCustomerPageRef.current || 'home')} onCheckout={handleCheckout} />;
            // ADICIONADA PROP onAddToCart
            case 'orders': return <CustomerOrdersView orders={orders} pharmacies={pharmacies} customerId={user?.role === UserRole.CUSTOMER ? user.id : undefined} onRefresh={refreshOrdersAndPrescriptions} onAddToCart={handleAddToCart} onNavigate={setPage} />;
            case 'prescriptions': return <PrescriptionsListView prescriptions={prescriptions} pharmacies={pharmacies} onRefresh={refreshOrdersAndPrescriptions} user={user} onNavigate={setPage} />;
            case 'upload-rx': return <PrescriptionUploadView pharmacies={pharmacies} user={user} onNavigate={setPage} onAddToCart={handleAddToCart} />;
            case 'profile': return <CustomerProfileView user={user} onUpdateUser={setUser} />;
            case 'support': return <SupportView user={user} />;
            case 'dashboard': return <PharmacyOverview stats={stats} pharmacyId={user.pharmacyId} isAvailable={pharmacies.find(p => p.id === user.pharmacyId)?.isAvailable} onRefresh={refreshOrdersAndPrescriptions} setView={setPage} />;
            case 'pharmacy-orders': return <PharmacyOrdersModule pharmacyId={user.pharmacyId!} onUpdate={refreshOrdersAndPrescriptions} onGoToStock={() => setPage('pharmacy-products')} />;
            case 'pharmacy-requests': return <PharmacyRequestsModule pharmacyId={user.pharmacyId!} requests={prescriptions} onRefresh={refreshOrdersAndPrescriptions} />;
            case 'pharmacy-products': return <PharmacyProductsView pharmacyId={user.pharmacyId!} onRefresh={refreshOrdersAndPrescriptions} />;
            case 'pharmacy-financial': return <PharmacyFinancialView pharmacyId={user.pharmacyId!} />;
            case 'pharmacy-reviews': return <PharmacyReviewsView pharmacyId={user.pharmacyId!} />;
            case 'pharmacy-promotions': return <PharmacyPromotionsView />;
            case 'pharmacy-settings': return <PharmacySettingsView pharmacyId={user.pharmacyId!} onComplete={() => loadData(user)} />;
            case 'admin-dashboard': return <AdminOverview setView={setPage} />;
            case 'admin-users': return <AdminUserManagement />;
            case 'admin-pharmacies': return <AdminPharmacyManagement />;
            case 'admin-orders': return <AdminGlobalOrders />;
            case 'admin-catalog': return <AdminCatalogView />;
            case 'admin-marketing': return <AdminMarketingView />;
            case 'admin-financial': return <AdminFinancialView />;
            case 'admin-support': return <AdminSupportView user={user} />;
            case 'admin-settings': return <AdminSettingsView />;
            case 'admin-backup': return <AdminBackupView />;
            case 'about': return <AboutView onNavigate={setPage} />;
            case 'faq': return <FAQView onNavigate={setPage} />;
            case 'terms-of-use': return <TermsOfUseView onNavigate={setPage} />;
            case 'privacy-policy': return <PrivacyPolicyView onNavigate={setPage} />;
            default: return <HomeView products={products} pharmacies={pharmacies} onAddToCart={handleAddToCart} onNavigate={setPage} onViewPharmacy={onViewPharmacy} />;
        }
    };

    if (loading) return <LoadingOverlay />;

    return (
        <div className="min-h-screen bg-gray-100">
            {isAppLoading && <LoadingOverlay />}
            {uxToast && <Toast message={uxToast.msg} type={uxToast.type} onClose={() => setUxToast(null)} />}
            
            {networkError && !isOffline && (
                <div className="fixed top-0 left-0 right-0 z-[9999] animate-fade-in">
                    <div className="bg-red-600 text-white px-6 py-3 flex items-center gap-3 font-black text-sm uppercase tracking-widest border-b-4 border-red-700 shadow-lg">
                        <WifiOff size={16} className="shrink-0 animate-pulse" />
                        {networkError}
                        <button 
                            onClick={() => setNetworkError(null)} 
                            className="ml-auto text-white/70 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {syncNotice && (
                <div className="fixed top-20 right-4 z-[10000] bg-blue-600 text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg">
                    {syncNotice}
                </div>
            )}

            {connectivityNotice && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10001] animate-fade-in pointer-events-none">
                    <div className={`backdrop-blur-md px-4 py-2 rounded-full text-xs font-bold shadow-xl border flex items-center gap-2 ${
                        connectivityNotice.status === 'offline'
                            ? 'bg-amber-600/95 text-white border-amber-400/50'
                            : 'bg-emerald-600/95 text-white border-emerald-300/50'
                    }`}>
                        {connectivityNotice.status === 'offline' ? (
                            <WifiOff size={14} className="shrink-0" />
                        ) : (
                            <Wifi size={14} className="shrink-0" />
                        )}
                        {connectivityNotice.message}
                    </div>
                </div>
            )}
            
            {showExitHint && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] animate-bounce">
                    <div className="bg-gray-900/90 backdrop-blur-md text-white px-6 py-2.5 rounded-full text-xs font-black shadow-2xl border border-white/10 flex items-center gap-2">
                        <AlertCircle size={14} className="text-emerald-400" />
                        Pressione novamente para sair
                    </div>
                </div>
            )}

            {pendingCartProduct && (
                <div
                    className="fixed inset-0 z-[10050] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Adicionar produto ao carrinho"
                >
                    <div className="w-full max-w-md bg-white rounded-[28px] border border-gray-100 shadow-2xl p-6 space-y-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">
                                    Confirmar Produto
                                </p>
                                <h3 className="text-lg font-black text-gray-800 leading-tight">
                                    {pendingCartProduct.name}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Stock disponivel: {pendingCartProduct.stock} unidade(s)
                                </p>
                            </div>
                            <button
                                onClick={closeAddToCartModal}
                                className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                aria-label="Fechar"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                Quantidade
                            </label>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPendingCartQuantity(prev => {
                                            const next = prev - 1;
                                            if (next <= 0) {
                                                removePendingProductFromModal();
                                                return 1;
                                            }
                                            return next;
                                        });
                                    }}
                                    className="w-11 h-11 rounded-2xl border border-gray-200 text-xl font-black text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    -
                                </button>
                                <NumericInput
                                    min={1}
                                    max={pendingCartProduct.stock}
                                    value={pendingCartQuantity}
                                    integer
                                    onValueChange={(next) => {
                                        if (typeof next === 'number') {
                                            setPendingCartQuantity(next);
                                        }
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') confirmAddToCartFromModal();
                                    }}
                                    className="flex-1 h-11 rounded-2xl border border-gray-200 px-4 text-center font-black text-gray-700 outline-none focus:ring-2 focus:ring-emerald-100"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const maxStock = typeof pendingCartProduct.stock === 'number'
                                            ? pendingCartProduct.stock
                                            : Infinity;
                                        setPendingCartQuantity(prev => {
                                            const next = prev + 1;
                                            return maxStock === Infinity ? next : Math.min(maxStock, next);
                                        });
                                    }}
                                    className="w-11 h-11 rounded-2xl border border-gray-200 text-xl font-black text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    +
                                </button>
                            </div>
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                                Depois de adicionar, clique no carrinho para concluir o pedido.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button
                                type="button"
                                onClick={removePendingProductFromModal}
                                className="h-11 w-11 rounded-2xl border border-red-200 text-red-500 font-bold hover:bg-red-50 transition-colors flex items-center justify-center"
                                aria-label="Remover do carrinho"
                                title="Remover do carrinho"
                            >
                                <Trash2 size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={closeAddToCartModal}
                                className="flex-1 h-11 rounded-2xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmAddToCartFromModal}
                                className="flex-1 h-11 rounded-2xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-colors"
                            >
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {user ? (
                <MainLayout 
                    user={user} activePage={page} onNavigate={setPage} onLogout={handleLogout}
                    menuItems={getMenuItems()} cartCount={cart.reduce((a, b) => a + b.quantity, 0)}
                >
                    {renderContent()}
                    {user.role === UserRole.CUSTOMER && <ChatBot />}
                </MainLayout>
            ) : (
                renderContent()
            )}
        </div>
    );
};


