
import React, { useState, useEffect } from 'react';
import { User, Order, PrescriptionRequest } from '../types';
import { Card, Button, Badge, Toast, PasswordInput } from '../components/UI';
import { updateUserProfile, updateUserPassword, fetchOrders, fetchPrescriptionRequests } from '../services/dataService';
import { 
    Lock, Save, User as UserIcon, Phone, MapPin, 
    ShoppingBag, FileText, ShieldCheck, Mail, 
    ChevronRight, Loader2, Camera, Star
} from 'lucide-react';
import { playSound } from '../services/soundService';

export const CustomerProfileView = ({ user, onUpdateUser }: { user: User, onUpdateUser: (u: User) => void }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    phone: user.phone || '',
    address: user.address || ''
  });
  
  const [stats, setStats] = useState({ orders: 0, rx: 0 });
  const [loading, setLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [passwordData, setPasswordData] = useState({ newPass: '', confirmPass: '' });

  useEffect(() => {
    const loadStats = async () => {
        const [orders, prescriptions] = await Promise.all([
            fetchOrders(),
            fetchPrescriptionRequests(user.role, user.id)
        ]);
        setStats({
            orders: orders.filter(o => o.customerName === user.name).length,
            rx: prescriptions.length
        });
    };
    loadStats();
  }, [user.id]);

  const handleSave = async () => {
     if(!formData.name || !formData.phone) {
         setToast({msg: "Nome e Telefone são obrigatórios", type: 'error'});
         return;
     }
     setLoading(true);
     const result = await updateUserProfile(user.id, formData);
     setLoading(false);
     if (result.success) {
       onUpdateUser({ ...user, ...formData });
       playSound('save');
       setToast({msg: result.queued ? "Sem internet: alteracoes guardadas e serao sincronizadas." : "Perfil atualizado com sucesso!", type: 'success'});
     } else {
       playSound('error');
       setToast({msg: "Erro ao atualizar perfil.", type: 'error'});
     }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordData.newPass.length < 6) {
          setToast({msg: "Mínimo 6 caracteres", type: 'error'});
          return;
      }
      if (passwordData.newPass !== passwordData.confirmPass) {
          setToast({msg: "Senhas não coincidem", type: 'error'});
          return;
      }

      setPassLoading(true);
      const result = await updateUserPassword(passwordData.newPass);
      setPassLoading(false);

      if (result.success) {
          playSound('success');
          setToast({msg: "Senha alterada com sucesso!", type: 'success'});
          setPasswordData({ newPass: '', confirmPass: '' });
      } else {
          playSound('error');
          setToast({msg: result.error || "Erro ao alterar senha", type: 'error'});
      }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
       {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}

       {/* HEADER DASHBOARD PESSAOL */}
       <div className="bg-emerald-900 rounded-[40px] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
             <div className="relative group">
                 <div className="w-32 h-32 bg-emerald-700 rounded-[40px] flex items-center justify-center text-5xl font-black border-4 border-emerald-500/30 shadow-xl overflow-hidden">
                    {user.name.charAt(0)}
                 </div>
                 <button className="absolute -bottom-2 -right-2 p-3 bg-white text-emerald-900 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20}/>
                 </button>
             </div>
             
             <div className="text-center md:text-left flex-1">
                <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                    <h1 className="text-3xl font-black">{user.name}</h1>
                    <Badge color="blue" className="!bg-blue-500/20 !text-blue-300 border-none px-4 py-1">CLIENTE VERIFICADO</Badge>
                </div>
                <p className="text-emerald-400 font-bold flex items-center justify-center md:justify-start gap-2 mb-6">
                    <Mail size={16}/> {user.email}
                </p>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                    <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Pedidos Feitos</p>
                        <p className="text-2xl font-black">{stats.orders}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Receitas Enviadas</p>
                        <p className="text-2xl font-black">{stats.rx}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Pontos Saúde</p>
                        <p className="text-2xl font-black">150</p>
                    </div>
                </div>
             </div>
          </div>
          <Star className="absolute -bottom-10 -right-10 text-white opacity-5 w-64 h-64" />
       </div>

       <div className="grid lg:grid-cols-3 gap-8">
          
          {/* COLUNA ESQUERDA: DADOS PESSOAIS */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="rounded-[40px] p-10 shadow-sm border-gray-100">
                <h3 className="text-xl font-black text-gray-800 mb-8 flex items-center gap-3 uppercase tracking-tight">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><UserIcon size={20}/></div>
                    Dados de Identidade
                </h3>
                
                <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo</label>
                            <div className="relative">
                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
                                <input type="text" className="w-full pl-12 p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Telemóvel (WhatsApp)</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
                                <input type="tel" className="w-full pl-12 p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-700 transition-all" placeholder="9xx xxx xxx" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Morada Padrão para Entregas</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-4 text-gray-300" size={18}/>
                            <textarea className="w-full pl-12 p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-gray-700 transition-all min-h-[120px]" placeholder="Ex: Centralidade do Kilamba, Bloco X, Apto Y..." value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                        </div>
                    </div>
                    
                    <Button onClick={handleSave} disabled={loading} className="w-full py-5 rounded-3xl font-black text-lg shadow-xl shadow-emerald-100 mt-4">
                        {loading ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>} 
                        {loading ? 'Sincronizando...' : 'Gravar Alterações'}
                    </Button>
                </div>
            </Card>

            <div className="bg-blue-600 rounded-[40px] p-8 text-white flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center"><ShoppingBag size={32}/></div>
                    <div>
                        <h4 className="font-black text-lg">Histórico de Compras</h4>
                        <p className="text-blue-100 text-sm opacity-80">Revisite seus pedidos anteriores e compre novamente.</p>
                    </div>
                </div>
                <button className="p-4 bg-white/10 hover:bg-white/20 rounded-full transition-all"><ChevronRight size={24}/></button>
            </div>
          </div>

          {/* COLUNA DIREITA: SEGURANÇA E INFO */}
          <div className="space-y-6">
            <Card className="rounded-[40px] p-8 shadow-sm border-l-8 border-l-emerald-500">
                <h3 className="text-lg font-black text-gray-800 mb-6 flex items-center gap-3 uppercase tracking-tight">
                    <ShieldCheck className="text-emerald-600" size={24}/> Segurança
                </h3>
                
                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Nova Senha</label>
                        <PasswordInput 
                            className="p-4 text-sm" 
                            placeholder="Mínimo 6 caracteres"
                            value={passwordData.newPass}
                            onChange={e => setPasswordData({...passwordData, newPass: e.target.value})}
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block mb-1">Confirmar Nova Senha</label>
                        <PasswordInput 
                            className="p-4 text-sm" 
                            placeholder="Repita a senha"
                            value={passwordData.confirmPass}
                            onChange={e => setPasswordData({...passwordData, confirmPass: e.target.value})}
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />
                    </div>
                    <Button type="submit" disabled={passLoading} variant="outline" className="w-full py-4 rounded-2xl font-bold border-2">
                        {passLoading ? <Loader2 className="animate-spin" size={18}/> : <Lock size={18} className="mr-2"/>}
                        Alterar Senha
                    </Button>
                </form>
            </Card>

            <div className="bg-gray-900 rounded-[40px] p-8 text-white space-y-4">
                <h4 className="font-black flex items-center gap-2 text-emerald-400 uppercase text-xs tracking-widest"><ShieldCheck size={14}/> Privacidade FarmoLink</h4>
                <p className="text-xs text-gray-400 leading-relaxed font-medium">Seus dados são criptografados e utilizados apenas para processar seus pedidos e receitas médicas em Angola.</p>
                <div className="pt-2">
                    <Badge color="gray" className="!bg-white/5 !text-gray-400 border-none text-[9px]">SESSÃO ATIVA: {new Date().toLocaleDateString()}</Badge>
                </div>
            </div>

            <Card className="rounded-[40px] p-8 bg-emerald-50 border-emerald-100 border flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4"><FileText size={24}/></div>
                <h4 className="font-black text-gray-800 text-sm uppercase">Minhas Receitas</h4>
                <p className="text-[10px] text-gray-500 font-bold mt-1">Você tem {stats.rx} solicitações de orçamento ativas ou concluídas.</p>
            </Card>
          </div>
       </div>
    </div>
  );
};
