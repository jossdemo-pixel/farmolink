import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Bot, Minus, RefreshCw, Plus, Trash2 } from 'lucide-react';
import {
  BotActionEvent,
  BotConversationStatus,
  BotMode,
  BotRiskLevel,
  getChatSession,
  checkAiHealth,
  fetchChatHistory,
  clearChatHistory,
} from '../services/geminiService';
import { playSound } from '../services/soundService';
import { supabase } from '../services/supabaseClient';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface QueuedMessage {
  text: string;
  historySnapshot: Message[];
}

interface ChatBotProps {
  onAction?: (action: BotActionEvent) => void;
  preferredPharmacyId?: string | null;
}

const DEFAULT_GREETING_MESSAGE: Message = { role: 'model', text: 'Ola. Sou o FarmoBot. Como posso ajudar?' };

const modeLabel = (mode?: BotMode) => {
  if (mode === 'COMMERCIAL') return 'Comercial';
  if (mode === 'EDUCATIONAL') return 'Educativo';
  if (mode === 'SENSITIVE') return 'Sensivel';
  if (mode === 'NAVIGATION') return 'Navegacao';
  return '-';
};

const statusLabel = (status?: BotConversationStatus) => {
  if (status === 'bot_active') return 'Ativo';
  if (status === 'escalated_pharmacy') return 'Escalado Farmacia';
  if (status === 'escalated_admin') return 'Escalado Admin';
  if (status === 'resolved') return 'Resolvido';
  return '-';
};

const riskLabel = (risk?: BotRiskLevel) => {
  if (!risk) return '-';
  if (risk === 'CRITICAL') return 'Critico';
  if (risk === 'HIGH') return 'Alto';
  if (risk === 'MEDIUM') return 'Medio';
  return 'Baixo';
};

