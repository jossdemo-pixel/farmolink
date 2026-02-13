
import { Search, Plus, Save, Database, Trash2, Edit2, UploadCloud, X, CheckCircle2, Loader2, AlertTriangle, ArrowUp, ArrowDown, ChevronDown, RefreshCw, Wifi, WifiOff, AlertOctagon } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge, Toast } from '../components/UI';
import { GlobalProduct, PRODUCT_CATEGORIES } from '../types';
import { fetchGlobalCatalog, addGlobalProduct, updateGlobalProduct, bulkAddGlobalProducts, deleteGlobalProduct, clearCatalogCache, areProductNamesSimilar } from '../services/productService';
import { playSound } from '../services/soundService';

export const AdminCatalogView = () => {
    const [products, setProducts] = useState<GlobalProduct[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isBulkAdding, setIsBulkAdding] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [processedItems, setProcessedItems] = useState<any[]>([]);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fields, setFields] = useState<any>({ name: '', category: PRODUCT_CATEGORIES[0], description: '', referencePrice: 0, image: '' });
    
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadCatalog(0, true); }, [searchTerm]);

    const loadCatalog = async (currentPage: number, reset: boolean) => {
        if (reset) setLoading(true); else setLoadingMore(true);
        try {
            const { data, total } = await fetchGlobalCatalog(searchTerm, currentPage, 100);
            if (reset) setProducts(data); else setProducts(prev => [...prev, ...data]);
            setTotalCount(total);
        } finally { setLoading(false); setLoadingMore(false); }
    }

    const handleBulkImportManual = async () => {
        if (!bulkText.trim()) return;
        setLoading(true);
        
        try {
            // Carrega TODOS os produtos do catálogo para comparação completa
            const { data: allCatalogProducts } = await fetchGlobalCatalog(undefined, 0, 5000);
            
            const lines = bulkText.split('\n').filter(l => l.trim().length > 5);
            const items = lines.map(line => {
                const parts = line.split(',').map(p => p.trim());
                const nameBase = parts[0] || 'Item s/ Nome';
                const fullName = nameBase.toUpperCase().trim();
                const price = parseFloat(parts[5] || parts[parts.length - 1]?.replace(/[^0-9.]/g, '')) || 0;
                
                // --- DETECÇÃO DE DUPLICADOS ROBUSTA ---
                // Verifica contra TODO o catálogo, não só os carregados na página
                const isDuplicate = (allCatalogProducts || []).some(p => areProductNamesSimilar(p.name, fullName));
                
                return { name: fullName, category: PRODUCT_CATEGORIES[0], price: price, isDuplicate };
            });

            setProcessedItems(items);
            playSound('success');
        } catch (err) {
            console.error("Erro ao verificar duplicados:", err);
            setToast({ msg: "Erro ao verificar banco de dados.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveBulk = async () => {
        setLoading(true);
        // Filtra APENAS itens sem duplicata antes de enviar
        const itemsToSave = processedItems
            .filter(it => !it.isDuplicate) // Ignora duplicatas
            .map(it => ({
                name: it.name,
                category: it.category || PRODUCT_CATEGORIES[0],
                description: it.name,
                reference_price: Number(it.price) || 0,
                common: true,
                image: 'https://cdn-icons-png.flaticon.com/512/883/883407.png'
            }));

        if (itemsToSave.length === 0) {
            setToast({ msg: "Nenhum item novo para salvar (todos são duplicatas).", type: 'error' });
            setLoading(false);
            return;
        }

        const success = await bulkAddGlobalProducts(itemsToSave);
        if(success) {
            playSound('cash');
            const duplicateCount = processedItems.length - itemsToSave.length;
            setToast({
                msg: `${itemsToSave.length} itens injetados! (${duplicateCount} ignorados por duplicata)`, 
                type: 'success'
            });
            setIsBulkAdding(false);
            setProcessedItems([]);
            loadCatalog(0, true);
        } else {
            setToast({ msg: "Erro ao salvar itens.", type: 'error' });
        }
        setLoading(false);
    };

    const reset = () => { setIsAdding(false); setIsBulkAdding(false); setEditingId(null); setBulkText(''); setProcessedItems([]); };

    const handleSaveProduct = async () => {
        if (!fields.name.trim()) {
            setToast({ msg: "Nome do medicamento é obrigatório.", type: 'error' });
            return;
        }
        setLoading(true);
        try {
            let result = { success: false };
            if (editingId) {
                result = await updateGlobalProduct(editingId, {
                    name: fields.name.toUpperCase(),
                    category: fields.category,
                    description: fields.description,
                    reference_price: Number(fields.referencePrice) || 0,
                    image: fields.image
                });
            } else {
                result = await addGlobalProduct({
                    name: fields.name.toUpperCase(),
                    category: fields.category,
                    description: fields.description,
                    reference_price: Number(fields.referencePrice) || 0,
                    common: true,
                    image: fields.image || 'https://cdn-icons-png.flaticon.com/512/883/883407.png'
                });
            }
            if (result.success) {
                playSound('success');
                setToast({ msg: editingId ? "Produto atualizado!" : "Produto criado!", type: 'success' });
                reset();
                setFields({ name: '', category: PRODUCT_CATEGORIES[0], description: '', referencePrice: 0, image: '' });
                loadCatalog(0, true);
            } else {
                setToast({ msg: "Erro ao salvar produto.", type: 'error' });
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-900 text-white rounded-2xl shadow-lg shrink-0"><Database size={28}/></div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">Catálogo Mestre</h2>
                        <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{totalCount} Items Registrados</span>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button variant="outline" onClick={() => setIsBulkAdding(true)} className="h-12 text-xs px-6 font-black uppercase border-blue-600 text-blue-600 flex-1 md:flex-none"><UploadCloud size={18} className="mr-2"/> Importar Mestre</Button>
                    <Button onClick={() => { reset(); setIsAdding(true); }} className="h-12 text-xs px-6 font-black uppercase shadow-xl flex-1 md:flex-none"><Plus size={18} className="mr-2"/> Novo Registo</Button>
                </div>
            </div>

            <div className="bg-white p-2 rounded-2xl border shadow-sm flex items-center gap-3">
                <Search className="text-gray-300 ml-4 shrink-0" size={20}/>
                <input placeholder="Filtrar catálogo mestre..." className="w-full py-4 outline-none font-bold text-gray-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>

            <div className="w-full p-0 overflow-hidden shadow-sm border border-gray-100 rounded-[32px] bg-white flex flex-col max-h-[70vh]">
                <div className="overflow-auto custom-scrollbar flex-1">
                    <table className="w-full text-left text-sm min-w-[700px]">
                        <thead className="bg-gray-50 border-b text-[10px] uppercase font-black text-gray-400 sticky top-0 z-10">
                            <tr><th className="p-6">Medicamento</th><th className="p-6">Categoria</th><th className="p-6 text-right">Preço Ref.</th><th className="p-6 text-right">Ação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {products.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-6"><p className="font-bold text-gray-800 uppercase text-xs truncate max-w-[300px]">{p.name}</p></td>
                                    <td className="p-6"><Badge color="gray" className="uppercase !text-[9px]">{p.category}</Badge></td>
                                    <td className="p-6 text-right font-black text-emerald-600">Kz {p.referencePrice?.toLocaleString()}</td>
                                    <td className="p-6 text-right">
                                        <button onClick={() => { setEditingId(p.id); setFields({ name: p.name, category: p.category, referencePrice: p.referencePrice }); setIsAdding(true); }} className="p-3 bg-blue-50 text-blue-600 rounded-xl mr-2"><Edit2 size={16}/></button>
                                        <button onClick={async () => { if(confirm("Eliminar do mestre?")) { await deleteGlobalProduct(p.id); loadCatalog(0, true); } }} className="p-3 bg-red-50 text-red-500 rounded-xl"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* CONTROLES DE PAGINAÇÃO */}
                <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between text-xs font-black text-gray-600 uppercase">
                    <div>
                        Mostrando {page * 100 + 1}-{Math.min((page + 1) * 100, totalCount)} de {totalCount} itens
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setPage(Math.max(0, page - 1)); loadCatalog(Math.max(0, page - 1), true); }}
                            disabled={page === 0}
                            className="px-4 py-2 bg-white rounded-xl border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                        >
                            <ArrowUp size={16}/>
                        </button>
                        <div className="px-4 py-2 bg-white rounded-xl">{page + 1}</div>
                        <button 
                            onClick={() => { setPage(page + 1); loadCatalog(page + 1, true); }}
                            disabled={(page + 1) * 100 >= totalCount}
                            className="px-4 py-2 bg-white rounded-xl border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                        >
                            <ArrowDown size={16}/>
                        </button>
                    </div>
                </div>
            </div>

            {isBulkAdding && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="w-full max-w-4xl p-0 shadow-2xl rounded-[40px] bg-white flex flex-col h-[85vh] overflow-hidden border border-gray-100">
                        <div className="p-6 flex justify-between items-center border-b shrink-0 bg-white">
                            <h3 className="font-black text-xl flex items-center gap-3 text-gray-800 uppercase">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><UploadCloud size={24}/></div>
                                Importação Mestre IA
                            </h3>
                            <button onClick={reset} className="p-3 hover:bg-gray-100 rounded-full"><X size={24}/></button>
                        </div>

                        {processedItems.length === 0 ? (
                            <div className="flex-1 flex flex-col p-6 h-full bg-gray-50">
                                <textarea className="flex-1 w-full p-6 border-2 border-blue-100 rounded-[32px] font-mono text-sm outline-none focus:ring-4 focus:ring-blue-50 shadow-sm resize-none mb-4" placeholder="Panadol, 1500..." value={bulkText} onChange={e => setBulkText(e.target.value)} />
                                <Button onClick={handleBulkImportManual} disabled={loading || !bulkText.trim()} className="w-full py-5 bg-blue-600 font-black text-xl rounded-[24px] uppercase text-white shadow-xl">
                                    {loading ? <Loader2 className="animate-spin mr-2"/> : "Verificar Banco de Dados"}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full bg-white">
                                <div className="flex justify-between items-center px-6 py-4 bg-white border-b shrink-0">
                                    <h4 className="text-sm font-black text-gray-800 uppercase flex items-center gap-2">
                                        <CheckCircle2 className="text-emerald-500"/> {processedItems.length} Itens Encontrados
                                    </h4>
                                    <span className="text-[10px] font-black text-orange-500 uppercase flex items-center gap-1">
                                        <AlertTriangle size={12}/> {processedItems.filter(i => i.isDuplicate).length} Itens Já Registados
                                    </span>
                                </div>

                                <div className="relative flex-1 overflow-hidden bg-gray-50/50">
                                    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                                        <table className="w-full text-left">
                                            <thead className="bg-gray-50 sticky top-0 z-10 border-b text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                                <tr><th className="p-4">Medicamento</th><th className="p-4 text-right">Preço Ref.</th><th className="p-4 text-right">Ação</th></tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {processedItems.map((it, idx) => (
                                                    <tr key={idx} className={`bg-white hover:bg-emerald-50/30 ${it.isDuplicate ? 'bg-orange-50/20' : ''}`}>
                                                        <td className="p-4">
                                                            <input className={`w-full bg-transparent border-none outline-none font-bold text-xs uppercase ${it.isDuplicate ? 'text-orange-600' : 'text-gray-700'}`} value={it.name} onChange={e => setProcessedItems(processedItems.map((pi, i) => i === idx ? {...pi, name: e.target.value.toUpperCase(), isDuplicate: false} : pi))}/>
                                                            {it.isDuplicate && <p className="text-[8px] font-black text-orange-500 uppercase mt-1 flex items-center gap-1"><AlertOctagon size={10}/> Já existe no Catálogo Mestre</p>}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <input type="number" className="w-24 bg-emerald-50 p-2 rounded-xl text-right font-black text-emerald-600 text-xs" value={it.price} onChange={e => setProcessedItems(processedItems.map((pi, i) => i === idx ? {...pi, price: Number(e.target.value)} : pi))}/>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <button onClick={() => setProcessedItems(processedItems.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <div className="p-4 border-t bg-white flex gap-4 shrink-0 shadow-2xl z-20">
                                    <Button variant="outline" className="flex-1 py-4 font-black uppercase" onClick={() => setProcessedItems([])}>Limpar</Button>
                                    <Button onClick={handleSaveBulk} disabled={loading} className="flex-[2] py-4 bg-emerald-600 font-black text-xl rounded-[24px] uppercase text-white shadow-xl">
                                        {loading ? <Loader2 className="animate-spin mr-2"/> : "Confirmar Injeção"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isAdding && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <Card className="w-full max-w-2xl p-8 animate-scale-in max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8 border-b pb-4">
                            <h3 className="font-black text-2xl flex items-center gap-2">
                                {editingId ? <Edit2 className="text-blue-600"/> : <Plus className="text-emerald-600"/>}
                                {editingId ? 'Editar Medicamento' : 'Novo Medicamento'}
                            </h3>
                            <button onClick={reset} className="p-2 hover:bg-gray-100 rounded-full"><X size={24}/></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Nome do Medicamento</label>
                                <input 
                                    type="text"
                                    placeholder="ex: PANADOL 500MG"
                                    className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold text-gray-800 uppercase focus:ring-2 focus:ring-blue-500"
                                    value={fields.name}
                                    onChange={e => setFields({...fields, name: e.target.value})}
                                />
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Categoria</label>
                                    <select 
                                        className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold focus:ring-2 focus:ring-blue-500"
                                        value={fields.category}
                                        onChange={e => setFields({...fields, category: e.target.value})}
                                    >
                                        {PRODUCT_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Preço de Referência (Kz)</label>
                                    <input 
                                        type="number"
                                        placeholder="0"
                                        className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold text-gray-800 focus:ring-2 focus:ring-blue-500"
                                        value={fields.referencePrice}
                                        onChange={e => setFields({...fields, referencePrice: Number(e.target.value)})}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Descrição</label>
                                <textarea 
                                    placeholder="Descrição do medicamento..."
                                    className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold text-gray-800 resize-none h-24 focus:ring-2 focus:ring-blue-500"
                                    value={fields.description}
                                    onChange={e => setFields({...fields, description: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">URL da Imagem</label>
                                <input 
                                    type="text"
                                    placeholder="https://..."
                                    className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold text-gray-800 focus:ring-2 focus:ring-blue-500"
                                    value={fields.image}
                                    onChange={e => setFields({...fields, image: e.target.value})}
                                />
                                {fields.image && (
                                    <img src={fields.image} alt="preview" className="mt-4 h-20 w-20 object-cover rounded-xl" onError={() => setFields({...fields, image: ''})}/>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 pt-10 border-t mt-8">
                            <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
                            <Button className="flex-1 py-4 font-black shadow-xl" onClick={handleSaveProduct} disabled={loading}>
                                {loading ? <Loader2 className="animate-spin mr-2"/> : <Save size={20} className="mr-2"/>} 
                                {editingId ? 'Atualizar' : 'Criar'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
