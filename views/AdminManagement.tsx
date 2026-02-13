
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Badge, Toast, Button } from '../components/UI';
import { Pharmacy, User, UserRole } from '../types';
import { supabase } from '../services/supabaseClient';
import { 
    fetchPharmacies, deletePharmacy, 
    fetchAllUsers, adminUpdateUser, clearPharmacyLink,
    recoverPharmacyLink, togglePharmacyAvailability,
    togglePharmacyDelivery
} from '../services/dataService';
import { 
    RefreshCw, UserCog, Edit, Trash2, X, ShieldCheck, Save, Loader2, RotateCcw, 
    Link2, Search, Sparkles, BrainCircuit, Trophy
} from 'lucide-react';
import { playSound } from '../services/soundService';

const normalizeText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const AdminUserManagement = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<User | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [q, setQ] = useState('');

    useEffect(() => { load(); }, []);
    const load = async () => {
        setLoading(true);
        const data = await fetchAllUsers();
        setUsers(data);
        setLoading(false);
    };

    const filtered = useMemo(() => users.filter(u => normalizeText(u.name + u.email).includes(normalizeText(q))), [users, q]);

    const handleSave = async () => {
        if (!editing) return;
        setLoading(true);
        const res = await adminUpdateUser(editing.id, { name: editing.name, phone: editing.phone || '', role: editing.role });
        setLoading(false);
        if (res.success) {
            setToast({msg: "Usuário modificado!", type: 'success'});
            setEditing(null);
            load();
        }
    };

    const handleRepairLink = async (u: User) => {
        setLoading(true);
        const pharmId = await recoverPharmacyLink(u);
        setLoading(false);
        if (pharmId) {
            playSound('success');
            setToast({ msg: "Vínculo restaurado!", type: 'success' });
            load();
        } else {
            playSound('error');
            setToast({ msg: "Falha ao reparar vínculo.", type: 'error' });
        }
    };

    const handleReset = async (u: User) => {
        if (!confirm(`Deseja REINICIAR a conta de ${u.name}?`)) return;
        setLoading(true);
        await supabase.from('prescriptions').delete().eq('customer_id', u.id);
        await supabase.from('orders').delete().eq('customer_name', u.name);
        setLoading(false);
        playSound('trash');
        setToast({ msg: "Conta reiniciada!", type: 'success' });
        load();
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl border shadow-sm gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Diretório de Usuários</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Gestão global de credenciais</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="bg-gray-50 border rounded-xl px-3 py-2 flex items-center gap-2 flex-1 md:w-64">
                        <Search size={18} className="text-gray-400"/>
                        <input placeholder="Filtrar por nome ou email..." className="bg-transparent outline-none text-sm w-full font-medium" value={q} onChange={e => setQ(e.target.value)}/>
                    </div>
                    <button onClick={load} className="p-3 bg-white border rounded-2xl hover:bg-gray-100 transition-all"><RefreshCw size={20} className={loading ? 'animate-spin' : ''}/></button>
                </div>
            </div>

            <Card className="p-0 overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm min-w-[700px]">
                        <thead className="bg-gray-50 border-b text-[10px] uppercase font-black text-gray-400 tracking-widest">
                            <tr><th className="p-5">Perfil</th><th className="p-5">Cargo</th><th className="p-5 text-right">Ação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filtered.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${u.role === 'PHARMACY' ? 'bg-emerald-100 text-emerald-700' : (u.role === 'ADMIN' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}`}>
                                                {u.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-800 truncate max-w-[200px]">{u.name}</p>
                                                <p className="text-xs text-gray-400 truncate max-w-[200px]">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-2">
                                            <Badge color={u.role === 'ADMIN' ? 'red' : (u.role === 'PHARMACY' ? 'green' : 'blue')}>{u.role}</Badge>
                                            {u.role === 'CUSTOMER' && u.pharmacyId && (
                                                <span title="Aviso: Cliente com vínculo de farmácia" className="px-2 py-1 bg-yellow-50 border border-yellow-200 rounded-lg text-[10px] font-black text-yellow-700 flex items-center gap-1">
                                                    ⚠️ Inconsistência
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {u.role === 'PHARMACY' && (
                                                <button onClick={() => handleRepairLink(u)} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md flex items-center gap-2 text-[10px] font-black" title="Reparar Vínculo de Loja"><Link2 size={14}/> VINCULAR</button>
                                            )}
                                            {u.role === 'CUSTOMER' && u.pharmacyId && (
                                                <button 
                                                    onClick={async () => {
                                                        setLoading(true);
                                                        const res = await clearPharmacyLink(u.id);
                                                        setLoading(false);
                                                        if (res.success) {
                                                            playSound('success');
                                                            setToast({ msg: "Vínculo de farmácia removido!", type: 'success' });
                                                            load();
                                                        } else {
                                                            setToast({ msg: "Erro ao remover vínculo: " + res.error, type: 'error' });
                                                        }
                                                    }}
                                                    className="p-3 bg-yellow-50 text-yellow-600 rounded-xl hover:bg-yellow-600 hover:text-white transition-all" 
                                                    title="Remover vínculo de farmácia inconsistente"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            )}
                                            <button onClick={() => setEditing(u)} className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><UserCog size={18}/></button>
                                            <button onClick={() => handleReset(u)} className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-600 hover:text-white transition-all" title="Reiniciar Dados do Cliente"><RotateCcw size={18}/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {editing && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md p-8 animate-scale-in">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-black text-xl">Editar Perfil</h3><button onClick={() => setEditing(null)} className="p-2 hover:bg-gray-100 rounded-full"><X/></button></div>
                        <div className="space-y-4">
                            <div><label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Nome</label><input className="w-full p-3 border rounded-xl" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})}/></div>
                            <div><label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Telefone</label><input className="w-full p-3 border rounded-xl" value={editing.phone || ''} onChange={e => setEditing({...editing, phone: e.target.value})}/></div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Acesso</label>
                                <select className="w-full p-3 border rounded-xl" value={editing.role} onChange={e => setEditing({...editing, role: e.target.value as UserRole})}>
                                    <option value="CUSTOMER">Cliente</option>
                                    <option value="PHARMACY">Farmácia</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                            <div className="flex gap-2 pt-6"><Button className="flex-1 py-4 font-black" onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Aplicar Alterações'}</Button></div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export const AdminPharmacyManagement = () => {
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Pharmacy | null>(null);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    const [q, setQ] = useState('');

    useEffect(() => { load(); }, []);
    const load = async () => {
        setLoading(true);
        const data = await fetchPharmacies(true);
        setPharmacies(data);
        setLoading(false);
    };

    const filtered = useMemo(() => pharmacies.filter(p => normalizeText(p.name + p.ownerEmail).includes(normalizeText(q))), [pharmacies, q]);

    const handleUpdate = async () => {
        if(!editing) return;
        setLoading(true);
        
        const { error } = await supabase.from('pharmacies').update({
            name: editing.name, 
            nif: editing.nif || '', 
            address: editing.address,
            delivery_fee: editing.deliveryFee, 
            min_time: editing.minTime, 
            phone: editing.phone || '', 
            rating: editing.rating,
            receives_low_conf_rx: editing.receives_low_conf_rx, 
            commission_rate: editing.commissionRate || 10,
            is_available: editing.isAvailable,
            delivery_active: editing.deliveryActive
        }).eq('id', editing.id);
        
        if(!error) { 
            playSound('save');
            setToast({msg: "Dados da farmácia atualizados!", type: 'success'}); 
            setEditing(null); 
            await load(); 
        } else {
            setToast({msg: "Erro ao salvar: " + error.message, type: 'error'});
        }
        setLoading(false);
    };

    const toggleExpertMode = () => {
        if(!editing) return;
        setEditing(prev => prev ? { ...prev, receives_low_conf_rx: !prev.receives_low_conf_rx } : null);
        playSound('click');
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="bg-emerald-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl mb-8 relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-3xl font-black flex items-center gap-3"><Trophy className="text-yellow-400"/> Ranking de Especialistas</h2>
                    <p className="text-emerald-300 font-bold mt-1">Farmácias com maior Score IA ganham prioridade nas buscas.</p>
                </div>
                <BrainCircuit className="absolute -right-10 -bottom-10 text-white/5 w-64 h-64" />
            </div>

            <div className="grid gap-4">
                {filtered.map(p => (
                    <div key={p.id} className={`bg-white p-6 rounded-[32px] border flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-lg transition-all ${p.status !== 'APPROVED' ? 'border-yellow-400 bg-yellow-50/30' : ''}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl bg-emerald-50 text-emerald-700 shrink-0">{p.name.charAt(0)}</div>
                            <div>
                                <h3 className="font-bold text-gray-800 text-lg">{p.name}</h3>
                                <div className="flex gap-2 mt-1">
                                    <Badge color={p.status !== 'APPROVED' ? 'yellow' : (p.receives_low_conf_rx ? 'blue' : 'gray')}>
                                        {p.status !== 'APPROVED' ? 'PENDENTE APROVAÇÃO' : (p.receives_low_conf_rx ? 'ESPECIALISTA IA' : 'VENDA NORMAL')}
                                    </Badge>
                                    <Badge color={p.isAvailable ? 'green' : 'red'}>
                                        {p.isAvailable ? 'ONLINE' : 'OFFLINE'}
                                    </Badge>
                                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        Score: {p.review_score || 0} pts
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => setEditing(p)} className="p-4 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"><Edit size={20}/></button>
                            <button onClick={async () => { if(confirm("Eliminar farmácia?")) { await deletePharmacy(p.id); load(); } }} className="p-4 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={20}/></button>
                        </div>
                    </div>
                ))}
            </div>

            {editing && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto animate-scale-in">
                        <div className="flex justify-between items-center mb-8 border-b pb-4">
                            <h3 className="font-black text-2xl flex items-center gap-2"><Sparkles className="text-orange-500"/> Gestão de Especialista</h3>
                            <button onClick={() => setEditing(null)} className="p-2 hover:bg-gray-100 rounded-full"><X/></button>
                        </div>
                        
                        <div className="space-y-6">
                            {/* CONTROLES ADMINISTRATIVOS DE STATUS */}
                            <div className="bg-emerald-50/50 p-6 rounded-[32px] border border-emerald-100 grid md:grid-cols-2 gap-6">
                                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border">
                                    <div>
                                        <p className="font-black text-gray-800 text-xs uppercase">Status Online</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Visibilidade no Shopping</p>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setEditing({...editing, isAvailable: !editing.isAvailable})}
                                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${editing.isAvailable ? 'bg-emerald-500' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ml-1 ${editing.isAvailable ? 'translate-x-6' : ''}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border">
                                    <div>
                                        <p className="font-black text-gray-800 text-xs uppercase">Entregas Ativas</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Opção de Delivery</p>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => setEditing({...editing, deliveryActive: !editing.deliveryActive})}
                                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${editing.deliveryActive ? 'bg-blue-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ml-1 ${editing.deliveryActive ? 'translate-x-6' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="bg-orange-50 p-6 rounded-[32px] border border-orange-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white rounded-2xl shadow-sm text-orange-500"><BrainCircuit/></div>
                                    <div>
                                        <p className="font-black text-orange-900 text-sm">Habilitar Validação de IA?</p>
                                        <p className="text-[10px] text-orange-700 font-bold">Esta farmácia receberá receitas com baixa confiança.</p>
                                    </div>
                                </div>
                                <button 
                                    type="button"
                                    onClick={toggleExpertMode}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${editing.receives_low_conf_rx ? 'bg-orange-500' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ml-1 ${editing.receives_low_conf_rx ? 'translate-x-6' : ''}`} />
                                </button>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Nome Comercial</label><input className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})}/></div>
                                <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Comissão (%)</label><input type="number" className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={editing.commissionRate || 10} onChange={e => setEditing({...editing, commissionRate: Number(e.target.value)})}/></div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-10 border-t mt-8">
                            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
                            {editing.status !== 'APPROVED' && (
                                <Button 
                                    className="flex-1 py-4 font-black shadow-xl bg-emerald-600 hover:bg-emerald-700" 
                                    onClick={async () => {
                                        setLoading(true);
                                        const res = await supabase.from('pharmacies').update({ status: 'APPROVED' }).eq('id', editing.id);
                                        if (!res.error) {
                                            playSound('success');
                                            setToast({msg: "Farmácia APROVADA! Agora aparecerá para clientes.", type: 'success'});
                                            setEditing(null);
                                            await load();
                                        } else {
                                            setToast({msg: "Erro ao aprovar: " + res.error.message, type: 'error'});
                                        }
                                        setLoading(false);
                                    }} 
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="animate-spin mr-2"/> : <ShieldCheck size={20} className="mr-2"/>} 
                                    Aprovar & Publicar
                                </Button>
                            )}
                            <Button className="flex-[2] py-4 font-black shadow-xl" onClick={handleUpdate} disabled={loading}>
                                {loading ? <Loader2 className="animate-spin mr-2"/> : <Save size={20} className="mr-2"/>} 
                                Gravar Alterações
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
