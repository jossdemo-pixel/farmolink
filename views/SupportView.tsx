
import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge, Toast } from '../components/UI';
import { User, UserRole } from '../types';
import { createSupportTicket, fetchUserTickets, fetchTicketMessages, sendTicketMessage, fetchSupportContact, openSupportWhatsApp } from '../services/dataService';
import { MessageCircle, Mail, HelpCircle, Send, Clock, ChevronRight, X, User as UserIcon, ShieldCheck, Lock, CheckCircle, Loader2, WifiOff } from 'lucide-react';
import { playSound } from '../services/soundService';

export const SupportView = ({ user }: { user: User }) => {
    const [view, setView] = useState<'LIST' | 'NEW' | 'CHAT'>('LIST');
    const [tickets, setTickets] = useState<any[]>([]);
    const [activeTicket, setActiveTicket] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    
    const [subject, setSubject] = useState('');
    const [initialMessage, setInitialMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [supportWhatsApp, setSupportWhatsApp] = useState<string>('');
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (view === 'LIST') loadTickets();
    }, [view]);

    useEffect(() => {
        const loadSupportContact = async () => {
            const contact = await fetchSupportContact();
            setSupportWhatsApp(contact.whatsappNumber);
        };
        loadSupportContact();
    }, []);

    useEffect(() => {
        if (view === 'CHAT' && activeTicket && navigator.onLine) {
            loadMessages();
            const interval = setInterval(loadMessages, 5000);
            return () => clearInterval(interval);
        }
    }, [view, activeTicket?.id]);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const loadTickets = async () => {
        setLoading(true);
        const data = await fetchUserTickets(user.id);
        setTickets(data);
        setLoading(false);
    };

    const loadMessages = async () => {
        if (!activeTicket) return;
        const data = await fetchTicketMessages(activeTicket.id);
        setMessages(data);
    };

    const handleStartTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject || !initialMessage) return;
        setLoading(true);
        const isOffline = !navigator.onLine;
        const result = await createSupportTicket(user.id, user.name, user.email, subject, initialMessage);
        setLoading(false);
        if (result.success) {
            playSound('success');
            setToast({ msg: isOffline ? 'Sem internet: chamado guardado e sera enviado automaticamente.' : 'Chamado enviado com sucesso.', type: 'success' });
            setView('LIST');
            setSubject('');
            setInitialMessage('');
        } else {
            setToast({ msg: result.error || 'Nao foi possivel abrir o chamado.', type: 'error' });
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !activeTicket) return;
        const isOffline = !navigator.onLine;
        const msg = newMessage;
        setNewMessage('');
        const result = await sendTicketMessage(activeTicket.id, user.id, user.name, user.role, msg);
        if (result.success) {
            if (!isOffline) loadMessages();
            else setToast({ msg: 'Sem internet: mensagem guardada na fila para envio.', type: 'success' });
            playSound('click');
        } else {
            setToast({ msg: result.error || 'Falha ao enviar mensagem.', type: 'error' });
        }
    };

    const handleWhatsAppContact = async () => {
        const ok = await openSupportWhatsApp('Ola! Preciso de suporte na FarmoLink.');
        if (!ok) {
            setToast({ msg: 'Nao foi possivel abrir o WhatsApp agora.', type: 'error' });
        }
    };

    if (view === 'CHAT') {
        const isResolved = messages.some(m => m.message.includes('---'));

        return (
            <div className="max-w-4xl mx-auto h-[80vh] flex flex-col animate-fade-in bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
                <div className="p-6 bg-emerald-900 text-white flex justify-between items-center shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setView('LIST')} className="p-2 hover:bg-white/20 rounded-full transition-colors bg-white/10" title="Voltar"><X size={20}/></button>
                        <div>
                            <h3 className="font-bold text-sm sm:text-base">{activeTicket.subject}</h3>
                            <p className="text-[9px] opacity-60 uppercase tracking-widest font-black">Ticket #{activeTicket.id.slice(0,6)}</p>
                        </div>
                    </div>
                    <Badge color={activeTicket.status === 'OPEN' ? 'green' : 'gray'}>
                        {activeTicket.status === 'OPEN' ? 'ATIVO' : 'RESOLVIDO'}
                    </Badge>
                </div>
                
                <div 
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-50"
                >
                    {messages.map((m, idx) => {
                        const isSystem = m.message.includes('---');
                        const isMe = m.sender_id === user.id;
                        return (
                            <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${
                                    isSystem ? 'mx-auto text-center bg-gray-800 text-gray-400 font-black !text-[9px] px-6 py-2 rounded-full !shadow-none' :
                                    !isMe 
                                    ? 'bg-white text-gray-800 border-emerald-500 border-l-4 rounded-tl-none' 
                                    : 'bg-emerald-600 text-white rounded-tr-none'
                                }`}>
                                    {!isSystem && (
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] font-black uppercase tracking-tighter opacity-60">
                                                {isMe ? 'Você' : m.sender_name}
                                            </span>
                                        </div>
                                    )}
                                    <p className="leading-relaxed">{m.message}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {activeTicket.status === 'OPEN' && !isResolved ? (
                    <div className="p-6 bg-white border-t flex gap-4 shrink-0">
                        <input 
                            className="flex-1 p-4 bg-gray-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                            placeholder="Digite sua mensagem..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                        />
                        <button 
                            onClick={handleSendMessage}
                            className="p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                        >
                            <Send size={24}/>
                        </button>
                    </div>
                ) : (
                    <div className="p-6 bg-emerald-50 border-t flex flex-col items-center justify-center text-emerald-800 font-black uppercase text-[10px] tracking-widest gap-2 shrink-0">
                        <CheckCircle className="text-emerald-500" size={24}/>
                        Este chamado foi encerrado.
                        <button onClick={() => setView('LIST')} className="mt-2 text-emerald-600 underline">Voltar para lista</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            <div className="text-center">
                <h1 className="text-3xl font-black text-gray-800">Centro de Suporte</h1>
                <p className="text-gray-500 mt-2">Estamos aqui para resolver qualquer problema com a plataforma.</p>
            </div>

            {!navigator.onLine && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-2">
                    <WifiOff size={14} />
                    Offline: novos chamados e mensagens serao enfileirados e enviados quando a internet voltar.
                </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 p-8 border-emerald-100 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                        <HelpCircle size={32} />
                    </div>
                    <h3 className="font-bold text-gray-800">Novo Chamado</h3>
                    <p className="text-xs text-gray-400 mt-1 mb-6">Relate um problema ou dúvida técnica.</p>
                    <div className="w-full space-y-3">
                        <Button onClick={() => setView('NEW')} className="w-full font-black">Abrir Ticket</Button>
                        <Button onClick={handleWhatsAppContact} variant="outline" className="w-full font-black">
                            Contactar no WhatsApp
                        </Button>
                        {supportWhatsApp && (
                            <p className="text-[10px] text-emerald-700 font-black">+{supportWhatsApp}</p>
                        )}
                    </div>
                </Card>

                <div className="md:col-span-2 space-y-4">
                    <h4 className="font-black text-xs uppercase tracking-widest text-gray-400 flex items-center gap-2 px-2">
                        <Clock size={14}/> Meus Chamados
                    </h4>
                    {tickets.length === 0 && !loading ? (
                        <div className="bg-white p-12 rounded-[40px] border border-dashed text-center flex flex-col items-center">
                            <MessageCircle className="text-gray-200 mb-2" size={40}/>
                            <p className="text-xs font-bold text-gray-300 uppercase">Nenhum chamado aberto</p>
                        </div>
                    ) : (
                        tickets.map(t => (
                            <div 
                                key={t.id} 
                                onClick={() => { setActiveTicket(t); setView('CHAT'); }}
                                className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black shrink-0 ${t.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                                        <MessageCircle size={24}/>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">{t.subject}</h4>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(t.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Badge color={t.status === 'OPEN' ? 'green' : 'gray'}>{t.status}</Badge>
                                    <ChevronRight className="text-gray-200 group-hover:text-emerald-500 transition-colors" size={20}/>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {view === 'NEW' && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
                    <Card className="w-full max-w-lg p-8 animate-scale-in">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="font-black text-2xl text-gray-800">Novo Chamado</h3>
                            <button onClick={() => setView('LIST')} className="p-2 hover:bg-gray-100 rounded-full"><X/></button>
                        </div>
                        <form onSubmit={handleStartTicket} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Assunto</label>
                                <select className="w-full p-4 bg-gray-50 border rounded-2xl outline-none font-bold" value={subject} onChange={e => setSubject(e.target.value)} required>
                                    <option value="">Selecione...</option>
                                    {user.role === UserRole.PHARMACY ? (
                                        <>
                                            <option value="Problema no Painel">Problema no Painel</option>
                                            <option value="Dúvida com Taxas">Dúvida com Taxas</option>
                                            <option value="Relatar Bug">Relatar Bug</option>
                                            <option value="Solicitação de Recurso">Solicitação de Recurso</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="Problema com Pedido">Problema com Pedido</option>
                                            <option value="Erro no Sistema">Erro no Sistema</option>
                                            <option value="Dúvida Financeira">Dúvida Financeira</option>
                                            <option value="Sugestão">Sugestão</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Mensagem</label>
                                <textarea className="w-full p-4 bg-gray-50 border rounded-2xl outline-none h-32 text-sm" placeholder="Descreva seu problema..." value={initialMessage} onChange={e => setInitialMessage(e.target.value)} required />
                            </div>
                            <Button type="submit" disabled={loading} className="w-full py-4 font-black">
                                {loading ? <Loader2 className="animate-spin" /> : 'Enviar Chamado'}
                            </Button>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};