export const ChatBot: React.FC<ChatBotProps> = ({ onAction, preferredPharmacyId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [forceNewConversation, setForceNewConversation] = useState(false);
  const [botStatus, setBotStatus] = useState<BotConversationStatus | undefined>(undefined);
  const [botMode, setBotMode] = useState<BotMode | undefined>(undefined);
  const [riskLevel, setRiskLevel] = useState<BotRiskLevel | undefined>(undefined);
  const chatSessionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setUser(data.user);
        const history = await fetchChatHistory(data.user.id);
        if (history.length > 0) {
          setMessages(history.map((h: any) => ({ role: h.role, text: h.content })));
          const lastConversationId = history[history.length - 1]?.conversationId;
          if (lastConversationId) setConversationId(lastConversationId);
        } else {
          setMessages([DEFAULT_GREETING_MESSAGE]);
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

  const executeActions = (actions: BotActionEvent[]) => {
    if (!onAction || !Array.isArray(actions) || actions.length === 0) return;
    actions.forEach((action) => onAction(action));
  };

  const handleNewChat = () => {
    setConversationId(undefined);
    setForceNewConversation(true);
    setBotStatus(undefined);
    setBotMode(undefined);
    setRiskLevel(undefined);
    setQueue([]);
    setIsProcessing(false);
    setMessages([DEFAULT_GREETING_MESSAGE]);
  };

  const handleClearHistory = async () => {
    if (!user || isClearingHistory) return;
    if (!window.confirm('Deseja apagar todo o historico do chat?')) return;

    setIsClearingHistory(true);
    const ok = await clearChatHistory(user.id);
    setIsClearingHistory(false);

    if (ok) {
      handleNewChat();
      playSound('success');
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: 'model', text: 'Nao consegui apagar o historico agora. Tente novamente.' },
    ]);
  };

  const enqueueMessage = () => {
    if (!input.trim() || !user || isClearingHistory) return;
    if (!navigator.onLine) {
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Sem internet. O chat IA fica disponivel quando a conexao voltar.' },
      ]);
      return;
    }

    const userMsg = input.trim();
    const historySnapshot: Message[] = [...messagesRef.current.slice(-7), { role: 'user', text: userMsg }];
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setQueue((prev) => [...prev, { text: userMsg, historySnapshot }]);
    playSound('click');
  };

  const processNextMessage = useCallback(async () => {
    if (isProcessing || queue.length === 0 || !user || isClearingHistory) return;

    const nextItem = queue[0];
    const userMsg = nextItem.text;
    setIsProcessing(true);
    try {
      if (!chatSessionRef.current) chatSessionRef.current = getChatSession();
      const result = await chatSessionRef.current.sendMessage({
        message: userMsg,
        userName: user.user_metadata?.name || 'Utente',
        userId: user.id,
        conversationId,
        pharmacyId: preferredPharmacyId || undefined,
        forceNewConversation,
        history: nextItem.historySnapshot,
      });

      setMessages((prev) => [...prev, { role: 'model', text: result.text }]);
      if (result.conversationId) setConversationId(result.conversationId);
      setForceNewConversation(false);
      if (result.conversationStatus) setBotStatus(result.conversationStatus);
      if (result.mode) setBotMode(result.mode);
      if (result.riskLevel) setRiskLevel(result.riskLevel);
      executeActions(result.actions || []);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'model', text: 'Tive um erro de rede. Pode repetir?' }]);
    } finally {
      setQueue((prev) => prev.slice(1));
      setIsProcessing(false);
    }
  }, [
    isProcessing,
    queue,
    user,
    isClearingHistory,
    conversationId,
    preferredPharmacyId,
    forceNewConversation,
  ]);

  useEffect(() => {
    processNextMessage();
  }, [processNextMessage]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[350px] sm:w-[390px] h-[520px] bg-white rounded-[32px] shadow-2xl border border-emerald-100 flex flex-col overflow-hidden animate-scale-in">
          <div className="bg-emerald-600 p-5 text-white flex justify-between items-center shrink-0 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center relative">
                <Bot size={28} />
                {isConnected && (
                  <div className="absolute -bottom-1 -right-1 bg-emerald-400 w-4 h-4 rounded-full border-2 border-emerald-600" />
                )}
              </div>
              <div>
                <h4 className="font-black text-sm leading-none">FarmoBot</h4>
                <p className="text-[10px] text-emerald-100 font-bold mt-1">
                  {isConnected === null ? 'Conectando...' : isConnected ? 'Online' : 'Offline'}
                </p>
                <p className="text-[9px] text-emerald-50/90 mt-1 font-semibold">
                  {botMode || riskLevel || botStatus
                    ? `Modo: ${modeLabel(botMode)} | Risco: ${riskLabel(riskLevel)} | Estado: ${statusLabel(botStatus)}`
                    : 'Pronto para ajudar com compra, receita e navegacao.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleNewChat} className="hover:bg-white/10 p-2 rounded-full" title="Novo chat">
                <Plus size={16} />
              </button>
              <button
                onClick={handleClearHistory}
                disabled={isClearingHistory}
                className="hover:bg-white/10 p-2 rounded-full disabled:opacity-50"
                title="Apagar historico"
              >
                <Trash2 size={16} />
              </button>
              <button onClick={verifyConnection} className="hover:bg-white/10 p-2 rounded-full">
                <RefreshCw size={16} />
              </button>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full">
                <Minus size={20} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50 custom-scrollbar scroll-smooth">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div
                  className={`max-w-[86%] p-4 rounded-3xl text-sm ${
                    m.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-tr-none shadow-md'
                      : 'bg-white text-gray-800 border-l-4 border-emerald-500 rounded-tl-none shadow-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start animate-fade-in">
                <div className="max-w-[86%] p-4 rounded-3xl text-sm bg-white text-gray-700 border-l-4 border-emerald-500 rounded-tl-none shadow-sm flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-emerald-600" />
                  Processando sua mensagem...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t flex gap-2 shrink-0 items-center">
            <input
              className="flex-1 p-4 bg-gray-50 border-2 border-transparent focus:border-emerald-100 rounded-2xl outline-none text-sm transition-all"
              placeholder="Mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enqueueMessage()}
            />
            <button
              onClick={enqueueMessage}
              disabled={isClearingHistory || !input.trim()}
              className="w-14 h-14 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center shadow-lg active:scale-90"
            >
              <Send size={22} />
            </button>
          </div>
          {(isProcessing || queue.length > 0) && (
            <div className="px-4 pb-3 text-[10px] text-gray-500 font-semibold">
              {isProcessing
                ? `Processando. Mensagens na fila: ${Math.max(0, queue.length - 1)}`
                : `Mensagens na fila: ${queue.length}`}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl transition-all duration-500 ${
          isOpen ? 'bg-white text-emerald-600 rotate-90' : 'bg-emerald-600 text-white'
        }`}
      >
        {isOpen ? <X size={32} /> : <MessageCircle size={32} />}
      </button>
    </div>
  );
};
