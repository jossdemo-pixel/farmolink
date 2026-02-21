
import React, { useEffect } from 'react';
import { History, RefreshCw, ShoppingBag, Truck, Store, Phone, MapPin, Clock, Package, Bike, CheckCircle2, AlertCircle, RotateCcw, ChevronRight } from 'lucide-react';
import { Order, Pharmacy, OrderStatus, Product } from '../types';
import { Card, Badge } from '../components/UI';
import { supabase } from '../services/supabaseClient';
import { playSound } from '../services/soundService';

const OrderTimeline = ({ status, type }: { status: string, type: 'DELIVERY' | 'PICKUP' }) => {
    // Definição dos passos baseados no tipo de entrega
    const steps = [
        { id: 'Pendente', label: 'Aguardando', icon: Clock },
        { id: 'Preparando', label: 'A Preparar', icon: Package },
        { id: type === 'DELIVERY' ? 'Saiu para Entrega' : 'Pronto para Retirada', label: type === 'DELIVERY' ? 'A Caminho' : 'Pode Levantar', icon: type === 'DELIVERY' ? Bike : Store },
        { id: 'Concluído', label: 'Recebido', icon: CheckCircle2 }
    ];

    // Mapeamento de status para índice (0 a 3)
    const getStatusIndex = (s: string) => {
        if (s === 'Pendente') return 0;
        if (s === 'Preparando') return 1;
        if (s === 'Saiu para Entrega' || s === 'Pronto para Retirada') return 2;
        if (s === 'Concluído') return 3;
        return -1; // Cancelado ou outro
    };

    const currentIndex = getStatusIndex(status);
    const isCancelled = status.includes('Cancelado') || status === 'Recusado';

    if (isCancelled) {
        return (
            <div className="mt-4 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-3 text-red-600">
                <AlertCircle size={20}/>
                <span className="text-xs font-black uppercase">Pedido Cancelado ou Recusado</span>
            </div>
        );
    }

    return (
        <div className="mt-6 relative">
            {/* Linha de fundo */}
            <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full z-0"></div>
            
            {/* Linha de progresso colorida */}
            <div 
                className="absolute top-1/2 left-0 h-1 bg-emerald-500 -translate-y-1/2 rounded-full z-0 transition-all duration-1000 ease-out"
                style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
            ></div>

            <div className="relative z-10 flex justify-between w-full">
                {steps.map((step, idx) => {
                    const isActive = idx === currentIndex;
                    const isCompleted = idx <= currentIndex;
                    const Icon = step.icon;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2">
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 border-2
                                ${isActive ? 'bg-emerald-500 border-emerald-500 text-white scale-125 shadow-lg shadow-emerald-200' : 
                                  isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-300'}
                            `}>
                                <Icon size={isActive ? 14 : 12} className={isActive ? 'animate-pulse' : ''} />
                            </div>
                            <span className={`text-[9px] font-black uppercase transition-colors ${isActive ? 'text-emerald-600' : (isCompleted ? 'text-emerald-800' : 'text-gray-300')}`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const CustomerOrdersView = ({
    orders, pharmacies, customerId, onRefresh, onAddToCart, onNavigate
}: {
    orders: Order[], pharmacies: Pharmacy[], customerId?: string, onRefresh: () => void, onAddToCart: (p: Product, options?: { quantity?: number; askQuantity?: boolean }) => void, onNavigate: (page: string) => void
}) => {
    const [expandedOrder, setExpandedOrder] = React.useState<string | null>(null);

    // ATUALIZAÇÃO EM TEMPO REAL PARA PEDIDOS (apenas do próprio utente)
    useEffect(() => {
        if (!customerId) return;
        const channel = supabase.channel(`customer-orders-live-${customerId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` },
                (payload) => {
                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        onRefresh();
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [customerId, onRefresh]);

    const handleReorder = (order: Order) => {
        if (!confirm("Adicionar todos os itens deste pedido ao carrinho?")) return;
        
        // Adiciona cada item com a quantidade original, sem abrir modal em lote
        order.items.forEach(item => {
            onAddToCart({
                ...item,
                // Garante que o stock nao seja impeditivo na UI inicial, o CartView vai validar depois se necessario
                // Mas mantemos a logica de produto valida
            }, { quantity: item.quantity, askQuantity: false });
        });
        
        playSound('success');
        onNavigate('cart');
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                        <History className="text-emerald-600" /> Acompanhar Pedidos
                    </h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Siga o progresso da farmácia em tempo real</p>
                </div>
                <button onClick={onRefresh} className="p-3 hover:bg-gray-100 rounded-2xl transition-all">
                    <RefreshCw size={24} className="text-emerald-600" />
                </button>
            </div>

            <div className="grid gap-6">
                {orders.length === 0 ? (
                    <div className="bg-white p-20 rounded-[40px] border border-dashed text-center flex flex-col items-center">
                        <ShoppingBag className="text-gray-100 mb-4" size={80}/>
                        <p className="text-gray-400 font-black uppercase text-sm">Ainda não fizeste nenhum pedido</p>
                    </div>
                ) : (
                    orders.map(order => {
                        const pharm = pharmacies.find(p => p.id === order.pharmacyId);
                        const isRecent = new Date(order.date).getTime() > Date.now() - 24 * 60 * 60 * 1000; // Últimas 24h

                        return (
                            <Card key={order.id} className={`p-6 rounded-[32px] border-gray-100 shadow-sm hover:shadow-md transition-all ${isRecent && order.status !== OrderStatus.COMPLETED ? 'border-l-8 border-l-emerald-500' : ''}`}>
                                <div className="flex flex-col gap-6">
                                    {/* CABEÇALHO DO PEDIDO */}
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 border border-emerald-100 shadow-inner">
                                                {pharm?.name.charAt(0) || 'F'}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-tighter bg-gray-50 px-2 py-0.5 rounded-lg">
                                                        #{order.id.slice(0, 6)}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-400">{order.date.split(',')[1]}</span>
                                                </div>
                                                <h4 className="font-black text-gray-800 text-lg leading-none mb-2">{pharm?.name || 'Farmácia Parceira'}</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {pharm?.phone && (
                                                        <a href={`tel:${pharm.phone}`} className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors uppercase tracking-wider">
                                                            <Phone size={10}/> Ligar
                                                        </a>
                                                    )}
                                                    <div className="text-[9px] text-gray-400 flex items-center gap-1 font-bold bg-gray-50 px-2 py-1 rounded-lg uppercase tracking-wider">
                                                        <MapPin size={10}/> {pharm?.address || 'Luanda'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:items-end justify-center pl-16 md:pl-0">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Valor Total</p>
                                            <p className="text-2xl font-black text-emerald-600 tracking-tight">Kz {order.total.toLocaleString()}</p>
                                            
                                            <div className="flex gap-2 mt-2">
                                                <div className="flex items-center gap-1 text-[9px] font-black text-gray-500 uppercase bg-gray-100 px-2 py-1 rounded-full">
                                                    {order.type === 'DELIVERY' ? <Truck size={10}/> : <Store size={10}/>}
                                                    {order.type === 'DELIVERY' ? 'Entrega' : 'Recolha'}
                                                </div>
                                                
                                                {/* BOTÃO REPETIR PEDIDO (OTIMIZAÇÃO DE RETENÇÃO) */}
                                                <button 
                                                    onClick={() => handleReorder(order)}
                                                    className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full hover:bg-emerald-100 transition-colors"
                                                >
                                                    <RotateCcw size={10}/> Repetir
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* TIMELINE DE STATUS */}
                                    <div className="bg-gray-50/50 p-4 rounded-[24px] border border-gray-100">
                                        <OrderTimeline status={order.status} type={order.type} />
                                    </div>

                                    {/* SEÇÃO DE PRODUTOS - EXPANSÍVEL */}
                                    {order.items.length > 0 && (
                                        <div className="bg-amber-50/30 p-4 rounded-[24px] border border-amber-100">
                                            <div 
                                                className="flex justify-between items-start cursor-pointer"
                                                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                            >
                                                <div>
                                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Medicamentos Pedidos</p>
                                                    <p className="text-xs font-bold text-amber-800 mt-1">{order.items.length} {order.items.length === 1 ? 'item' : 'itens'} neste pedido</p>
                                                </div>
                                                <span className="text-[9px] font-bold text-amber-400 uppercase flex items-center gap-1">
                                                    {expandedOrder === order.id ? 'Ver Menos' : 'Ver Todos'}
                                                    <ChevronRight size={14} className={`transition-transform ${expandedOrder === order.id ? 'rotate-90' : ''}`}/>
                                                </span>
                                            </div>

                                            {expandedOrder === order.id && (
                                                <div className="mt-4 pt-4 border-t border-amber-100 animate-scale-in">
                                                    <div className="space-y-2 bg-white p-4 rounded-xl">
                                                        {order.items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-start text-xs text-gray-700 font-medium border-b border-gray-200 last:border-0 pb-3 last:pb-0">
                                                                <div className="flex-1">
                                                                    <p className="font-bold text-gray-800">{item.quantity}x {item.name}</p>
                                                                    <p className="text-[9px] text-gray-400 mt-0.5">
                                                                        {item.description && item.description.length > 0 ? item.description : 'Sem descrição'}
                                                                    </p>
                                                                </div>
                                                                <div className="text-right ml-3">
                                                                    <p className="font-bold text-emerald-600">Kz {item.price.toLocaleString()}</p>
                                                                    {item.unitType && <p className="text-[9px] text-gray-400 mt-0.5">{item.unitType}</p>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="mt-3 p-3 bg-amber-50 rounded-xl">
                                                        <div className="flex justify-between text-xs font-bold">
                                                            <span className="text-amber-700">Subtotal</span>
                                                            <span className="text-amber-600">Kz {order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
};
