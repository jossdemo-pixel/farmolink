
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Badge, Button } from '../components/UI';
import { PrescriptionRequest, QuotedItem, Product } from '../types';
import { sendPrescriptionQuote, validatePrescriptionAI } from '../services/orderService';
import { fetchPharmacyInventory } from '../services/productService';
import { supabase } from '../services/supabaseClient';
import { X, Plus, Trash2, FileText, Send, Search, Loader2, BrainCircuit, Eye, RefreshCw, Sparkles, MessageSquare, Phone, User, CheckCircle2, Calculator, Ban, AlertTriangle, AlertOctagon, Maximize2 } from 'lucide-react';
import { playSound } from '../services/soundService';
import { formatProductNameForCustomer } from '../services/geminiService';

const normalizeText = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Algoritmo de "Fuzzy Match" para encontrar produtos no stock
const findBestStockMatch = (aiName: string, stock: Product[]): Product | null => {
    const cleanAi = normalizeText(aiName);
    const aiTokens = cleanAi.split(' ').filter(t => t.length > 1); 

    if (aiTokens.length === 0) return null;

    let bestMatch: Product | null = null;
    let maxScore = 0;

    for (const prod of stock) {
        const cleanStock = normalizeText(prod.name);
        let score = 0;

        // Match exato
        if (cleanStock === cleanAi) score += 20;
        
        // Match parcial forte (contém nome exato)
        if (cleanStock.includes(cleanAi)) score += 10;
        
        // Match por tokens
        const stockTokens = cleanStock.split(' ');
        const matches = aiTokens.filter(t => stockTokens.some(st => st.includes(t)));
        score += matches.length * 3;

        // Match do número (ex: "6" em "Coartem 6") é crucial
        const numbersInAi = aiName.match(/\d+/g);
        if (numbersInAi) {
            numbersInAi.forEach(n => {
                if (prod.name.includes(n)) score += 5;
            });
        }

        if (score > maxScore && score >= 5) { 
            maxScore = score;
            bestMatch = prod;
        }
    }

    return bestMatch;
};

