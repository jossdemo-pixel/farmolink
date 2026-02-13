
import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from '../components/UI';
import { Pharmacy, Order } from '../types';
import { getAdminStats, fetchPharmacies, fetchOrders } from '../services/dataService';
import { Users, Store, ShoppingBag, Activity, TrendingUp, History, Settings, ShieldCheck, Database, Search, RefreshCw, Eye, Clock, Calendar, X, Phone, MapPin, Package, CreditCard, ChevronRight } from 'lucide-react';
import { playSound } from '../services/soundService';

export const AdminOverview = ({ setView }: any) => {
    const [stats, setStats] = useState({ users: 0, pharmacies: 0, ordersToday: 0, totalRevenue: 0 });
    const [onlinePharmacies, setOnlinePharmacies] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => { 
        const load = async () => {
            const s = await getAdminStats();
            const ph = await fetchPharmacies(true);
            setStats(s);
            setOnlinePharmacies(ph.filter(p => p.isAvailable).length);
            setLoading(false);
        };
        load();
    }, []);

    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div onClick={() => setView('admin-users')} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all flex items-center justify-between group">
                    <div>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Usuários</p>
                        <h3 className="text-3xl font-black text-gray-800">{loading ? '...' : stats.users}</h3>
                    </div>
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <Users size={28}/>
                    </div>
                </div>
                <div onClick={() => setView('admin-pharmacies')} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all flex items-center justify-between group">
                    <div>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Parceiros</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-black text-gray-800">{loading ? '...' : stats.pharmacies}</h3>
                            {!loading && (
                                <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                    {onlinePharmacies} Online
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all">
                        <Store size={28}/>
                    </div>
                </div>
                <div onClick={() => setView('admin-orders')} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-all flex items-center justify-between group">
                    <div>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">Ordens Hoje</p>
                        <h3 className="text-3xl font-black text-gray-800">{loading ? '...' : stats.ordersToday}</h3>
                    </div>
                    <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl group-hover:bg-orange-600 group-hover:text-white transition-all">
                        <ShoppingBag size={28}/>
                    </div>
                </div>
                <div onClick={() => setView('admin-financial')} className="bg-emerald-900 p-6 rounded-3xl shadow-lg text-white flex items-center justify-between relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform">
                    <div className="relative z-10">
                        <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1">Volume do Dia</p>
                        <h3 className="text-2xl font-black">Kz {loading ? '...' : stats.totalRevenue.toLocaleString()}</h3>
                        <p className="text-[10px] text-emerald-300 mt-2 font-bold flex items-center gap-1"><TrendingUp size={10}/> Gestão</p>
                    </div>
                    <Activity size={48} className="text-emerald-800 opacity-50 relative z-10"/>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Ações Rápidas" className="p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Button variant="outline" className="text-xs py-3" onClick={() => setView('admin-settings')}><Settings size={14}/> Sistema</Button>
                        <Button variant="outline" className="text-xs py-3" onClick={() => setView('admin-backup')}><ShieldCheck size={14}/> Segurança</Button>
                        <Button variant="outline" className="text-xs py-3" onClick={() => setView('admin-catalog')}><Database size={14}/> Catálogo</Button>
                    </div>
                </Card>
                <div className="bg-white p-8 rounded-3xl border border-dashed border-gray-200 flex flex-col justify-center items-center text-center">
                    <History size={24} className="text-gray-300 mb-2"/>
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Atividade Recente</p>
                    <p className="text-xs text-gray-400">Monitoramento da rede FarmoLink.</p>
                </div>
            </div>
        </div>
    );
};

