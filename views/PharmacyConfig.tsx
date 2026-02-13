
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Badge, Toast } from '../components/UI';
import { PharmacyInput, User, Product, GlobalProduct } from '../types';
import { 
    fetchPharmacyById, updatePharmacyDetails, 
    fetchPharmacyReviews, fetchProducts, setProductPromotion,
    fetchGlobalCatalog
} from '../services/dataService';
import { 
    Settings, Save, Megaphone, Star, Lock, Truck, Clock, 
    Phone, MapPin, Hash, Store, RefreshCw, LogOut, Mail, 
    Loader2, MessageSquare, Instagram, CreditCard, Camera, 
    ChevronRight, Info, Plus, X, Trash2, Tag, Percent, 
    TrendingDown, Sparkles, CheckCircle2, Search, Target,
    BarChart2
} from 'lucide-react';
import { playSound } from '../services/soundService';

export const PharmacySettingsView = ({ pharmacyId, onComplete }: { pharmacyId?: string, onComplete?: () => void }) => {
    const [data, setData] = useState<PharmacyInput>({ 
        name: '', nif: '', address: '', deliveryFee: 0, minTime: '', rating: 5, phone: '',
        logoUrl: '', description: '', openingHours: '', paymentMethods: [], instagram: ''
    });
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    const PAYMENT_OPTIONS = [
        { id: 'CASH', label: 'Dinheiro', icon: <Hash size={14}/> },
        { id: 'TPA', label: 'Cartão (TPA)', icon: <CreditCard size={14}/> },
        { id: 'EXPRESS', label: 'MCX Express', icon: <Phone size={14}/> },
        { id: 'TRANSFER', label: 'Transferência', icon: <RefreshCw size={14}/> }
    ];

    useEffect(() => { if(pharmacyId) loadData(); }, [pharmacyId]);
    
    const loadData = async () => {
        const pharm = await fetchPharmacyById(pharmacyId!);
        if(pharm) setData({ 
            name: pharm.name || '', 
            nif: pharm.nif || '', 
            address: pharm.address || '', 
            deliveryFee: pharm.deliveryFee || 0, 
            minTime: pharm.minTime || '30 min', 
            rating: pharm.rating || 5, 
            phone: pharm.phone || '',
            logoUrl: pharm.logoUrl || '',
            description: pharm.description || '',
            openingHours: pharm.openingHours || '',
            paymentMethods: Array.isArray(pharm.paymentMethods) ? pharm.paymentMethods : [],
            instagram: pharm.instagram || ''
        });
    };

    const handleSave = async () => {
        if (!data.name || !data.address) {
            setToast({msg: "Nome e endereço são obrigatórios!", type: 'error'});
            return;
        }
        setLoading(true);
        
        // HIGIENIZAÇÃO: Garante que os dados enviados são compatíveis com o banco
        const payload: PharmacyInput = {
            name: data.name.trim(),
            nif: data.nif?.trim() || '',
            address: data.address.trim(),
            deliveryFee: Number(data.deliveryFee) || 0,
            minTime: data.minTime || '35 min',
            rating: data.rating || 5,
            phone: data.phone?.trim() || '',
            logoUrl: data.logoUrl?.trim() || '',
            description: data.description?.trim() || '',
            openingHours: data.openingHours?.trim() || '',
            paymentMethods: data.paymentMethods || [],
            instagram: data.instagram?.trim() || ''
        };

        const success = await updatePharmacyDetails(pharmacyId!, payload);
        
        setLoading(false);
        if(success) { 
            playSound('save'); 
            setToast({msg: "Perfil atualizado!", type: 'success'});
            if(onComplete) onComplete(); 
        } else {
            setToast({msg: "Falha ao sincronizar com o banco de dados.", type: 'error'});
        }
    };

    const togglePayment = (id: string) => {
        const current = data.paymentMethods || [];
        const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
        setData({ ...data, paymentMethods: next });
        playSound('click');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-24 px-4">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl shadow-inner"><Settings size={24}/></div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Identidade & Vitrine</h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Personalize como os clientes veem sua farmácia</p>
                    </div>
                </div>
                <Button onClick={handleSave} disabled={loading} className="px-10 py-4 font-black shadow-xl shadow-emerald-100 uppercase tracking-widest rounded-2xl text-white bg-emerald-600">
                    {loading ? <Loader2 className="animate-spin mr-2"/> : <Save size={20} className="mr-2"/>} 
                    Gravar Perfil
                </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                
                <div className="lg:col-span-1 space-y-6">
                    <Card className="p-6 text-center border-emerald-50 rounded-[40px] shadow-sm">
                        <div className="relative group mx-auto mb-6 w-32 h-32">
                            <div className="w-full h-full bg-gray-50 border-2 border-dashed border-emerald-200 rounded-[40px] flex items-center justify-center overflow-hidden shadow-inner">
                                {data.logoUrl ? (
                                    <img src={data.logoUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <Camera size={40} className="text-emerald-200" />
                                )}
                            </div>
                        </div>
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Logo da Farmácia (URL)</h4>
                        <input 
                            className="w-full p-3 bg-gray-50 border rounded-xl text-[10px] font-mono outline-none focus:ring-2 focus:ring-emerald-500" 
                            placeholder="URL da imagem..."
                            value={data.logoUrl}
                            onChange={e => setData({...data, logoUrl: e.target.value})}
                        />
                    </Card>

                    <Card className="p-6 rounded-[32px] border-blue-50 shadow-sm">
                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <CreditCard size={14}/> Pagamentos Aceites
                        </h4>
                        <div className="space-y-2">
                            {PAYMENT_OPTIONS.map(opt => (
                                <div 
                                    key={opt.id} 
                                    onClick={() => togglePayment(opt.id)}
                                    className={`p-3 rounded-2xl border-2 cursor-pointer flex items-center justify-between transition-all ${data.paymentMethods?.includes(opt.id) ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-gray-100 opacity-60'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${data.paymentMethods?.includes(opt.id) ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>{opt.icon}</div>
                                        <span className={`text-[10px] font-black uppercase ${data.paymentMethods?.includes(opt.id) ? 'text-emerald-900' : 'text-gray-400'}`}>{opt.label}</span>
                                    </div>
                                    {data.paymentMethods?.includes(opt.id) && <CheckCircle2 size={16} className="text-emerald-600"/>}
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <Card className="p-8 rounded-[40px] shadow-sm border-gray-50">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Info size={18} className="text-emerald-500"/> Informação Pública
                        </h3>
                        <div className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Nome Comercial</label>
                                    <input className="w-full p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 font-bold" value={data.name} onChange={e => setData({...data, name: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Instagram (@)</label>
                                    <div className="relative">
                                        <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
                                        <input className="w-full pl-12 p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-4 focus:ring-pink-50 font-bold" value={data.instagram} onChange={e => setData({...data, instagram: e.target.value})}/>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Sobre a Farmácia (Bio)</label>
                                <textarea className="w-full p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 min-h-[100px] text-sm" placeholder="Conte sua história aos clientes..." value={data.description} onChange={e => setData({...data, description: e.target.value})}/>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-8 rounded-[40px] shadow-sm border-gray-50">
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Clock size={18} className="text-blue-500"/> Horários de Atendimento
                        </h3>
                        <textarea 
                            className="w-full p-4 bg-gray-50 border rounded-[24px] outline-none focus:ring-4 focus:ring-blue-50 min-h-[120px] font-mono text-xs leading-relaxed" 
                            placeholder="Seg-Sex: 08h às 19h&#10;Sab: 09h às 13h"
                            value={data.openingHours}
                            onChange={e => setData({...data, openingHours: e.target.value})}
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
};

export const PharmacyPromotionsView = ({ pharmacyId }: { pharmacyId?: string }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [marketPrice, setMarketPrice] = useState<number | null>(null);
    const [discountPercent, setDiscountPercent] = useState(15);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        const data = await fetchProducts(pharmacyId);
        setProducts(data);
        setLoading(false);
    };

    // IA DE APOIO À DECISÃO: Busca no catálogo global quando um item é selecionado
    useEffect(() => {
        const checkMarket = async () => {
            if(selectedProduct?.name) {
                // FIXED: Corrigido o tipo de retorno de fetchGlobalCatalog para suportar paginação
                const { data } = await fetchGlobalCatalog(selectedProduct.name);
                const match = data.find(g => g.name.toLowerCase().includes(selectedProduct.name.toLowerCase()));
                setMarketPrice(match?.referencePrice || null);
            } else {
                setMarketPrice(null);
            }
        }
        checkMarket();
    }, [selectedProduct]);

    const promoProducts = useMemo(() => products.filter(p => p.isPromotion), [products]);
    const normalProducts = useMemo(() => products.filter(p => !p.isPromotion && p.name.toLowerCase().includes(searchTerm.toLowerCase())), [products, searchTerm]);

    const handleCreatePromo = async () => {
        if(!selectedProduct) return;
        setActionLoading(true);
        const newPrice = Math.floor(selectedProduct.price * (1 - discountPercent / 100));
        const success = await setProductPromotion(selectedProduct.id, true, newPrice);
        if(success) {
            playSound('success');
            setToast({msg: "Oferta Ativada!", type: 'success'});
            setIsCreating(false);
            setSelectedProduct(null);
            await load();
        }
        setActionLoading(false);
    };

    const handleRemovePromo = async (id: string) => {
        const success = await setProductPromotion(id, false, undefined);
        if(success) { playSound('trash'); await load(); }
    };

    const currentFinalPrice = selectedProduct ? Math.floor(selectedProduct.price * (1 - discountPercent / 100)) : 0;
    const isHighlyCompetitive = marketPrice ? currentFinalPrice <= (marketPrice * 1.05) : false;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-24 px-4">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[40px] shadow-sm border border-emerald-50">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 flex items-center gap-3"><Tag className="text-orange-500" size={32}/> Promoções Flash</h1>
                    <p className="text-sm text-gray-400 font-bold uppercase mt-1">Sua vitrine em destaque no Shopping FarmoLink</p>
                </div>
                <Button onClick={() => setIsCreating(true)} className="px-10 py-5 bg-orange-500 hover:bg-orange-600 font-black rounded-[24px] shadow-xl shadow-orange-100 flex items-center gap-2 text-white">
                    <Plus size={22}/> Criar Campanha
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><RefreshCw className="animate-spin text-emerald-600" size={40}/></div>
            ) : promoProducts.length === 0 ? (
                <div className="bg-white p-20 rounded-[50px] border-4 border-dashed border-gray-100 text-center flex flex-col items-center">
                    <Tag className="text-gray-200 mb-6" size={60}/>
                    <h3 className="font-black text-xl text-gray-400 uppercase tracking-widest">Nenhuma oferta ativa</h3>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {promoProducts.map(p => (
                        <Card key={p.id} className="p-6 rounded-[32px] border-orange-100 bg-white relative overflow-hidden group hover:shadow-2xl transition-all">
                            <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg">PROMO</div>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 bg-gray-50 rounded-2xl p-2 border shadow-inner"><img src={p.image} className="w-full h-full object-contain" /></div>
                                <div className="min-w-0">
                                    <h4 className="font-black text-gray-800 text-sm truncate">{p.name}</h4>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{p.category}</p>
                                </div>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-2xl flex items-center justify-between mb-6">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 font-bold line-through">Kz {p.price.toLocaleString()}</span>
                                    <span className="text-2xl font-black text-emerald-600">Kz {p.discountPrice?.toLocaleString()}</span>
                                </div>
                                <div className="text-orange-600 font-black text-lg">-{Math.round(((p.price - (p.discountPrice || 0))/p.price)*100)}%</div>
                            </div>
                            <button onClick={() => handleRemovePromo(p.id)} className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2">
                                <Trash2 size={14}/> Encerrar Campanha
                            </button>
                        </Card>
                    ))}
                </div>
            )}

            {isCreating && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
                    <Card className="w-full max-w-3xl p-8 rounded-[40px] shadow-2xl animate-scale-in max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-8 shrink-0">
                            <h3 className="text-2xl font-black text-gray-800 flex items-center gap-2"><Sparkles className="text-emerald-500"/> Criar Oferta Inteligente</h3>
                            <button onClick={() => { setIsCreating(false); setSelectedProduct(null); }} className="p-3 hover:bg-gray-100 rounded-full transition-all"><X size={24}/></button>
                        </div>

                        {!selectedProduct ? (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                <div className="bg-gray-50 p-2 rounded-2xl flex items-center gap-3 mb-6 shrink-0 border">
                                    <Search className="text-gray-300 ml-3" size={20}/>
                                    <input className="flex-1 p-3 bg-transparent outline-none font-bold text-sm" placeholder="Buscar no inventário..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                                    {normalProducts.map(p => (
                                        <div key={p.id} onClick={() => setSelectedProduct(p)} className="p-4 bg-white border border-gray-100 rounded-[24px] flex items-center justify-between hover:bg-emerald-50 cursor-pointer transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-50 rounded-xl p-2 border"><img src={p.image} className="w-full h-full object-contain" /></div>
                                                <p className="font-bold text-gray-800 text-sm">{p.name}</p>
                                            </div>
                                            <ChevronRight className="text-gray-200 group-hover:text-emerald-500"/>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-8 animate-scale-in">
                                <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 flex items-center gap-6">
                                    <div className="w-16 h-16 bg-white rounded-2xl p-2 shadow-sm"><img src={selectedProduct.image} className="w-full h-full object-contain" /></div>
                                    <div className="flex-1">
                                        <h4 className="font-black text-emerald-900">{selectedProduct.name}</h4>
                                        <p className="text-sm font-bold text-emerald-700">Preço Normal: Kz {selectedProduct.price.toLocaleString()}</p>
                                    </div>
                                    <button onClick={() => setSelectedProduct(null)} className="p-2 text-emerald-300 hover:text-emerald-600"><X size={20}/></button>
                                </div>

                                <div className="grid md:grid-cols-2 gap-8">
                                    <Card className="p-6 bg-gray-50 border-none rounded-[32px]">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Aplicar Desconto (%)</label>
                                        <div className="flex items-center gap-6">
                                            <input type="range" min="5" max="70" step="5" className="flex-1 accent-emerald-600" value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))} />
                                            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center border-4 border-emerald-500 shadow-lg">
                                                <span className="text-2xl font-black text-emerald-600">{discountPercent}%</span>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* APOIO À DECISÃO: Lógica Híbrida Inteligente */}
                                    <Card className={`p-6 rounded-[32px] border-2 flex flex-col justify-center transition-all duration-500 ${isHighlyCompetitive ? 'bg-emerald-900 text-white border-emerald-400 scale-105 shadow-2xl' : 'bg-orange-50 border-orange-200 shadow-sm'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            {isHighlyCompetitive ? <Target className="text-emerald-400" size={18}/> : <BarChart2 className="text-orange-500" size={18}/>}
                                            <span className="text-[10px] font-black uppercase tracking-widest">Análise de Competitividade</span>
                                        </div>
                                        <div className="text-3xl font-black mb-1">Kz {currentFinalPrice.toLocaleString()}</div>
                                        {marketPrice ? (
                                            <div className="space-y-1">
                                                <p className={`text-[10px] font-bold ${isHighlyCompetitive ? 'text-emerald-300' : 'text-orange-700'}`}>
                                                    Média na Rede: Kz {marketPrice.toLocaleString()}
                                                </p>
                                                <p className="text-[9px] opacity-80 uppercase font-black">
                                                    {isHighlyCompetitive ? '✨ Preço Altamente Competitivo!' : '⚠️ Preço acima da média da rede.'}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[9px] opacity-60 uppercase font-black italic">Item exclusivo sem dados de rede.</p>
                                        )}
                                    </Card>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <Button variant="outline" className="flex-1 py-5 rounded-[24px] font-bold" onClick={() => setSelectedProduct(null)}>Voltar</Button>
                                    <Button onClick={handleCreatePromo} disabled={actionLoading} className="flex-[2] py-5 bg-emerald-600 shadow-2xl font-black text-xl rounded-[24px] text-white">
                                        {actionLoading ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle2 className="mr-2" size={24}/>} 
                                        Ativar Promoção
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

export const PharmacyPendingView = ({ user, onCheckAgain, onLogout }: { user?: User, onCheckAgain: () => Promise<void>, onLogout: () => void }) => {
    const [isChecking, setIsChecking] = useState(false);

    const handleCheck = async () => {
        setIsChecking(true);
        await onCheckAgain();
        setIsChecking(false);
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center p-6 text-center">
            <div className="animate-fade-in max-w-md w-full bg-white p-12 rounded-[40px] shadow-2xl border border-yellow-50">
                <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
                    <Lock size={48} className={isChecking ? "animate-spin" : "animate-bounce"}/>
                </div>
                <h1 className="text-3xl font-black text-gray-800 mb-4 uppercase tracking-tighter">Acesso Restrito</h1>
                <p className="text-gray-500 text-sm leading-relaxed mb-10 font-medium">Sua conta está sob auditoria de segurança. Nossa equipa validará seus dados em até 24 horas.</p>
                
                <div className="space-y-4">
                    <Button onClick={handleCheck} disabled={isChecking} className="w-full py-5 bg-emerald-600 rounded-3xl shadow-xl shadow-emerald-100 font-black text-white">
                        {isChecking ? <Loader2 className="animate-spin mr-2"/> : "VERIFICAR AGORA"}
                    </Button>
                    <button 
                        onClick={onLogout}
                        className="w-full py-3 text-gray-400 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                        Encerrar Sessão
                    </button>
                </div>
            </div>
        </div>
    );
};

export const PharmacyReviewsView = ({ pharmacyId }: { pharmacyId: string }) => {
    const [reviews, setReviews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const data = await fetchPharmacyReviews(pharmacyId);
            setReviews(data);
            setLoading(false);
        };
        load();
    }, [pharmacyId]);

    return (
        <div className="animate-fade-in max-w-4xl mx-auto px-4 space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Avaliações da Rede</h2>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">O que os pacientes dizem do seu serviço</p>
                </div>
                <div className="p-4 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center gap-2">
                    <Star className="fill-yellow-600" size={20}/>
                    <span className="text-xl font-black">5.0</span>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin text-emerald-600" size={40}/></div>
            ) : reviews.length === 0 ? (
                <div className="bg-white p-20 rounded-[40px] border border-dashed text-center flex flex-col items-center">
                    <MessageSquare className="text-gray-100 mb-4" size={60}/>
                    <p className="text-gray-400 font-black uppercase tracking-widest text-sm">Sem depoimentos registrados</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {reviews.map((r, i) => (
                        <Card key={i} className="p-8 rounded-[32px] border-gray-100 shadow-sm bg-white">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">{r.customer_name.charAt(0)}</div>
                                    <div>
                                        <p className="font-black text-gray-800 text-sm">{r.customer_name}</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">{new Date(r.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    {[...Array(5)].map((_, idx) => (
                                        <Star key={idx} size={14} className={idx < r.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"} />
                                    ))}
                                </div>
                            </div>
                            <p className="text-sm text-gray-600 font-medium leading-relaxed italic">"{r.comment || 'Avaliação positiva sem comentários.'}"</p>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
