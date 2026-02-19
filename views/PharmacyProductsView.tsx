
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Badge, Button, Toast, NumericInput } from '../components/UI';
import { Product, PRODUCT_CATEGORIES, GlobalProduct, ProductUnitType, UNIT_TYPES } from '../types';
import { 
    Plus, XCircle, Edit2, Trash2, Search, Save, AlertTriangle, FileText, UploadCloud, 
    ArrowRight, CheckCircle2, Loader2, X, ImageIcon, Link2, Info, Package, 
    ChevronRight, ChevronLeft, ArrowUp, ArrowDown, Database, RefreshCw, Wifi, 
    Layers, Sparkles, ScanBarcode, ListPlus, Boxes, ChevronDown, AlertOctagon
} from 'lucide-react';
import { 
    addProduct, updateProduct, bulkDeletePharmacyProducts, 
    fetchGlobalCatalog, bulkAddPharmacyProducts, fetchPharmacyInventory,
    areProductNamesSimilar, findSimilarGlobalProducts
} from '../services/productService';
import { playSound } from '../services/soundService';

const normalizeText = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ITEMS_PER_PAGE = 50;

// --- MÉTODOS DE REGISTO DE PRODUTOS ---

// 1. IMPORTAÇÃO EM MASSA (ATUALIZADO COM DETEÇÃO DE DUPLICADOS)
const BulkImportModal = ({ onClose, onComplete, pharmacyId, existingStock }: { onClose: () => void, onComplete: () => void, pharmacyId: string, existingStock: Product[] }) => {
    const [step, setStep] = useState<'INPUT' | 'REVIEW'>('INPUT');
    const [text, setText] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const handleAnalyze = () => {
        if (!text.trim()) return;
        setLoading(true);
        
        setTimeout(() => {
            const lines = text.split('\n').filter(l => l.trim().length > 3);
            const parsed = lines.map((line, idx) => {
                const parts = line.split(/[,;\t]/).map(p => p.trim());
                let price = 0;
                let name = line;
                
                const lastPart = parts[parts.length - 1];
                const cleanLastPart = lastPart.replace(/[^0-9.,]/g, '').replace(',', '.');
                
                if (!isNaN(Number(cleanLastPart)) && cleanLastPart.length > 0) {
                    price = parseFloat(cleanLastPart);
                    if (parts.length > 1) name = parts.slice(0, parts.length - 1).join(', ').trim();
                    else name = line.replace(lastPart, '').trim();
                } else {
                    const priceMatch = line.match(/(\d[\d\s.]*)$/);
                    if (priceMatch) {
                        const val = priceMatch[0].replace(/[^0-9.]/g, '');
                        price = parseFloat(val);
                        name = line.replace(priceMatch[0], '').trim();
                    }
                }

                name = name.replace(/,\s*$/, '').replace(/^[-]/, '').trim().toUpperCase();
                
                // --- CONTROLO DE DUPLICADOS (STOCK LOCAL) ---
                const isDuplicate = existingStock.some(p => areProductNamesSimilar(p.name, name));

                return { 
                    name, 
                    price: price || 0,
                    stock: 50, 
                    isDuplicate,
                    id: Math.random().toString(36).substr(2, 9)
                };
            });

            setItems(parsed.filter(p => p.price > 0 || p.name.length > 2));
            setStep('REVIEW');
            setLoading(false);
            playSound('success');
        }, 800);
    };

    const handleConfirm = async () => {
        // Filtra para não importar duplicados se o usuário desejar (opcional, aqui apenas avisamos)
        const toImport = items.filter(i => !i.isDuplicate);
        if (toImport.length === 0 && items.length > 0) {
            if(!confirm("Todos os itens já existem no seu stock. Deseja importar duplicados mesmo assim?")) return;
        }

        setLoading(true);
        const payload = items.map(i => ({
            name: i.name,
            price: i.price,
            stock: i.stock,
            category: 'Geral',
            pharmacy_id: pharmacyId,
            requires_prescription: false,
            unit_type: 'Unidade',
            image: 'https://cdn-icons-png.flaticon.com/512/883/883407.png'
        }));

        const res = await bulkAddPharmacyProducts(payload);
        setLoading(false);
        if (res.success) { playSound('save'); onComplete(); }
        else alert("Erro ao importar: " + res.error);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-5xl bg-white rounded-[32px] shadow-2xl flex flex-col h-[85vh] overflow-hidden border border-gray-100">
                <div className="p-4 border-b flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><UploadCloud size={24}/></div>
                        <div>
                            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Importação de Stock</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Controlo de Duplicados Ativo</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-hidden relative flex flex-col bg-gray-50/50">
                    {step === 'INPUT' ? (
                        <div className="flex-1 flex flex-col p-6 h-full overflow-hidden">
                            <textarea className="flex-1 w-full p-6 bg-white border-2 border-blue-100 rounded-[24px] font-mono text-xs outline-none focus:ring-4 focus:ring-blue-50 resize-none shadow-sm" placeholder="Cole sua lista aqui..." value={text} onChange={e => setText(e.target.value)}/>
                            <Button onClick={handleAnalyze} disabled={loading || !text.trim()} className="mt-4 w-full py-4 bg-blue-600 text-white rounded-[20px] font-black text-lg shadow-xl uppercase">
                                {loading ? <Loader2 className="animate-spin" /> : "Analisar e Verificar Duplicados"}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="px-6 py-3 flex justify-between items-center bg-white border-b shrink-0 shadow-sm z-10">
                                <span className="font-black text-gray-800 text-sm uppercase">{items.length} Itens na lista</span>
                                <div className="flex gap-4">
                                    <span className="text-[10px] font-black text-orange-500 uppercase flex items-center gap-1">
                                        <AlertTriangle size={12}/> {items.filter(i => i.isDuplicate).length} Já em Stock
                                    </span>
                                    <button onClick={() => setStep('INPUT')} className="text-[10px] font-black text-red-500 bg-red-50 px-3 py-1 rounded-lg">Reiniciar</button>
                                </div>
                            </div>

                            <div className="flex-1 relative overflow-hidden">
                                <div className="absolute inset-0 overflow-y-auto p-4 md:px-8 custom-scrollbar" ref={listRef}>
                                    <div className="space-y-2">
                                        {items.map((item) => (
                                            <div key={item.id} className={`bg-white p-3 rounded-xl border flex items-center gap-3 transition-all ${item.isDuplicate ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200'}`}>
                                                <div className="flex-1">
                                                    <input className={`w-full font-bold text-xs md:text-sm uppercase bg-transparent outline-none ${item.isDuplicate ? 'text-orange-700' : 'text-gray-700'}`} value={item.name} onChange={e => setItems(items.map(i => i.id === item.id ? {...i, name: e.target.value.toUpperCase(), isDuplicate: false} : i))}/>
                                                    {item.isDuplicate && <p className="text-[8px] font-black text-orange-500 uppercase mt-0.5 flex items-center gap-1"><AlertOctagon size={10}/> Este produto já existe no seu inventário</p>}
                                                </div>
                                                <div className="w-24 bg-gray-50 rounded-lg p-1">
                                                    <NumericInput
                                                        className="w-full bg-transparent text-center font-black text-emerald-600 outline-none text-xs"
                                                        value={item.price}
                                                        onValueChange={value => {
                                                            if (typeof value === 'number') {
                                                                setItems(items.map(i => i.id === item.id ? { ...i, price: value } : i));
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-gray-300 hover:text-red-500 p-2"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {step === 'REVIEW' && (
                    <div className="p-4 border-t bg-white flex gap-3 shrink-0 shadow-lg z-20">
                        <Button onClick={() => setStep('INPUT')} variant="outline" className="flex-1 py-4 font-bold uppercase border-2">Voltar</Button>
                        <Button onClick={handleConfirm} disabled={loading || items.length === 0} className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl font-black text-lg shadow-lg uppercase tracking-widest">
                            {loading ? <Loader2 className="animate-spin"/> : "Confirmar Importação"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

// 2. BUSCA NO CATÁLOGO (MESMA ESTRUTURA SEM CARD)
const CatalogSearchModal = ({ onClose, onAdd }: { onClose: () => void, onAdd: (p: any) => void }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<GlobalProduct[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const search = async () => {
            if (searchTerm.length < 3) { setResults([]); return; }
            setLoading(true);
            const { data } = await fetchGlobalCatalog(searchTerm, 0, 20);
            setResults(data);
            setLoading(false);
        };
        const timer = setTimeout(search, 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-2xl bg-white rounded-[32px] p-8 shadow-2xl h-[80vh] flex flex-col border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-blue-900 uppercase flex items-center gap-2"><Database className="text-blue-500"/> Catálogo Mestre</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X/></button>
                </div>
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20}/>
                    <input className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 uppercase" placeholder="Nome do medicamento..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {results.map(gp => (
                        <div key={gp.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between hover:border-blue-300 transition-all group">
                            <div className="flex items-center gap-4">
                                <img src={gp.image} className="w-12 h-12 object-contain bg-gray-50 rounded-xl p-1" />
                                <div><h4 className="font-black text-gray-800 text-sm uppercase">{gp.name}</h4><Badge color="gray" className="!text-[9px]">{gp.category}</Badge></div>
                            </div>
                            <Button onClick={() => onAdd(gp)} className="px-6 py-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl font-black text-xs uppercase shadow-none">Adicionar <Plus size={16} className="ml-1"/></Button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const PharmacyProductsView = ({ pharmacyId, onRefresh }: { pharmacyId: string, onRefresh?: () => void }) => {
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [displayLimit, setDisplayLimit] = useState(ITEMS_PER_PAGE);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showCatalogSearch, setShowCatalogSearch] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({ name: '', price: 0, stock: 10, category: PRODUCT_CATEGORIES[0], description: '', requiresPrescription: false, globalId: '', image: '', unitType: 'Caixa' as ProductUnitType });
  const [catalogSuggestion, setCatalogSuggestion] = useState<GlobalProduct | null>(null);
  const [lastSuggestionName, setLastSuggestionName] = useState<string>('');

  useEffect(() => { loadLocalStock(); }, [pharmacyId]);

  // Sugestão automática a partir do Catálogo Mestre quando o utilizador digita o nome
  useEffect(() => {
      if (!showManualForm) {
          setCatalogSuggestion(null);
          setLastSuggestionName('');
          return;
      }

      const currentName = (formData.name || '').trim();

      // se já está ligado a um global product, não sugerimos outro
      if (formData.globalId) {
          setCatalogSuggestion(null);
          setLastSuggestionName(currentName);
          return;
      }

      // não sugere enquanto estiver a editar um produto já ligado
      if (editingProduct && editingProduct.globalProductId) {
          setCatalogSuggestion(null);
          setLastSuggestionName(currentName);
          return;
      }

      if (currentName.length < 3) {
          setCatalogSuggestion(null);
          setLastSuggestionName(currentName);
          return;
      }

      // evita refazer busca para o mesmo nome
      if (currentName === lastSuggestionName) return;

      const handle = setTimeout(async () => {
          try {
              const matches = await findSimilarGlobalProducts(currentName, 3);
              setCatalogSuggestion(matches[0] || null);
              setLastSuggestionName(currentName);
          } catch (e) {
              console.error('Erro ao sugerir do catálogo mestre', e);
          }
      }, 500);

      return () => clearTimeout(handle);
  }, [formData.name, showManualForm, editingProduct, formData.globalId, lastSuggestionName]);

  const loadLocalStock = async (forceRefresh = false) => {
      const data = await fetchPharmacyInventory(pharmacyId, forceRefresh);
      setLocalProducts(data);
      if(forceRefresh) onRefresh?.();
  };

  const handleEdit = (p: Product) => {
      setEditingProduct(p);
      setFormData({ name: p.name, price: p.price, stock: p.stock, category: p.category || 'Geral', description: p.description, requiresPrescription: p.requiresPrescription, globalId: p.globalProductId || '', image: p.image, unitType: p.unitType || 'Unidade' });
      setShowManualForm(true);
      setCatalogSuggestion(null);
      setLastSuggestionName(p.name || '');
      playSound('click');
  };

  const handleSaveManual = async () => {
      if (!formData.name || formData.price <= 0) { setToast({ msg: "Preencha nome e preço.", type: 'error' }); return; }

      // Se há sugestão forte do catálogo mestre e o utilizador ainda não a ligou,
      // pedir confirmação explícita antes de gravar como produto novo
      if (!editingProduct && catalogSuggestion && !formData.globalId) {
          const confirmed = confirm("Encontrámos um medicamento muito semelhante no Catálogo Mestre.\n\nDeseja mesmo gravar como um produto NOVO, sem se basear no catálogo mestre?");
          if (!confirmed) {
              return;
          }
      }

      setLoading(true);
      const payload = { name: formData.name, description: formData.description || formData.name, price: formData.price, stock: formData.stock, category: formData.category, requiresPrescription: formData.requiresPrescription, pharmacyId, image: formData.image || 'https://cdn-icons-png.flaticon.com/512/883/883407.png', globalProductId: formData.globalId || null, unitType: formData.unitType };
      const res = editingProduct ? await updateProduct(editingProduct.id, payload) : await addProduct(payload);
      setLoading(false);
      if (res.success) { playSound('save'); setToast({ msg: editingProduct ? "Produto atualizado!" : "Produto adicionado!", type: 'success' }); loadLocalStock(); setShowManualForm(false); setEditingProduct(null); }
      else setToast({ msg: "Erro ao gravar: " + res.error, type: 'error' });
  };

  const visibleProducts = localProducts.filter(p => normalizeText(p.name).includes(normalizeText(searchTerm))).slice(0, displayLimit);

  return (
    <div className="space-y-6 pb-20 animate-fade-in">
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm gap-4">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-inner"><Package size={28}/></div>
                <div><h1 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">Gestão de Stock</h1><p className="text-[10px] font-black text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Layers size={10}/> {localProducts.length} Items</p></div>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Button onClick={() => setShowCatalogSearch(true)} className="h-12 px-5 bg-blue-600 text-white font-black uppercase text-[10px] rounded-xl shadow-lg flex-1 md:flex-none"><Search size={16} className="mr-2"/> Catálogo Mestre</Button>
                <Button onClick={() => { setEditingProduct(null); setShowManualForm(true); }} className="h-12 px-5 bg-emerald-600 text-white font-black uppercase text-[10px] rounded-xl shadow-lg flex-1 md:flex-none"><ListPlus size={16} className="mr-2"/> Novo Produto</Button>
                <Button onClick={() => setShowBulkImport(true)} variant="outline" className="h-12 px-5 border-gray-200 text-gray-500 font-black uppercase text-[10px] rounded-xl flex-1 md:flex-none"><UploadCloud size={16} className="mr-2"/> Importar</Button>
            </div>
        </div>

        <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-3">
            <Search className="text-gray-300 ml-4" size={20}/><input placeholder="Filtrar stock local..." className="w-full py-4 outline-none font-bold text-gray-700 uppercase" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleProducts.map(p => (
                <div key={p.id} className="bg-white p-5 rounded-[28px] border border-gray-100 hover:shadow-lg transition-all group">
                    <div className="flex justify-between items-start mb-3"><div className="w-14 h-14 bg-gray-50 rounded-2xl p-2 border flex items-center justify-center"><img src={p.image} className="w-full h-full object-contain" /></div><Badge color={p.stock > 5 ? 'green' : 'red'}>{p.stock} un</Badge></div>
                    <h4 className="font-bold text-gray-800 text-sm uppercase line-clamp-2 min-h-[2.5em]">{p.name}</h4>
                    <div className="flex justify-between items-end mt-4 pt-4 border-t border-gray-50"><span className="text-xl font-black text-emerald-600">Kz {p.price.toLocaleString()}</span><div className="flex gap-2"><button onClick={() => handleEdit(p)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white"><Edit2 size={16}/></button><button onClick={async () => { if(confirm("Remover do stock?")) { await bulkDeletePharmacyProducts([p.id]); loadLocalStock(); } }} className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white"><Trash2 size={16}/></button></div></div>
                </div>
            ))}
        </div>

        {showBulkImport && <BulkImportModal pharmacyId={pharmacyId} existingStock={localProducts} onClose={() => setShowBulkImport(false)} onComplete={() => { setShowBulkImport(false); loadLocalStock(true); setToast({ msg: "Produtos importados!", type: 'success' }); }} />}
        {showCatalogSearch && <CatalogSearchModal onClose={() => setShowCatalogSearch(false)} onAdd={(gp) => { setFormData({ name: gp.name, price: gp.referencePrice || 0, stock: 20, category: gp.category, description: gp.name, requiresPrescription: false, globalId: gp.id, image: gp.image, unitType: 'Caixa' }); setCatalogSuggestion(null); setLastSuggestionName(gp.name || ''); setShowCatalogSearch(false); setShowManualForm(true); }} />}
        
        {showManualForm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
                <div className="w-full max-w-lg p-8 rounded-[40px] shadow-2xl max-h-[90vh] overflow-y-auto bg-white border border-gray-100">
                    <div className="flex justify-between items-center mb-6 border-b pb-4"><h3 className="font-black text-xl text-gray-800 uppercase flex items-center gap-2">{editingProduct ? <Edit2 size={24} className="text-blue-500"/> : <ListPlus size={24} className="text-emerald-500"/>} {editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3><button onClick={() => { setShowManualForm(false); setEditingProduct(null); }}><X/></button></div>
                    <form onSubmit={(e) => { e.preventDefault(); handleSaveManual(); }} className="space-y-6">
                        <div>
                            <label className="label-text">Nome do Medicamento</label>
                            <input
                                className="input-field uppercase font-bold"
                                value={formData.name}
                                onChange={e => {
                                    const value = e.target.value.toUpperCase();
                                    setFormData({ ...formData, name: value });
                                    // força nova análise de sugestão para o novo nome
                                    setLastSuggestionName('');
                                }}
                                required
                            />
                            {catalogSuggestion && !formData.globalId && (
                                <div className="mt-2 p-3 rounded-2xl bg-blue-50 border border-blue-200 flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-black text-blue-700 uppercase mb-1">Sugestão do Catálogo Mestre</p>
                                        <p className="text-xs font-bold text-gray-800 uppercase">{catalogSuggestion.name}</p>
                                        {catalogSuggestion.referencePrice && (
                                            <p className="text-[10px] text-emerald-700 font-black mt-1">
                                                Preço ref.: Kz {catalogSuggestion.referencePrice.toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Button
                                            type="button"
                                            className="px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-xl"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    name: catalogSuggestion.name,
                                                    price: catalogSuggestion.referencePrice || formData.price,
                                                    category: catalogSuggestion.category,
                                                    description: catalogSuggestion.name,
                                                    globalId: catalogSuggestion.id,
                                                    image: catalogSuggestion.image || formData.image
                                                });
                                                setCatalogSuggestion(null);
                                                setLastSuggestionName(catalogSuggestion.name || '');
                                            }}
                                        >
                                            Usar Catálogo Mestre
                                        </Button>
                                        <button
                                            type="button"
                                            className="text-[9px] font-black text-gray-500 underline"
                                            onClick={() => {
                                                // Usuário certifica que é um produto diferente
                                                setCatalogSuggestion(null);
                                                setLastSuggestionName(formData.name || '');
                                            }}
                                        >
                                            Produto diferente
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label-text">Preço (Kz)</label>
                                <NumericInput
                                    className="input-field font-black"
                                    value={formData.price}
                                    onValueChange={value => {
                                        if (typeof value === 'number') {
                                            setFormData({ ...formData, price: value });
                                        }
                                    }}
                                />
                            </div>
                            <div>
                                <label className="label-text">Stock</label>
                                <NumericInput
                                    className="input-field"
                                    value={formData.stock}
                                    integer
                                    onValueChange={value => {
                                        if (typeof value === 'number') {
                                            setFormData({ ...formData, stock: value });
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-4 pt-4"><Button type="button" variant="outline" className="flex-1 py-4" onClick={() => setShowManualForm(false)}>Cancelar</Button><Button type="submit" disabled={loading} className="flex-[2] py-4 bg-emerald-600 text-white font-black uppercase">Gravar</Button></div>
                    </form>
                </div>
            </div>
        )}

        <style>{`
            .label-text { display: block; font-size: 10px; font-weight: 900; color: #9ca3af; text-transform: uppercase; margin-bottom: 4px; margin-left: 4px; }
            .input-field { width: 100%; padding: 16px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; outline: none; transition: all; font-size: 14px; }
            .input-field:focus { border-color: #10b981; background-color: white; }
        `}</style>
    </div>
  );
};
