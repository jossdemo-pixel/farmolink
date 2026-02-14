
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, MapPin, Plus, Store, Upload, Star, ArrowLeft, Pill, ChevronRight, Bike, Clock, ShoppingCart, X, Loader2, AlertCircle, AlertTriangle, FileText, MessageCircle, Send, History, RefreshCw, Trophy, Sparkles, Navigation, Truck, Phone, ChevronDown, ChevronLeft, Trash2 } from 'lucide-react';
import { Product, Pharmacy, PRODUCT_CATEGORIES, CartItem, Order, ChatMessage } from '../types';
import { Button, Badge, Card } from '../components/UI';
import { playSound } from '../services/soundService';
import { formatProductNameForCustomer } from '../services/geminiService';
import { fetchProducts } from '../services/productService';
import { formatDistance, getCurrentPosition } from '../services/locationService';

const optimizeImg = (url: string) => {
    if (!url.includes('cloudinary')) return url;
    return url.replace('/upload/', '/upload/q_auto,f_auto,w_400/');
};

const normalizeText = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const HomeView = ({ products, pharmacies, onAddToCart, onNavigate, onViewPharmacy }: any) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [page, setPage] = useState(0);
  const [extraProducts, setExtraProducts] = useState<Product[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const allVisibleProducts = useMemo(() => [...products, ...extraProducts], [products, extraProducts]);

  const topPharmacies = useMemo(() => {
      return [...pharmacies]
          .sort((a, b) => {
              if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
              if (a.distanceKm && b.distanceKm) return a.distanceKm - b.distanceKm;
              return (b.review_score || 0) - (a.review_score || 0);
          })
          .slice(0, 4);
  }, [pharmacies]);

  const filteredProducts = useMemo(() => {
    return allVisibleProducts.filter((p: Product) => {
        const matchCat = activeCategory === 'Todos' || p.category === activeCategory;
        const matchSearch = !searchTerm || normalizeText(p.name).includes(normalizeText(searchTerm));
        return matchCat && matchSearch;
    });
  }, [allVisibleProducts, searchTerm, activeCategory]);

  const loadMore = async () => {
      if (loadingMore) return;
      setLoadingMore(true);
      const nextPage = page + 1;
      const data = await fetchProducts(undefined, nextPage);
      if (data.length < 20) setHasMore(false);
      setExtraProducts(prev => [...prev, ...data]);
      setPage(nextPage);
      setLoadingMore(false);
  };

  return (
    <div className="space-y-8 pb-32 animate-fade-in relative"> 
      
      <div className="bg-emerald-600 rounded-[40px] p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10">
              <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight max-w-xl">Sua saúde, agora digital e acessível.</h1>
              <p className="text-emerald-50 opacity-90 mb-10 max-w-md text-lg">Compare preços em tempo real e receba seus medicamentos onde estiver.</p>
              <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => onNavigate('upload-rx')} 
                    className="bg-white text-emerald-800 px-8 py-5 rounded-[24px] font-black flex items-center justify-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all text-base"
                  >
                    <Upload size={22}/> Enviar Receita
                  </button>
                  <button 
                    onClick={() => onNavigate('pharmacies-list')} 
                    className="bg-emerald-500/40 backdrop-blur-md text-white px-8 py-5 rounded-[24px] font-black flex items-center justify-center gap-3 shadow-xl hover:bg-emerald-500/60 active:scale-95 transition-all border-2 border-white/30 text-base"
                  >
                    <Store size={22}/> Ver Farmácias
                  </button>
              </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
          <Pill className="absolute -bottom-10 -right-10 text-white opacity-10 w-64 h-64 rotate-45" />
      </div>

      <div className="animate-scale-in">
          <div className="flex justify-between items-center mb-6 px-2">
              <div className="flex items-center gap-2">
                <Navigation size={18} className="text-blue-500 animate-pulse"/>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-800">Mais Próximas de Si</h3>
              </div>
              <button onClick={() => onNavigate('pharmacies-list')} className="text-xs font-bold text-emerald-600 hover:underline">Ver Farmácias</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {topPharmacies.map((p: Pharmacy) => (
                  <div key={p.id} onClick={() => onViewPharmacy(p.id)} className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-black text-lg">{p.name.charAt(0)}</div>
                          {p.distanceKm ? (
                              <span className="bg-blue-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg">
                                  {formatDistance(p.distanceKm)}
                              </span>
                          ) : <Sparkles size={14} className="text-yellow-400" />}
                      </div>
                      <h4 className="font-black text-gray-800 text-sm truncate">{p.name}</h4>
                      <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-1">
                              <Star size={10} className="fill-yellow-400 text-yellow-400"/>
                              <span className="text-[10px] font-black text-gray-400">{p.rating.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                              <Truck size={10} className={p.deliveryActive ? "text-emerald-500" : "text-gray-300"} />
                              <span className={`text-[8px] font-black uppercase ${p.deliveryActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                                {p.deliveryActive ? 'Entregas ON' : 'Apenas Loja'}
                              </span>
                          </div>
                          {!p.isAvailable && <span className="text-[8px] font-black text-red-500 uppercase">Loja Fechada</span>}
                      </div>
                  </div>
              ))}
          </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['Todos', ...PRODUCT_CATEGORIES.slice(0, 10)].map(c => (
              <button key={c} onClick={() => setActiveCategory(c)} className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${activeCategory === c ? 'bg-emerald-600 text-white shadow-md' : 'bg-white border text-gray-400 hover:border-emerald-300'}`}>{c}</button>
          ))}
      </div>

      <div className="space-y-4">
          <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-3">
              <Search className="text-gray-300 ml-4" size={20}/>
              <input placeholder="Procurar medicamento..." className="w-full py-4 outline-none font-bold text-gray-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredProducts.map((p: Product) => (
                  <div key={p.id} onClick={() => onAddToCart(p)} className="bg-white p-4 rounded-3xl border shadow-sm hover:shadow-xl transition-all group flex flex-col cursor-pointer">
                      <div className="aspect-square bg-gray-50 rounded-2xl mb-4 flex items-center justify-center p-4">
                          <img src={optimizeImg(p.image)} className="max-h-full group-hover:scale-110 transition-transform" loading="lazy" alt={p.name} />
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm mb-4 flex-1">{formatProductNameForCustomer(p.name)}</h4>
                      <div className="flex justify-between items-center pt-3 border-t">
                          <span className="font-black text-emerald-600">Kz {p.price.toLocaleString()}</span>
                          <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl group-hover:bg-emerald-600 group-hover:text-white"><Plus size={18}/></div>
                      </div>
                  </div>
              ))}
          </div>

          {hasMore && !searchTerm && activeCategory === 'Todos' && (
              <div className="flex justify-center pt-10">
                  <button onClick={loadMore} disabled={loadingMore} className="px-12 py-4 bg-white border-2 border-emerald-600 text-emerald-600 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center gap-3 shadow-lg">
                      {loadingMore ? <Loader2 className="animate-spin" size={18}/> : 'Carregar Mais'}
                  </button>
              </div>
          )}
      </div>
    </div>
  );
};