export const AdminGlobalOrders = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const [oData, pData] = await Promise.all([fetchOrders(), fetchPharmacies(true)]);
        setOrders(oData);
        setPharmacies(pData);
        setLoading(false);
    };

    const filtered = orders.filter(o => 
        o.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleViewDetails = (order: Order) => {
        setSelectedOrder(order);
        playSound('click');
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Monitoramento da Rede</h2>
                    <p className="text-sm text-gray-500 font-medium">Fluxo transacional completo.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="bg-gray-50 border rounded-xl px-4 py-2 flex items-center gap-2 flex-1 md:w-64 focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
                        <Search size={18} className="text-gray-400"/>
                        <input placeholder="Buscar..." className="bg-transparent outline-none text-sm w-full font-bold text-gray-700" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                    </div>
                    <button onClick={loadData} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>
            
            {/* VIEW MOLDÁVEL (MOBILE: CARDS / DESKTOP: TABELA COMPACTA) */}
            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                
                {/* 1. VISUALIZAÇÃO EM TABELA (APENAS MD+) */}
                <div className="hidden md:block overflow-x-hidden">
                    <table className="w-full text-left table-auto">
                        <thead className="bg-gray-50 border-b text-[9px] font-black text-gray-400 uppercase tracking-widest">
                            <tr>
                                <th className="py-4 px-4">Pedido / Hora</th>
                                <th className="py-4 px-4">Origem</th>
                                <th className="py-4 px-4">Cliente</th>
                                <th className="py-4 px-4">Faturamento</th>
                                <th className="py-4 px-4 text-center">Status</th>
                                <th className="py-4 px-4 text-right">Acção</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 bg-white">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} className="p-20 text-center text-gray-300 font-bold uppercase tracking-widest italic">Nenhum registro</td></tr>
                            ) : (
                                filtered.map((o) => {
                                    const pharm = pharmacies.find(p => p.id === o.pharmacyId);
                                    return (
                                        <tr key={o.id} className="hover:bg-emerald-50/30 transition-colors group">
                                            <td className="py-3 px-4">
                                                <p className="font-mono text-[9px] font-black text-gray-300 uppercase tracking-tighter">#{o.id.slice(0,6).toUpperCase()}</p>
                                                <p className="text-[11px] font-bold text-gray-700 mt-0.5 flex items-center gap-1"><Clock size={10} className="text-emerald-500"/> {o.date.split(',')[1]?.trim() || '---'}</p>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-black text-gray-800 text-[11px] block truncate max-w-[140px]">{pharm?.name || '---'}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <p className="font-black text-gray-800 text-[11px] truncate max-w-[120px]">{o.customerName}</p>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="font-black text-emerald-600 text-[12px]">Kz {o.total.toLocaleString()}</span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <Badge className="!text-[9px] px-2 py-0.5" color={o.status === 'Concluído' ? 'green' : (o.status.includes('Cancelado') || o.status === 'Recusado' ? 'red' : (o.status === 'Preparando' ? 'blue' : 'yellow'))}>
                                                    {o.status.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <button 
                                                    onClick={() => handleViewDetails(o)}
                                                    className="p-2 text-gray-300 hover:text-emerald-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-emerald-100"
                                                >
                                                    <Eye size={18}/>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 2. VISUALIZAÇÃO EM CARDS (APENAS MOBILE / MD-) */}
                <div className="md:hidden divide-y divide-gray-50">
                    {filtered.length === 0 ? (
                        <div className="p-20 text-center text-gray-300 font-bold uppercase tracking-widest italic">Sem registros</div>
                    ) : (
                        filtered.map(o => {
                            const pharm = pharmacies.find(p => p.id === o.pharmacyId);
                            return (
                                <div key={o.id} onClick={() => handleViewDetails(o)} className="p-5 active:bg-gray-50 transition-colors flex items-center justify-between group">
                                    <div className="space-y-1 flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2">
                                            <Badge className="!text-[8px] px-1.5 py-0" color={o.status === 'Concluído' ? 'green' : (o.status.includes('Cancelado') || o.status === 'Recusado' ? 'red' : (o.status === 'Preparando' ? 'blue' : 'yellow'))}>
                                                {o.status.toUpperCase()}
                                            </Badge>
                                            <span className="text-[10px] font-black text-gray-300 uppercase">#{o.id.slice(0,6).toUpperCase()}</span>
                                        </div>
                                        <h4 className="font-black text-gray-800 text-sm truncate">{o.customerName}</h4>
                                        <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1 truncate">
                                            <Store size={10}/> {pharm?.name} • <Clock size={10}/> {o.date.split(',')[1]?.trim()}
                                        </p>
                                        <p className="text-emerald-600 font-black text-sm">Kz {o.total.toLocaleString()}</p>
                                    </div>
                                    <div className="shrink-0 flex items-center justify-center w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl">
                                        <ChevronRight size={20}/>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* MODAL DE DETALHES DO PEDIDO (ADMIN) */}
            {selectedOrder && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <Card className="w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-scale-in rounded-[48px] border-none bg-white">
                        <div className="p-8 bg-emerald-900 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-white/10 rounded-[24px] shadow-inner"><ShoppingBag size={32}/></div>
                                <div>
                                    <h3 className="font-black text-2xl tracking-tight">Pedido #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                                    <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-[0.2em]">{selectedOrder.date}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28}/></button>
                        </div>

                        <div className="p-8 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Informações do Cliente</h4>
                                    <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm text-emerald-600"><Users size={16}/></div>
                                            <p className="font-black text-gray-800 text-sm">{selectedOrder.customerName}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm text-emerald-600"><Phone size={16}/></div>
                                            <p className="font-bold text-gray-600 text-sm">{selectedOrder.customerPhone || 'Não informado'}</p>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm text-emerald-600 mt-1 shrink-0"><MapPin size={16}/></div>
                                            <p className="font-medium text-gray-500 text-xs leading-relaxed">{selectedOrder.address || 'Levantamento em loja'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Status do Fluxo</h4>
                                    <div className="bg-emerald-50/50 p-6 rounded-[32px] border border-emerald-100 flex flex-col items-center justify-center text-center">
                                        <Badge color={selectedOrder.status === 'Concluído' ? 'green' : 'yellow'} className="mb-4 px-6 py-2 text-sm">
                                            {selectedOrder.status.toUpperCase()}
                                        </Badge>
                                        <div className="flex items-center gap-2 text-emerald-700 font-black text-[10px] uppercase tracking-tighter">
                                            <CreditCard size={14}/> Tipo: {selectedOrder.type === 'DELIVERY' ? 'ENTREGA DOMICÍLIO' : 'LEVANTAMENTO LOCAL'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Itens Adquiridos</h4>
                                <div className="border-2 border-gray-50 rounded-[32px] overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                                            <tr><th className="p-4">Produto</th><th className="p-4 text-center">Qtd</th><th className="p-4 text-right">Subtotal</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {selectedOrder.items.map((item, i) => (
                                                <tr key={i}>
                                                    <td className="p-4 text-xs font-bold text-gray-700">{item.name}</td>
                                                    <td className="p-4 text-center text-xs font-black">{item.quantity}x</td>
                                                    <td className="p-4 text-right text-xs font-black text-gray-600">Kz {(item.price * item.quantity).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-emerald-50/50">
                                            <tr>
                                                <td colSpan={2} className="p-6 text-right text-xs font-black text-emerald-900 uppercase tracking-widest">Total Geral</td>
                                                <td className="p-6 text-right text-xl font-black text-emerald-600">Kz {selectedOrder.total.toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-8 bg-gray-50 border-t flex justify-end">
                            <Button onClick={() => setSelectedOrder(null)} variant="outline" className="px-10 py-4 font-black rounded-2xl">Fechar Detalhes</Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
