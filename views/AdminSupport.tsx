import React, { useState, useEffect, useRef } from 'react';
import { Card, Badge, Button, Toast } from '../components/UI';
import { User } from '../types';
import { fetchAllSupportTickets, updateTicketStatus, fetchTicketMessages, sendTicketMessage } from '../services/dataService';
import { 
    MessageCircle, Mail, CheckCircle, Clock, 
    RefreshCw, ChevronRight, User as UserIcon, 
    MessageSquare, X, Send, ShieldCheck, Loader2,
    Lock, ListFilter
} from 'lucide-react';
import { playSound } from '../services/soundService';

export const AdminSupportView = ({ user }: { user: User }) => {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('OPEN');
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [reply, setReply] = useState('');
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => { loadTickets(); }, []);
    
    useEffect(() => {
        if (selectedTicket) {
            loadMessages();
            const interval = setInterval(loadMessages, 5000);
            return () => clearInterval(interval);
        } else {
            setMessages([]);
        }
    }, [selectedTicket?.id]);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const loadTickets = async () => {
        setLoading(true);
        const data = await fetchAllSupportTickets();
        setTickets(data);
        setLoading(false);
    };

    const loadMessages = async () => {
        if (!selectedTicket) return;
        const data = await fetchTicketMessages(selectedTicket.id);
        setMessages(data);
    };

    const handleSendReply = async () => {
        if (!reply.trim() || !selectedTicket || !user) return;
        const msg = reply;
        setReply('');
        
        const success = await sendTicketMessage(selectedTicket.id, user.id, 'Suporte FarmoLink', 'ADMIN', msg);
        
        if (success) {
            loadMessages();
            playSound('click');
        } else {
            setToast({msg: "Erro ao enviar resposta.", type: 'error'});
        }
    };

    const handleResolve = async (id: string) => {
        if (!window.confirm("Deseja confirmar que este problema foi RESOLVIDO? O chat será encerrado.")) return;

        setActionLoading(true);
        try {
            const success = await updateTicketStatus(id, 'RESOLVED');
            if (success) {
                await sendTicketMessage(id, user.id, 'Sistema', 'ADMIN', "--- CHAMADO ENCERRADO PELO SUPORTE ---");
                playSound('success');
                setToast({ msg: "Chamado finalizado!", type: 'success' });
                setSelectedTicket(null); 
                await loadTickets();
            } else {
                setToast({ msg: "Falha ao atualizar status no banco.", type: 'error' });
            }
        } catch (e) {
            setToast({ msg: "Erro de conexão.", type: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    const filtered = tickets.filter(t => filterStatus === 'ALL' || t.status === filterStatus);

    return (
        <div className="space-y-6 animate-fade-in pb-20 h-full max-h-screen">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white p-6 rounded-3xl border border-gray-100 shadow-sm gap-4 shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Centro de Suporte (SAC)</h2>
                    <p className="text-sm text-gray-500">Comunicação direta com os usuários.</p>
                </div>
                <div className="flex items-center gap-3 w-full lg:w-auto">
                    {/* Barra de filtros responsiva com scroll horizontal */}
                    <div className="flex-1 lg:flex-none flex bg-gray-100 p-1 rounded-xl overflow-x-auto no-scrollbar scroll-smooth">
                        {['OPEN', 'RESOLVED', 'ALL'].map(s => (
                            <button 
                                key={s}
                                onClick={() => setFilterStatus(s as any)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap min-w-fit ${filterStatus === s ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
                            >
                                {s === 'OPEN' ? 'Abertos' : s === 'RESOLVED' ? 'Resolvidos' : 'Todos'}
                            </button>
                        ))}
                    </div>
                    <button onClick={loadTickets} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shrink-0">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[70vh]">
                {/* Lista lateral */}
                <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                    {filtered.length === 0 && !loading && (
                        <div className="text-center p-10 text-gray-400 text-xs italic">Nenhum chamado nesta categoria.</div>
                    )}
                    {filtered.map(ticket => (
                        <div 
                            key={ticket.id} 
                            onClick={() => setSelectedTicket(ticket)}
                            className={`bg-white p-5 rounded-3xl border transition-all cursor-pointer hover:shadow-md flex items-center justify-between group ${selectedTicket?.id === ticket.id ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-gray-100'}`}
                        >
                            <div className="flex items-center gap-4 min-w-0">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0 ${ticket.status === 'OPEN' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                    {ticket.user_name?.charAt(0) || 'U'}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-gray-800 text-sm truncate">{ticket.subject}</h4>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase truncate">{ticket.user_name}</p>
                                </div>
                            </div>
                            <Badge color={ticket.status === 'OPEN' ? 'green' : 'gray'} className="ml-2 shrink-0">{ticket.status}</Badge>
                        </div>
                    ))}
                </div>

                {/* Área do Chat */}
                <div className="lg:col-span-2 relative h-full">
                    {selectedTicket ? (
                        <Card className="h-full p-0 flex flex-col border-0 shadow-2xl overflow-hidden animate-scale-in">
                            {/* Header do Chat - FIXO */}
                            <div className="p-4 sm:p-6 bg-gray-50 border-b flex justify-between items-center shrink-0 z-10">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-black shrink-0">
                                        {selectedTicket.user_name.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-black text-gray-800 text-sm truncate">{selectedTicket.subject}</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase truncate">{selectedTicket.user_email}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center shrink-0">
                                    {selectedTicket.status === 'OPEN' && (
                                        <button 
                                            onClick={() => handleResolve(selectedTicket.id)} 
                                            disabled={actionLoading}
                                            className="hidden sm:flex text-[10px] font-black uppercase bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-md hover:bg-emerald-700 transition-all disabled:opacity-50"
                                        >
                                            {actionLoading ? <Loader2 size={12} className="animate-spin"/> : 'Resolver'}
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => setSelectedTicket(null)} 
                                        className="text-gray-400 hover:text-red-500 transition-colors p-2 bg-white rounded-full border border-gray-100 shadow-sm" 
                                        title="Fechar Painel"
                                    >
                                        <X size={20}/>
                                    </button>
                                </div>
                            </div>

                            {/* Mensagens - SCROLLÁVEL */}
                            <div 
                                ref={scrollContainerRef}
                                className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 bg-white custom-scrollbar"
                            >
                                {messages.map((m, idx) => (
                                    <div key={idx} className={`flex ${m.sender_role === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-3xl text-sm ${
                                            m.sender_role === 'ADMIN' 
                                            ? 'bg-emerald-600 text-white rounded-tr-none' 
                                            : 'bg-gray-100 text-gray-800 rounded-tl-none border-l-4 border-emerald-500 shadow-sm'
                                        } ${m.message.includes('---') ? 'mx-auto text-center !bg-gray-800 !text-[10px] !text-gray-400 font-black px-6 py-2 rounded-full !shadow-none' : ''}`}>
                                            <p className="leading-relaxed">{m.message}</p>
                                            {!m.message.includes('---') && (
                                                <p className="text-[8px] mt-2 opacity-60 font-black uppercase text-right">
                                                    {new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input Area - FIXO NO FUNDO */}
                            {selectedTicket.status === 'OPEN' ? (
                                <div className="p-4 sm:p-6 bg-gray-50 border-t flex gap-2 sm:gap-4 shrink-0">
                                    <input 
                                        className="flex-1 p-3 sm:p-4 bg-white border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm shadow-inner"
                                        placeholder="Resposta..."
                                        value={reply}
                                        onChange={e => setReply(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && handleSendReply()}
                                    />
                                    <button 
                                        onClick={handleSendReply}
                                        className="p-3 sm:p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                                    >
                                        <Send size={20} className="sm:w-6 sm:h-6"/>
                                    </button>
                                </div>
                            ) : (
                                <div className="p-6 bg-gray-100 border-t flex items-center justify-center gap-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest shrink-0">
                                    <Lock size={14}/> Histórico de Chat Arquivado
                                </div>
                            )}
                        </Card>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 rounded-[40px] text-gray-300 bg-white/50">
                            <MessageSquare size={60} className="mb-4 opacity-10"/>
                            <p className="text-xs font-black uppercase tracking-widest">Selecione um atendimento para visualizar</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};