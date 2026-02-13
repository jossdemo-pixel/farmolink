
import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Eye, AlertOctagon, ChevronRight, Phone, MapPin, MessageSquare, RefreshCw, MessageCircle, CheckCircle2, ShoppingCart, DollarSign, Store, Loader2 } from 'lucide-react';
import { PrescriptionRequest, Pharmacy, User, PrescriptionQuote, OrderStatus } from '../types';
import { Card, Badge, Button } from '../components/UI';
import { deletePrescriptionRequest, acceptQuoteAndCreateOrder } from '../services/orderService';
import { playSound } from '../services/soundService';
import { supabase } from '../services/supabaseClient';

export const PrescriptionsListView = ({ 
    prescriptions, 
    pharmacies, 
    onRefresh, 
    user,
    onNavigate
}: { 
    prescriptions: PrescriptionRequest[], 
    pharmacies: Pharmacy[], 
    onRefresh: () => void,
    user: User,
    onNavigate: (page: string) => void
}) => {
    const [tab, setTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
    const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
    const [expandedPrescription, setExpandedPrescription] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [processingQuoteId, setProcessingQuoteId] = useState<string | null>(null);

    // 1. ATUALIZAÇÃO EM TEMPO REAL ROBUSTA
    useEffect(() => {
        if (!user?.id) return;

        const rxChannel = supabase.channel(`customer-rx-main-${user.id}`)
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'prescriptions', filter: `customer_id=eq.${user.id}` }, 
                () => {
                    onRefresh();
                    playSound('notification');
                }
            )
            .subscribe();

        const quoteChannel = supabase.channel(`customer-rx-quotes-${user.id}`)
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'prescription_quotes' }, 
                () => {
                    console.log("Novo orçamento recebido!");
                    playSound('cash');
                    onRefresh();
                }
            )
            .subscribe();

        return () => { 
            supabase.removeChannel(rxChannel);
            supabase.removeChannel(quoteChannel);
        };
    }, [user?.id]);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        playSound('click');
        await onRefresh();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja eliminar esta receita do seu histórico?")) return;
        const success = await deletePrescriptionRequest(id);
        if (success) {
            playSound('trash');
            onRefresh();
        } else {
            alert("Erro ao eliminar.");
        }
    };

    // NOVA FUNÇÃO: RESERVAR ORÇAMENTO (COM FECHAMENTO DE CICLO)
    const handleReserve = async (quote: PrescriptionQuote, prescription: PrescriptionRequest) => {
        setProcessingQuoteId(quote.id);
        
        // 1. Tenta identificar se é entrega ou levantamento baseado na nota da receita
        const notes = prescription.notes || '';
        const isDelivery = notes.includes('[ENTREGA AO DOMICÍLIO]');
        
        const result = await acceptQuoteAndCreateOrder(quote, user, prescription.id, isDelivery);

        if (result.success) {
            playSound('cash');
            // Atualiza a lista para mover a receita para histórico
            await onRefresh(); 
            
            // Navega para pedidos para ver o status
            onNavigate('orders');
        } else {
            alert("Erro ao criar reserva: " + result.error);
        }
        setProcessingQuoteId(null);
    };

    const activeList = prescriptions.filter(p => ['ANALYZING', 'UNDER_REVIEW', 'WAITING_FOR_QUOTES', 'ILLEGIBLE'].includes(p.status));
    const historyList = prescriptions.filter(p => ['COMPLETED', 'EXPIRED', 'CANCELLED'].includes(p.status));
    
    const displayList = tab === 'ACTIVE' ? activeList : historyList;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                        <FileText className="text-emerald-600" /> Minhas Receitas
                    </h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Gestão de orçamentos e envios</p>
                </div>
                <div className="flex gap-2 bg-gray-50 p-1 rounded-xl">
                    <button onClick={() => setTab('ACTIVE')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${tab === 'ACTIVE' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>
                        Em Aberto ({activeList.length})
                    </button>
                    <button onClick={() => setTab('HISTORY')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${tab === 'HISTORY' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>
                        Histórico
                    </button>
                    <button onClick={handleManualRefresh} className="p-2 hover:bg-white rounded-lg transition-all text-emerald-600">
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            <div className="grid gap-6">
                {displayList.length === 0 ? (
                    <div className="bg-white p-20 rounded-[40px] border border-dashed text-center flex flex-col items-center">
                        <FileText className="text-gray-100 mb-4" size={80}/>
                        <p className="text-gray-400 font-black uppercase text-sm">Nenhuma receita nesta categoria</p>
                    </div>
                ) : (
                    displayList.map(rx => {
                        const hasQuotes = rx.quotes && rx.quotes.length > 0;
                        const isIllegible = rx.status === 'ILLEGIBLE';
                        const bestPrice = hasQuotes ? Math.min(...rx.quotes!.map(q => q.totalPrice)) : 0;

                        return (
                            <Card 
                                key={rx.id} 
                                className={`p-0 overflow-hidden rounded-[32px] border-2 shadow-sm hover:shadow-lg transition-all flex flex-col ${
                                    isIllegible ? 'border-red-500/50 ring-4 ring-red-50' : (
                                        hasQuotes ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-gray-100'
                                    )
                                }`}
                            >
                                <div className="flex flex-col sm:flex-row">
                                    <div className="w-full sm:w-48 h-48 bg-gray-900 relative shrink-0">
                                        <img src={rx.imageUrl} className="w-full h-full object-cover opacity-60" alt="Receita" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Eye className="text-white opacity-40" size={32}/>
                                        </div>
                                        {isIllegible && (
                                            <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase shadow-lg animate-pulse">
                                                Ação Necessária
                                            </div>
                                        )}
                                        {hasQuotes && (
                                            <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase shadow-lg flex items-center gap-1 animate-bounce">
                                                <CheckCircle2 size={10}/> Respondida
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-4">
                                                <Badge color={rx.status === 'COMPLETED' ? 'green' : (hasQuotes ? 'green' : (isIllegible ? 'red' : 'blue'))}>
                                                    {hasQuotes ? `${rx.quotes?.length} PROPOSTAS PRONTAS` : 
                                                    (rx.status === 'WAITING_FOR_QUOTES' ? 'AGUARDANDO FARMÁCIAS...' : 
                                                    rx.status === 'UNDER_REVIEW' ? 'ANÁLISE DE LETRA' :
                                                    rx.status === 'ILLEGIBLE' ? 'RECUSADA / ILEGÍVEL' : rx.status)}
                                                </Badge>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-black text-gray-300">{rx.date}</span>
                                                    <button onClick={() => handleDelete(rx.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1 bg-gray-50 rounded-lg">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <h4 className="font-black text-gray-800 mb-2">Pedido #{rx.id.slice(0, 6)}</h4>
                                            
                                            {isIllegible ? (
                                                <div className="bg-red-50 p-4 rounded-2xl flex flex-col gap-3 border border-red-100">
                                                    <div className="flex items-center gap-2">
                                                        <AlertOctagon className="text-red-500 shrink-0" size={20}/>
                                                        <p className="text-xs text-red-800 font-black uppercase">Não foi possível ler a receita</p>
                                                    </div>
                                                    
                                                    {(rx.notes && rx.notes !== 'Pedido Manual' && rx.notes !== 'Análise por IA') && (
                                                        <div className="bg-white/60 p-3 rounded-xl border border-red-100">
                                                            <p className="text-[9px] font-black text-red-400 uppercase mb-1 flex items-center gap-1">
                                                                <MessageCircle size={10}/> Mensagem da Farmácia:
                                                            </p>
                                                            <p className="text-xs font-bold text-red-700 italic">"{rx.notes}"</p>
                                                        </div>
                                                    )}

                                                    <p className="text-[10px] text-red-600 leading-relaxed font-medium mt-1">
                                                        Recomendamos tirar uma foto mais clara ou <strong>contactar o médico</strong> para esclarecer o nome do medicamento.
                                                    </p>
                                                </div>
                                            ) : hasQuotes ? (
                                                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Melhor Preço Encontrado</p>
                                                        <p className="text-2xl font-black text-emerald-800">Kz {bestPrice.toLocaleString()}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-emerald-500 mb-1">{rx.quotes?.length} Farmácias Responderam</p>
                                                        <ChevronRight className="ml-auto text-emerald-400 animate-pulse"/>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 font-medium line-clamp-2">
                                                    {rx.notes === 'Pedido Manual' || rx.notes === 'Análise por IA' ? 'Aguardando resposta das farmácias...' : rx.notes}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO DE ITENS SUGERIDOS PELA IA - SEMPRE VISÍVEL */}
                                {!isIllegible && rx.ai_metadata?.suggested_items && rx.ai_metadata.suggested_items.length > 0 && (
                                    <div className="bg-blue-50/30 p-4 border-t border-blue-100">
                                        <div 
                                            className="flex justify-between items-start cursor-pointer"
                                            onClick={() => setExpandedPrescription(expandedPrescription === rx.id ? null : rx.id)}
                                        >
                                            <div>
                                                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Produtos Detectados</p>
                                                <p className="text-xs font-bold text-blue-800 mt-1">{rx.ai_metadata.suggested_items.length} medicamentos identificados</p>
                                            </div>
                                            <span className="text-[9px] font-bold text-blue-400 uppercase flex items-center gap-1">
                                                {expandedPrescription === rx.id ? 'Ver Menos' : 'Ver Mais'}
                                                <ChevronRight size={14} className={`transition-transform ${expandedPrescription === rx.id ? 'rotate-90' : ''}`}/>
                                            </span>
                                        </div>

                                        {expandedPrescription === rx.id && (
                                            <div className="mt-4 pt-4 border-t border-blue-100 animate-scale-in">
                                                <div className="space-y-2 bg-white p-4 rounded-xl">
                                                    {rx.ai_metadata.suggested_items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-xs text-gray-700 font-medium border-b border-gray-200 last:border-0 pb-3 last:pb-0">
                                                            <div className="flex-1">
                                                                <p className="font-bold text-gray-800">{item.name}</p>
                                                                <p className="text-[9px] text-gray-400 mt-0.5">Quantidade: {item.quantity}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* LISTA DE PROPOSTAS - AGORA VISÍVEL SE HOUVER ORÇAMENTOS */}
                                {hasQuotes && tab === 'ACTIVE' && (
                                    <div className="bg-emerald-50/30 p-4 space-y-3 border-t border-emerald-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2 mb-2">Orçamentos Disponíveis (Toque para ver itens)</p>
                                        {rx.quotes!.map(quote => {
                                            const pDetails = pharmacies.find(p => p.id === quote.pharmacyId);
                                            const isExpanded = expandedQuote === quote.id;
                                            
                                            return (
                                                <div key={quote.id} className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                                    <div className="flex justify-between items-start cursor-pointer" onClick={() => setExpandedQuote(isExpanded ? null : quote.id)}>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-black">
                                                                <Store size={18}/>
                                                            </div>
                                                            <div>
                                                                <h5 className="font-black text-gray-800 text-sm">{quote.pharmacyName}</h5>
                                                                <div className="flex gap-3 mt-1">
                                                                    {pDetails?.phone && (
                                                                        <a href={`tel:${pDetails.phone}`} onClick={e => e.stopPropagation()} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1 hover:bg-blue-100">
                                                                            <Phone size={10}/> Ligar
                                                                        </a>
                                                                    )}
                                                                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                                        <MapPin size={10}/> {pDetails?.address || 'Localização não disponível'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-lg font-black text-emerald-600">Kz {quote.totalPrice.toLocaleString()}</span>
                                                            <span className="text-[9px] font-bold text-gray-400 uppercase">{isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {isExpanded && (
                                                        <div className="mt-4 pt-4 border-t border-gray-100 animate-scale-in">
                                                            {quote.notes && (
                                                                <div className="bg-yellow-50 p-3 rounded-xl mb-4 border border-yellow-100">
                                                                    <p className="text-[9px] font-black text-yellow-600 uppercase mb-1 flex items-center gap-1">
                                                                        <MessageSquare size={10}/> Nota da Farmácia:
                                                                    </p>
                                                                    <p className="text-xs text-yellow-800 font-medium italic">"{quote.notes}"</p>
                                                                </div>
                                                            )}
                                                            
                                                            <div className="space-y-2 mb-4 bg-gray-50 p-4 rounded-xl">
                                                                <p className="text-[9px] font-black text-gray-400 uppercase mb-2">Itens Orçados</p>
                                                                {quote.items.map((it, idx) => (
                                                                    <div key={idx} className="flex justify-between text-xs text-gray-700 font-medium border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                                                                        <span>{it.quantity}x {it.name}</span>
                                                                        <span className="font-bold">Kz {it.price.toLocaleString()}</span>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            <div className="flex gap-2">
                                                                <p className="text-[10px] text-gray-400 font-medium flex-1">
                                                                    Ao confirmar, esta receita será movida para o histórico e um pedido será criado.
                                                                </p>
                                                                <Button 
                                                                    onClick={() => handleReserve(quote, rx)}
                                                                    disabled={processingQuoteId === quote.id}
                                                                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-lg"
                                                                >
                                                                    {processingQuoteId === quote.id ? <Loader2 className="animate-spin" size={14}/> : 'Confirmar & Pedir'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        );
                    })
                )}
            </div>
        </div>
    );
};