export const AllPharmaciesView = ({ pharmacies, onViewPharmacy }: any) => {
    const [q, setQ] = useState('');
    const [viewFilter, setViewFilter] = useState<'ALL' | 'OPEN' | 'DELIVERY'>('ALL');
    const openCount = pharmacies.filter((p: Pharmacy) => p.isAvailable).length;
    const deliveryCount = pharmacies.filter((p: Pharmacy) => p.deliveryActive).length;

    const filtered = pharmacies
        .filter((p: Pharmacy) => normalizeText(p.name).includes(normalizeText(q)))
        .filter((p: Pharmacy) => {
            if (viewFilter === 'OPEN') return p.isAvailable;
            if (viewFilter === 'DELIVERY') return p.deliveryActive;
            return true;
        })
        .sort((a: any, b: any) => {
            if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
            if (a.deliveryActive !== b.deliveryActive) return a.deliveryActive ? -1 : 1;
            if (typeof a.distanceKm === 'number' && typeof b.distanceKm === 'number') return a.distanceKm - b.distanceKm;
            return (b.review_score || b.rating || 0) - (a.review_score || a.rating || 0);
        });

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <h1 className="text-3xl font-black text-gray-800">Farmácias Parceiras</h1>
            <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-3 max-w-xl">
                <Search className="text-gray-300 ml-4" size={20}/>
                <input placeholder="Pesquisar farmácia..." className="w-full py-4 outline-none font-bold text-gray-700" value={q} onChange={e => setQ(e.target.value)}/>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                    onClick={() => setViewFilter('ALL')}
                    className={`px-4 py-2 rounded-full text-[11px] font-black whitespace-nowrap transition-all ${viewFilter === 'ALL' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-500'}`}
                >
                    Todas ({pharmacies.length})
                </button>
                <button
                    onClick={() => setViewFilter('OPEN')}
                    className={`px-4 py-2 rounded-full text-[11px] font-black whitespace-nowrap transition-all ${viewFilter === 'OPEN' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-500'}`}
                >
                    Abertas ({openCount})
                </button>
                <button
                    onClick={() => setViewFilter('DELIVERY')}
                    className={`px-4 py-2 rounded-full text-[11px] font-black whitespace-nowrap transition-all ${viewFilter === 'DELIVERY' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-500'}`}
                >
                    Com entrega ({deliveryCount})
                </button>
            </div>
            <div className="space-y-4 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-6 md:space-y-0">
                {filtered.map((p: Pharmacy) => (
                    <div key={p.id} onClick={() => onViewPharmacy(p.id)} className="bg-white p-5 rounded-[28px] border hover:shadow-2xl cursor-pointer transition-all group">
                        <div className="flex gap-4 items-start">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center font-black text-xl shrink-0">{p.name.charAt(0)}</div>
                            <div className="min-w-0 flex-1">
                                <div className="flex justify-between items-start gap-2">
                                    <h3 className="text-base md:text-lg font-black text-gray-800 leading-tight line-clamp-2">{p.name}</h3>
                                    {typeof p.distanceKm === 'number' && (
                                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 rounded-full shrink-0">
                                            {formatDistance(p.distanceKm)}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 font-semibold mt-2 line-clamp-2">{p.address}</p>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <Badge color={p.isAvailable ? 'green' : 'gray'}>{p.isAvailable ? 'Loja Aberta' : 'Loja Fechada'}</Badge>
                                    <Badge color={p.deliveryActive ? 'blue' : 'gray'} className="!text-[9px]">
                                        {p.deliveryActive ? 'Faz Entrega' : 'Apenas Levantamento'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-4 mt-4 border-t font-black">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 uppercase">Taxa de Entrega</span>
                                <span className={p.deliveryActive ? "text-emerald-600" : "text-gray-300 line-through"}>
                                    Kz {p.deliveryFee.toLocaleString()}
                                </span>
                            </div>
                            <ChevronRight className="text-gray-300 group-hover:text-emerald-600"/>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- NOVO COMPONENTE: PHARMACY PROFILE (ON-DEMAND) ---
// Carrega produtos sob demanda (paginação + busca server-side) para economizar dados.
export const PharmacyProfileView = ({ pharmacy, onAddToCart, onBack }: { pharmacy: Pharmacy, onAddToCart: (p: Product) => void, onBack: () => void }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    
    // Carregamento inicial (apenas primeiros 20)
    useEffect(() => {
        loadData(0, true);
    }, [pharmacy.id]);

    // Delay na pesquisa para não disparar requests a cada letra
    useEffect(() => {
        const timer = setTimeout(() => {
            loadData(0, true);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const loadData = async (targetPage: number, reset: boolean) => {
        if (reset) setLoading(true); else setLoadingMore(true);
        
        try {
            // Busca no servidor com filtro de texto e paginação
            const data = await fetchProducts(pharmacy.id, targetPage, 20, searchTerm);
            
            if (reset) {
                setProducts(data);
                setPage(0);
            } else {
                setProducts(prev => [...prev, ...data]);
                setPage(targetPage);
            }
            
            // Se veio menos que o limite, acabou a lista
            if (data.length < 20) setHasMore(false);
            else setHasMore(true);

        } catch (e) {
            console.error("Erro ao carregar farmácia", e);
        } finally {
            if (reset) setLoading(false); else setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        loadData(page + 1, false);
    };

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            <button onClick={onBack} className="text-emerald-600 font-black text-xs uppercase mb-2 flex items-center gap-2">
                <ArrowLeft size={16}/> Voltar para Lista
            </button>

            {/* HEADER DA FARMÁCIA */}
            <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight mb-2">{pharmacy.name}</h2>
                    <div className="flex flex-wrap gap-2 mb-3">
                        <Badge color={pharmacy.isAvailable ? 'green' : 'red'}>{pharmacy.isAvailable ? 'ABERTO' : 'FECHADO'}</Badge>
                        <Badge color={pharmacy.deliveryActive ? 'blue' : 'gray'}>{pharmacy.deliveryActive ? 'FAZ ENTREGAS' : 'RECOLHA EM LOJA'}</Badge>
                        <span className="text-[10px] bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                            <Star size={10} className="fill-yellow-600"/> {pharmacy.rating}
                        </span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={12}/> {pharmacy.address}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> {pharmacy.openingHours || '08:00 - 20:00'}</p>
                    </div>
                </div>
                {pharmacy.logoUrl && (
                    <div className="w-20 h-20 rounded-2xl bg-gray-50 border p-1 shrink-0">
                        <img src={pharmacy.logoUrl} className="w-full h-full object-cover rounded-xl" alt="Logo" />
                    </div>
                )}
            </div>

            {/* BARRA DE PESQUISA INTERNA (ON-DEMAND) */}
            <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-3 sticky top-20 z-20">
                <Search className="text-emerald-500 ml-4" size={20}/>
                <input 
                    placeholder={`Pesquisar na ${pharmacy.name}...`} 
                    className="w-full py-4 outline-none font-bold text-gray-700 uppercase placeholder:normal-case" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            {/* LISTA DE PRODUTOS */}
            {loading ? (
                <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" size={40}/></div>
            ) : (
                <>
                    {products.length === 0 ? (
                        <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-[32px] bg-gray-50">
                            <p className="text-gray-400 font-bold uppercase text-xs">Nenhum produto encontrado nesta farmácia.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {products.map(p => (
                                <div key={p.id} onClick={() => onAddToCart(p)} className="bg-white p-4 rounded-3xl border shadow-sm hover:shadow-md transition-all group flex flex-col cursor-pointer">
                                    <div className="aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center p-2 relative">
                                        <img src={optimizeImg(p.image)} className="max-h-full object-contain" loading="lazy" alt={p.name} />
                                        {p.isPromotion && <span className="absolute top-2 right-2 bg-red-500 text-white text-[8px] font-black px-1.5 rounded">PROMO</span>}
                                    </div>
                                    <h4 className="font-bold text-gray-800 text-xs mb-1 flex-1 uppercase leading-tight line-clamp-2">{formatProductNameForCustomer(p.name)}</h4>
                                    <p className="text-[9px] text-gray-400 font-bold mb-2 uppercase bg-gray-50 px-2 py-0.5 rounded w-fit">{p.unitType || 'Unidade'}</p>
                                    <div className="flex justify-between items-center pt-2 border-t">
                                        <div className="flex flex-col">
                                            {p.isPromotion && <span className="text-[8px] text-gray-400 line-through">Kz {p.price}</span>}
                                            <span className={`font-black text-sm ${p.isPromotion ? 'text-red-500' : 'text-emerald-600'}`}>
                                                Kz {(p.isPromotion ? p.discountPrice : p.price)?.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg active:scale-95"><Plus size={16}/></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {hasMore && (
                        <div className="flex justify-center pt-8">
                            <button 
                                onClick={handleLoadMore} 
                                disabled={loadingMore}
                                className="px-8 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-emerald-600 hover:border-emerald-200 shadow-sm flex items-center gap-2"
                            >
                                {loadingMore ? <Loader2 className="animate-spin" size={14}/> : <ChevronDown size={14}/>}
                                Carregar Mais
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export const CartView = ({ items, pharmacies, updateQuantity, onCheckout, userAddress, onBack }: any) => {
    const [type, setType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentAddress, setCurrentAddress] = useState(userAddress || '');
    const [isLocating, setIsLocating] = useState(false);

    const sub = items.reduce((a: any, b: any) => a + (b.price * b.quantity), 0);
    const pharm = items.length > 0 ? pharmacies.find((p:any) => p.id === items[0].pharmacyId) : null;
    const fee = type === 'DELIVERY' ? (pharm?.deliveryFee || 0) : 0;
    const total = sub + fee;

    // Se a farmácia não suportar entrega, forçamos o tipo PICKUP
    useEffect(() => {
        if (pharm && !pharm.deliveryActive && type === 'DELIVERY') {
            setType('PICKUP');
        }
    }, [pharm, type]);

    const handleUseGps = async () => {
        setIsLocating(true);
        playSound('click');
        const pos = await getCurrentPosition();
        if (pos) {
            const lat = pos.lat.toFixed(6);
            const lng = pos.lng.toFixed(6);
            const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
            const accuracyLine = typeof pos.accuracy === 'number' ? `Precisão GPS ~${Math.round(pos.accuracy)}m` : 'Precisão GPS indisponível';
            setCurrentAddress(`${accuracyLine}\nGPS: ${lat}, ${lng}\nMapa: ${mapUrl}`);
            if (typeof pos.accuracy === 'number' && pos.accuracy > 150) {
                alert("GPS com baixa precisão. Confira no mapa e ajuste a morada manualmente.");
            }
            playSound('success');
        } else {
            alert("Não foi possível aceder ao GPS. Verifique as permissões.");
        }
        setIsLocating(false);
    };

    const handleConfirmCheckout = async () => { 
        if (isProcessing) return; 
        if (type === 'DELIVERY' && !currentAddress) {
            alert("Por favor, insira a morada de entrega.");
            return;
        }
        setIsProcessing(true); 
        try { 
            await onCheckout(type, currentAddress, total); 
        } finally { 
            setIsProcessing(false); 
        } 
    };

    return (
        <div className="max-w-4xl mx-auto py-10 animate-fade-in pb-32">
            <button onClick={onBack} className="text-gray-400 font-black text-xs uppercase mb-6 flex items-center gap-2" disabled={isProcessing}><ArrowLeft size={16}/> Ver mais medicamentos</button>
            <h2 className="text-3xl font-black text-gray-800 mb-8">Finalizar Pedido</h2>
            
            {items.length === 0 ? (
                <div className="bg-white p-20 rounded-[40px] border border-dashed text-center flex flex-col items-center">
                    <Store className="text-gray-100 mb-4" size={80}/>
                    <p className="text-gray-400 font-black uppercase text-sm">O cesto está vazio</p>
                </div>
            ) : (
                <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm"><Store/></div>
                            <div>
                                <h3 className="font-black text-xl text-emerald-900">{pharm?.name}</h3>
                                <p className="text-[10px] text-emerald-600 font-bold uppercase">
                                    {pharm?.deliveryActive ? `Entrega em ${pharm?.minTime}` : 'Apenas Levantamento em Loja'}
                                </p>
                            </div>
                        </div>

                        {type === 'DELIVERY' && (
                            <Card className="p-8 rounded-[40px] shadow-sm border-gray-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><MapPin size={18} className="text-emerald-500"/> Local de Entrega</h4>
                                    <button 
                                        onClick={handleUseGps} 
                                        disabled={isLocating}
                                        className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-1 bg-blue-50 px-3 py-2 rounded-xl hover:bg-blue-100 transition-all"
                                    >
                                        {isLocating ? <Loader2 className="animate-spin" size={12}/> : <Navigation size={12}/>}
                                        {isLocating ? 'Obtendo...' : 'Usar GPS'}
                                    </button>
                                </div>
                                <textarea 
                                    className="w-full p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 font-medium text-sm transition-all min-h-[100px]" 
                                    placeholder="Descreva sua morada completa (Província, Município, Bairro...)"
                                    value={currentAddress}
                                    onChange={e => setCurrentAddress(e.target.value)}
                                />
                            </Card>
                        )}

                        <div className="space-y-4">
                            {items.map((it: any) => (
                                <div key={it.id} className="bg-white p-5 rounded-3xl border flex items-center gap-4 shadow-sm">
                                    <img src={optimizeImg(it.image)} className="w-16 h-16 object-contain rounded-xl bg-gray-50 p-2" loading="lazy" alt={it.name} />
                                    <div className="flex-1"><h4 className="font-bold text-gray-800 text-sm">{formatProductNameForCustomer(it.name)}</h4><p className="text-emerald-600 font-black">Kz {(it.price * it.quantity).toLocaleString()}</p></div>
                                    <div className="flex flex-col items-end gap-2">
                                        <button
                                            disabled={isProcessing}
                                            onClick={() => updateQuantity(it.id, 0)}
                                            className="h-8 px-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase flex items-center gap-1 hover:bg-red-100 transition-colors"
                                            title="Remover item"
                                        >
                                            <Trash2 size={12} />
                                            Remover
                                        </button>
                                        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border">
                                            <button disabled={isProcessing} onClick={() => updateQuantity(it.id, -1)} className="w-8 h-8 bg-white rounded-xl shadow-sm font-black">-</button>
                                            <span className="font-black min-w-[20px] text-center">{it.quantity}</span>
                                            <button disabled={isProcessing} onClick={() => updateQuantity(it.id, 1)} className="w-8 h-8 bg-white rounded-xl shadow-sm font-black">+</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-emerald-900 text-white p-8 rounded-[40px] shadow-2xl space-y-6 h-fit sticky top-24">
                        <h3 className="font-black text-xl border-b border-white/10 pb-4">Resumo da Compra</h3>
                        <div className="flex gap-2 p-1 bg-white/10 rounded-2xl">
                            <button 
                                onClick={() => setType('DELIVERY')} 
                                disabled={!pharm?.deliveryActive}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${!pharm?.deliveryActive ? 'opacity-30 cursor-not-allowed' : (type === 'DELIVERY' ? 'bg-white text-emerald-900 shadow-xl' : 'text-white border-transparent')}`}
                            >
                                Entrega
                            </button>
                            <button onClick={() => setType('PICKUP')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${type === 'PICKUP' ? 'bg-white text-emerald-900 shadow-xl' : 'text-white border-transparent'}`}>Levantamento</button>
                        </div>
                        
                        {!pharm?.deliveryActive && (
                            <div className="bg-orange-500/20 p-4 rounded-2xl border border-orange-500/30 flex items-start gap-3">
                                <AlertCircle size={18} className="text-orange-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] font-bold text-orange-200 leading-tight">Esta farmácia desativou temporariamente o serviço de entregas. Por favor, levante o seu pedido na loja.</p>
                            </div>
                        )}

                        <div className="space-y-2 pt-4">
                            <div className="flex justify-between text-emerald-200 text-xs uppercase font-bold"><span>Medicamentos ({items.length})</span><span>Kz {sub.toLocaleString()}</span></div>
                            <div className="flex justify-between text-emerald-200 text-xs uppercase font-bold"><span>Taxa de Entrega</span><span>Kz {fee.toLocaleString()}</span></div>
                            <div className="flex justify-between items-center pt-6 text-3xl font-black border-t border-white/10"><span>Total</span><span>Kz {total.toLocaleString()}</span></div>
                        </div>
                        <Button onClick={handleConfirmCheckout} disabled={isProcessing || (type === 'DELIVERY' && !currentAddress)} className="w-full py-6 bg-emerald-500 hover:bg-emerald-400 rounded-[24px] font-black text-xl shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all">
                            {isProcessing ? <Loader2 className="animate-spin" /> : "Confirmar Pedido"}
                        </Button>
                        <p className="text-[9px] text-center text-emerald-400 font-bold uppercase tracking-widest opacity-60">Pagamento no ato da entrega</p>
                    </div>
                </div>
            )}
        </div>
    );
};
