import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Bot, Minus, RefreshCw } from 'lucide-react';
import { getChatSession, checkAiHealth, fetchChatHistory } from '../services/geminiService';
import { playSound } from '../services/soundService';
import { supabase } from '../services/supabaseClient';

interface Message {
    role: 'user' | 'model';
    text: string;
}

export const ChatBot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [user, setUser] = useState<any>(null);
    const chatSessionRef = useRef<any>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const init = async () => {
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
                setUser(data.user);
                const history = await fetchChatHistory(data.user.id);
                if (history.length > 0) {
                    setMessages(history.map((h: any) => ({ role: h.role, text: h.content })));
                } else {
                    setMessages([{ role: 'model', text: 'Olá! Sou o FarmoBot. Como posso ajudar?' }]);
                }
            }
        };
        init();
    }, []);

    const verifyConnection = async () => {
        if (!navigator.onLine) {
            setIsConnected(false);
            return;
        }
        setIsConnected(null);
        const alive = await checkAiHealth();
        setIsConnected(alive);
        if (alive) chatSessionRef.current = getChatSession();
    };

    useEffect(() => {
        if (isOpen && isConnected === null) verifyConnection();
    }, [isOpen]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading || !user) return;
        if (!navigator.onLine) {
            setMessages(prev => [...prev, { role: 'model', text: 'Sem internet. O chat IA fica disponivel quando a conexao voltar.' }]);
            return;
        }

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);
        playSound('click');

        try {
            if (!chatSessionRef.current) chatSessionRef.current = getChatSession();
            const result = await chatSessionRef.current.sendMessage({ 
                message: userMsg,
                userName: user.user_metadata?.name || 'Utente',
                userId: user.id,
                history: messages.slice(-6) // Envia as últimas 6 mensagens como contexto
            });
            
            setMessages(prev => [...prev, { role: 'model', text: result.text }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'model', text: 'Tive um erro de rede. Pode repetir?' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-[350px] sm:w-[380px] h-[500px] bg-white rounded-[32px] shadow-2xl border border-emerald-100 flex flex-col overflow-hidden animate-scale-in">
                    <div className="bg-emerald-600 p-5 text-white flex justify-between items-center shrink-0 shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center relative">
                                <Bot size={28} />
                                {isConnected && <div className="absolute -bottom-1 -right-1 bg-emerald-400 w-4 h-4 rounded-full border-2 border-emerald-600"></div>}
                            </div>
                            <div>
                                <h4 className="font-black text-sm leading-none">FarmoBot AI</h4>
                                <p className="text-[10px] text-emerald-100 font-bold mt-1">
                                    {isConnected === null ? 'Conectando...' : (isConnected ? 'Online' : 'Offline')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={verifyConnection} className="hover:bg-white/10 p-2 rounded-full"><RefreshCw size={16}/></button>
                            <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full"><Minus size={20} /></button>
                        </div>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50 custom-scrollbar scroll-smooth">
                        {messages.map((m, idx) => (
                            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                                <div className={`max-w-[85%] p-4 rounded-3xl text-sm ${m.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none shadow-md' : 'bg-white text-gray-800 border-l-4 border-emerald-500 rounded-tl-none shadow-sm'}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 bg-white border-t flex gap-2 shrink-0 items-center">
                        <input className="flex-1 p-4 bg-gray-50 border-2 border-transparent focus:border-emerald-100 rounded-2xl outline-none text-sm transition-all" placeholder="Mensagem..." value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} />
                        <button onClick={handleSend} disabled={loading || !input.trim()} className="w-14 h-14 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center shadow-lg active:scale-90"><Send size={22} /></button>
                    </div>
                </div>
            )}
            <button onClick={() => setIsOpen(!isOpen)} className={`w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl transition-all duration-500 ${isOpen ? 'bg-white text-emerald-600 rotate-90' : 'bg-emerald-600 text-white'}`}>
                {isOpen ? <X size={32} /> : <MessageCircle size={32} />}
            </button>
        </div>
    );
};