export const PharmacyRequestsModule = ({ pharmacyId, requests: initialRequests, onRefresh }: { pharmacyId: string, requests: PrescriptionRequest[], onRefresh: () => void }) => {
    const [viewMode, setViewMode] = useState<'PENDING' | 'REVIEWS' | 'ANSWERED'>('PENDING');
    const [analysisMode, setAnalysisMode] = useState<PrescriptionRequest | null>(null);
    const [imageFullscreen, setImageFullscreen] = useState(false);
    // Extende QuotedItem para incluir stock local para validação visual
    const [quoteItems, setQuoteItems] = useState<(QuotedItem & { currentStock?: number })[]>([]);
    const [newItem, setNewItem] = useState({ name: '', qty: 1, price: '', unitType: 'Unidade', id: '', currentStock: 0 }); 
    const [isSending, setIsSending] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [myStock, setMyStock] = useState<Product[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    
    const [pharmacyName, setPharmacyName] = useState('Sua Farmácia');
    const [quoteNotes, setQuoteNotes] = useState('');
    const [customerContact, setCustomerContact] = useState<{name: string, phone: string} | null>(null);

    const pendingRequests = initialRequests.filter(r => r.status === 'WAITING_FOR_QUOTES' && !r.quotes?.some(q => q.pharmacyId === pharmacyId));
    const lowConfidenceRequests = initialRequests.filter(r => r.status === 'UNDER_REVIEW');
    
    const answeredRequests = initialRequests.filter(r => 
        r.quotes?.some(q => q.pharmacyId === pharmacyId) || 
        (r.status === 'ILLEGIBLE' && r.ai_metadata?.validated_by === pharmacyId)
    );

    useEffect(() => {
        if (pendingRequests.length === 0 && lowConfidenceRequests.length > 0 && viewMode === 'PENDING') {
            setViewMode('REVIEWS');
        }
    }, [pendingRequests.length, lowConfidenceRequests.length]);

    useEffect(() => {
        if(pharmacyId) {
            onRefresh();
            supabase.from('pharmacies').select('name').eq('id', pharmacyId).single()
                .then(({data}) => { if(data) setPharmacyName(data.name); });
        }
    }, [pharmacyId]);

    useEffect(() => {
        if (!pharmacyId) return;
        const rxChannel = supabase.channel(`pharm-rx-live-${pharmacyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'prescriptions' }, (payload) => {
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    onRefresh(); 
                    if (payload.eventType === 'INSERT') playSound('notification');
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(rxChannel); };
    }, [pharmacyId]);

    useEffect(() => { 
        const load = async () => {
            const data = await fetchPharmacyInventory(pharmacyId);
            setMyStock(data);
        };
        load();
    }, [pharmacyId]);

    useEffect(() => {
        const fetchCustomerData = async () => {
            if (analysisMode?.customerId) {
                const { data } = await supabase.from('profiles').select('name, phone').eq('id', analysisMode.customerId).single();
                if (data) setCustomerContact(data);
            }
        };
        if (analysisMode) {
            fetchCustomerData();
            setQuoteNotes(''); 
        } else {
            setCustomerContact(null);
        }
    }, [analysisMode]);

    const totalQuoteValue = useMemo(() => {
        return quoteItems.reduce((acc, item) => {
            const p = Number(item.price) || 0;
            const q = Number(item.quantity) || 1;
            return acc + (p * q);
        }, 0);
    }, [quoteItems]);

    const handleSync = async () => {
        setIsSyncing(true);
        playSound('click');
        await onRefresh();
        const freshStock = await fetchPharmacyInventory(pharmacyId, true);
        setMyStock(freshStock);
        setTimeout(() => setIsSyncing(false), 800);
    };

    const handleOpenAnalysis = (req: PrescriptionRequest) => {
        playSound('click');
        setImageFullscreen(false);
        setAnalysisMode(req);
        
        if (req.status === 'ILLEGIBLE' || req.quotes?.some(q => q.pharmacyId === pharmacyId)) {
            setQuoteItems([]);
            return;
        }

        if (req.ai_metadata?.suggested_items) {
            const matchedItems = req.ai_metadata.suggested_items.map(aiItem => {
                const stockMatch = findBestStockMatch(aiItem.name, myStock);
                return {
                    name: stockMatch ? formatProductNameForCustomer(stockMatch.name) : aiItem.name,
                    quantity: 1, 
                    price: stockMatch ? stockMatch.price : 0,
                    available: true,
                    isMatched: !!stockMatch,
                    unitType: stockMatch?.unitType || 'Unidade',
                    productId: stockMatch?.id, // VINCULO DE STOCK AUTOMÁTICO
                    currentStock: stockMatch?.stock || 0 // Captura stock para display
                };
            });
            setQuoteItems(matchedItems);
        } else { 
            setQuoteItems([]); 
        }
    };

    const handleMarkIllegible = async () => {
        if(!analysisMode) return;
        if (analysisMode.status === 'EXPIRED') {
            alert("Esta receita já expirou e não pode mais ser marcada como ilegível.");
            return;
        }
        const reason = quoteNotes.trim() || "Receita ilegível ou incompleta.";
        if(!confirm("Deseja rejeitar esta receita? Ela ficará no seu histórico como 'Recusada'.")) return;
        
        setIsSending(true);
        const success = await validatePrescriptionAI(analysisMode.id, pharmacyId, [], true, reason);
        if(success) {
            playSound('error');
            setAnalysisMode(null);
            onRefresh();
        } else {
            alert("Erro ao rejeitar.");
        }
        setIsSending(false);
    };

    const handleValidateAndSend = async () => {
        if(!analysisMode || quoteItems.length === 0) return;
        if (analysisMode.status === 'EXPIRED') {
            alert("Esta receita já expirou e não pode mais ser cotada.");
            return;
        }

        // Validações locais antes de qualquer chamada ao servidor (sem novas queries)
        const invalidQty = quoteItems.filter(i => !i.quantity || i.quantity <= 0);
        if (invalidQty.length > 0) {
            alert("Verifique as quantidades: todos os itens devem ter pelo menos 1 unidade.");
            return;
        }

        const invalidPrice = quoteItems.filter(i => !i.price || i.price <= 0);
        if (invalidPrice.length > 0) {
            alert("Verifique os preços: todos os itens devem ter preço maior que zero.");
            return;
        }

        // Garante que itens ligados ao stock não ultrapassam o stock atual carregado em memória
        const stockProblems: string[] = [];
        quoteItems.forEach(i => {
            if (!i.productId) return;
            const prod = myStock.find(p => p.id === i.productId);
            if (!prod) return;
            if (i.quantity > prod.stock) {
                stockProblems.push(`${formatProductNameForCustomer(prod.name)} — pedido ${i.quantity}, stock ${prod.stock}`);
            }
        });

        if (stockProblems.length > 0) {
            alert(`Alguns itens excedem o stock disponível:\n\n${stockProblems.join('\n')}\n\nAtualize quantidades ou stock antes de enviar o orçamento.`);
            return;
        }

        setIsSending(true);
        
        if (analysisMode.status === 'UNDER_REVIEW') {
            await validatePrescriptionAI(analysisMode.id, pharmacyId, quoteItems.map(i => ({ name: i.name, quantity: i.quantity })));
        }
        
        const note = quoteNotes.trim() || "Orçamento enviado.";
        const success = await sendPrescriptionQuote(analysisMode.id, pharmacyId, pharmacyName, quoteItems, 0, note);

        if (success) {
            playSound('success');
            setAnalysisMode(null); 
            onRefresh(); 
        } else {
            alert("Falha de conexão.");
        }
        setIsSending(false);
    };

    const stockSuggestions = useMemo(() => {
        if (!newItem.name || newItem.name.length < 2) return [];
        return myStock.filter(p => normalizeText(p.name).includes(normalizeText(newItem.name))).slice(0, 5);
    }, [myStock, newItem.name]);

    const selectFromStock = (product: Product) => {
        setNewItem({ 
            name: formatProductNameForCustomer(product.name), 
            price: String(product.price), 
            qty: 1, 
            unitType: product.unitType || 'Unidade',
            id: product.id, // CAPTURA O ID REAL
            currentStock: product.stock
        });
        setShowSuggestions(false);
        playSound('success');
    };

    const addItemToQuote = () => {
        if(!newItem.name) return;
        setQuoteItems([...quoteItems, { 
            name: newItem.name, 
            quantity: newItem.qty || 1, 
            price: Number(newItem.price) || 0, 
            available: true, 
            unitType: newItem.unitType,
            productId: newItem.id || undefined, // PASSA O ID REAL SE EXISTIR
            currentStock: newItem.currentStock
        }]);
        setNewItem({name: '', qty: 1, price: '', unitType: 'Unidade', id: '', currentStock: 0});
        setShowSuggestions(false);
        playSound('click');
    };

    const isReadOnly = analysisMode ? (
        analysisMode.status === 'ILLEGIBLE' ||
        analysisMode.status === 'EXPIRED' ||
        analysisMode.quotes?.some(q => q.pharmacyId === pharmacyId)
    ) : false;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-[32px] border shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl relative">
                        <FileText size={24}/>
                        {pendingRequests.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-ping"></span>}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">RECEITAS & ORÇAMENTOS</h2>
                        <div className="flex items-center gap-2">
                             <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">SINCRONIZAÇÃO EM TEMPO REAL</p>
                             <button onClick={handleSync} className={`p-1.5 bg-gray-50 text-emerald-600 rounded-lg transition-all ${isSyncing ? 'animate-spin' : ''}`}><RefreshCw size={14}/></button>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar">
                    <button onClick={() => setViewMode('PENDING')} className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase whitespace-nowrap ${viewMode === 'PENDING' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}>POR ATENDER ({pendingRequests.length})</button>
                    <button onClick={() => setViewMode('REVIEWS')} className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase whitespace-nowrap ${viewMode === 'REVIEWS' ? 'bg-orange-500 text-white shadow-lg' : 'bg-orange-50 text-orange-400'}`}>LETRA DIFÍCIL ({lowConfidenceRequests.length})</button>
                    <button onClick={() => setViewMode('ANSWERED')} className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase whitespace-nowrap ${viewMode === 'ANSWERED' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}>HISTÓRICO ({answeredRequests.length})</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(viewMode === 'PENDING' ? pendingRequests : (viewMode === 'REVIEWS' ? lowConfidenceRequests : answeredRequests)).map(req => (
                    <Card key={req.id} className="p-0 overflow-hidden hover:shadow-xl transition-all border-gray-100">
                        <div className="aspect-video bg-gray-900 relative">
                            <img src={req.imageUrl} className="w-full h-full object-cover opacity-60" alt="Receita" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                                <Badge color={req.status === 'ILLEGIBLE' ? 'red' : (req.quotes?.some(q => q.pharmacyId === pharmacyId) ? 'green' : (req.status === 'UNDER_REVIEW' ? 'yellow' : 'blue'))} className="mb-1 w-fit">
                                    {req.status === 'ILLEGIBLE' ? 'RECUSADA' : (req.quotes?.some(q => q.pharmacyId === pharmacyId) ? 'RESPONDIDA' : (req.status === 'UNDER_REVIEW' ? 'ANALISAR LETRA' : 'DAR PREÇOS'))}
                                </Badge>
                                <div className="text-white/70 text-[9px] font-black uppercase">{req.date}</div>
                            </div>
                        </div>
                        <div className="p-5">
                            <p className="text-xs font-bold text-gray-700 mb-4 line-clamp-2 italic leading-relaxed">
                                {req.notes && req.notes.includes('[') ? req.notes : (req.ai_metadata?.extracted_text || 'Análise Pendente...')}
                            </p>
                            <Button onClick={() => handleOpenAnalysis(req)} className={`w-full py-3 font-black text-xs uppercase ${req.status === 'UNDER_REVIEW' ? 'bg-orange-500 hover:bg-orange-600' : ''}`}>
                                {viewMode === 'ANSWERED' ? 'VER REGISTO' : (req.status === 'UNDER_REVIEW' ? 'CORRIGIR E VALIDAR' : 'VER E COTAR')}
                            </Button>
                        </div>
                    </Card>
                ))}
                {(viewMode === 'PENDING' ? pendingRequests : (viewMode === 'REVIEWS' ? lowConfidenceRequests : answeredRequests)).length === 0 && (
                    <div className="col-span-full p-12 text-center bg-gray-50 rounded-[40px] border border-dashed border-gray-200">
                        <CheckCircle2 size={32} className="mx-auto mb-4 text-gray-300"/>
                        <p className="text-gray-400 font-bold uppercase text-xs">Lista vazia.</p>
                    </div>
                )}
            </div>

            {/* Ecrã único para os 3 submenus: Por atender (Ver e Cotar), Letra difícil (Corrigir e Validar), Histórico (Ver Registo). Imagem limitada no telemóvel para o formulário ficar acessível. */}
            {analysisMode && (
                <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-fade-in safe-area-pb">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                             <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0"><Calculator size={18}/></div>
                             <div className="min-w-0">
                                <h3 className="font-black text-sm text-gray-800 uppercase truncate">Cotação de Receita</h3>
                                {customerContact && <p className="text-[10px] text-gray-500 font-bold truncate"><User size={10} className="inline mr-1"/> {customerContact.name}</p>}
                             </div>
                        </div>
                        <button onClick={() => setAnalysisMode(null)} className="p-2.5 hover:bg-gray-200 rounded-full shrink-0 touch-manipulation" aria-label="Fechar"><X size={22}/></button>
                    </div>
                    
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                        {/* No telemóvel: altura limitada (38vh) para o formulário ficar visível; no desktop metade do ecrã */}
                        <div className="md:w-1/2 bg-black flex flex-col items-center justify-center p-3 md:p-4 relative shrink-0 md:shrink min-h-0 max-h-[38vh] md:max-h-none">
                            <img 
                                src={analysisMode.imageUrl} 
                                className="max-h-full max-w-full object-contain select-none" 
                                alt="Receita médica" 
                                draggable={false}
                            />
                            <button
                                type="button"
                                onClick={() => setImageFullscreen(true)}
                                className="md:hidden mt-2 py-2 px-4 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors"
                            >
                                <Maximize2 size={14}/> Ver imagem em ecrã inteiro
                            </button>
                        </div>

                        {/* Overlay: imagem em ecrã inteiro (telemóvel) — fecha com botão grande */}
                        {imageFullscreen && (
                            <div className="fixed inset-0 z-[210] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Receita em ecrã inteiro">
                                <div className="flex justify-end p-4 shrink-0">
                                    <button
                                        onClick={() => setImageFullscreen(false)}
                                        className="p-3 bg-white/90 hover:bg-white text-gray-800 rounded-2xl font-black text-sm shadow-lg touch-manipulation"
                                        aria-label="Fechar"
                                    >
                                        Fechar
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
                                    <img 
                                        src={analysisMode.imageUrl} 
                                        className="max-h-full max-w-full object-contain" 
                                        alt="Receita médica em ecrã inteiro"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar bg-white min-h-0">
                            {analysisMode.notes && <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl text-xs font-bold text-blue-800"><MessageSquare size={12} className="inline mr-1"/> Nota: {analysisMode.notes}</div>}

                            {!isReadOnly ? (
                                <>
                                    <div className="space-y-3 mb-6">
                                        {quoteItems.map((it: any, idx) => (
                                            <div key={idx} className={`flex items-center gap-2 p-3 bg-white border rounded-2xl shadow-sm ${it.productId ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between mb-1">
                                                        <label className="text-[8px] font-black text-gray-400 uppercase">Medicamento</label>
                                                        {/* INDICA SE ESTÁ VINCULADO AO STOCK E AVISA SE STOCK FOR BAIXO */}
                                                        {it.productId ? 
                                                            <div className="flex gap-2">
                                                                <span className="text-[8px] font-black text-emerald-600 flex items-center gap-1"><CheckCircle2 size={8}/> STOCK ({it.unitType?.toUpperCase()})</span>
                                                                {/* ALERTA DE STOCK BAIXO */}
                                                                {(it.currentStock < 5) && (
                                                                    <span className="text-[8px] font-black text-red-500 flex items-center gap-1 animate-pulse"><AlertOctagon size={8}/> RESTAM {it.currentStock}</span>
                                                                )}
                                                            </div> : 
                                                            <span className="text-[8px] font-black text-orange-400 flex items-center gap-1"><AlertTriangle size={8}/> MANUAL (NÃO BAIXA STOCK)</span>
                                                        }
                                                    </div>
                                                    <input className="w-full bg-transparent border-none outline-none font-bold text-gray-800 text-sm uppercase truncate" value={it.name} onChange={e => {
                                                        const updated = [...quoteItems]; 
                                                        updated[idx].name = e.target.value; 
                                                        updated[idx].productId = undefined; // Perde o vínculo se editar o nome
                                                        updated[idx].currentStock = undefined;
                                                        updated[idx].isMatched = false;
                                                        setQuoteItems(updated);
                                                    }} />
                                                </div>
                                                <div className="w-16">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase mb-0.5 text-center block">Qtd</label>
                                                    <input type="number" className="w-full p-2 bg-gray-50 border rounded-lg font-black text-center text-xs" value={it.quantity} onChange={e => {
                                                        const updated = [...quoteItems]; 
                                                        updated[idx].quantity = Number(e.target.value); 
                                                        setQuoteItems(updated);
                                                    }} />
                                                </div>
                                                <div className="w-24">
                                                    <label className="text-[8px] font-black text-gray-400 uppercase mb-0.5 text-center block">Preço Unit.</label>
                                                    <input type="number" className="w-full p-2 bg-emerald-50 border border-emerald-100 rounded-lg font-black text-center text-emerald-700 text-xs" placeholder="0" value={it.price} onChange={e => {
                                                        const updated = [...quoteItems]; 
                                                        updated[idx].price = Number(e.target.value); 
                                                        setQuoteItems(updated);
                                                    }} />
                                                </div>
                                                <button onClick={() => setQuoteItems(quoteItems.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 p-2"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-200 mb-6">
                                        <div className="flex items-center gap-2 text-gray-500">
                                            <Calculator size={18}/>
                                            <span className="text-xs font-black uppercase">Total (Qtd x Preço)</span>
                                        </div>
                                        <span className="text-xl font-black text-emerald-600">Kz {totalQuoteValue.toLocaleString()}</span>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100 mb-6">
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16}/>
                                                <input className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl outline-none font-bold text-sm uppercase" placeholder="Adicionar item do stock..." value={newItem.name} onFocus={() => setShowSuggestions(true)} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                                                {showSuggestions && stockSuggestions.length > 0 && (
                                                    <div className="absolute top-full left-0 w-full bg-white border rounded-xl shadow-xl mt-1 z-50 max-h-40 overflow-y-auto">
                                                        {stockSuggestions.map(s => (
                                                            <div key={s.id} onClick={() => selectFromStock(s)} className="p-3 hover:bg-emerald-50 cursor-pointer border-b flex justify-between items-center">
                                                                <div>
                                                                    <span className="text-xs font-bold block">{formatProductNameForCustomer(s.name)}</span>
                                                                    <div className="flex gap-2">
                                                                        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1 rounded">{s.unitType || 'Unidade'}</span>
                                                                        {s.stock < 10 && <span className="text-[9px] font-black text-red-500 uppercase">Pouco Stock ({s.stock})</span>}
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] font-black text-emerald-600">Kz {s.price}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <input type="number" className="w-16 py-3 px-1 bg-gray-50 rounded-xl outline-none font-black text-center text-sm" placeholder="Qtd" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: Number(e.target.value)})} />
                                            <input type="number" className="w-24 py-3 px-2 bg-gray-50 rounded-xl outline-none font-black text-center text-sm" placeholder="Preço" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                                            <button onClick={addItemToQuote} className="p-3 bg-emerald-600 text-white rounded-xl shadow-lg"><Plus size={20}/></button>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mensagem para o Utente</label>
                                        <textarea className="w-full p-4 bg-gray-50 border rounded-2xl outline-none text-sm h-20 resize-none font-medium" placeholder="Ex: Temos apenas o genérico." value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)} />
                                    </div>

                                    <div className="flex gap-3 pt-4 border-t">
                                        <button onClick={handleMarkIllegible} disabled={isSending} className="flex-1 py-4 bg-red-50 text-red-500 rounded-xl font-black text-xs uppercase hover:bg-red-500 hover:text-white transition-all border border-red-100">Recusar Pedido</button>
                                        <Button onClick={handleValidateAndSend} disabled={quoteItems.length === 0 || isSending} className="flex-[2] py-4 bg-emerald-600 shadow-xl font-black text-sm rounded-xl uppercase text-white">
                                            {isSending ? <Loader2 className="animate-spin" /> : <Send size={18} className="mr-2"/>} Enviar Orçamento
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className={`p-8 rounded-3xl text-center border-2 border-dashed ${analysisMode.status === 'ILLEGIBLE' ? 'border-red-200 bg-red-50 text-red-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                                    {analysisMode.status === 'ILLEGIBLE' ? <Ban size={48} className="mx-auto mb-2"/> : <CheckCircle2 size={48} className="mx-auto mb-2"/>}
                                    <h4 className="font-black uppercase text-lg">{analysisMode.status === 'ILLEGIBLE' ? 'Receita Recusada' : 'Orçamento Enviado'}</h4>
                                    <p className="text-xs font-bold opacity-70 mt-1">Este pedido já foi processado.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
