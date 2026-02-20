
import React, { useState, useEffect, useRef } from 'react';
import { Bell, Menu, X, LogOut, ShoppingCart, Trash2, ChevronLeft, ChevronRight, FileText, ShoppingBag, Info, MessageCircle, Wallet } from 'lucide-react';
import { UserRole } from '../types';
import type { User, Notification as AppNotification } from '../types';
import { fetchNotifications, markNotificationRead, markNotificationsReadBatch, deleteNotification } from '../services/dataService';
import { playSound, triggerHapticFeedback } from '../services/soundService';
import { supabase } from '../services/supabaseClient';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  menuItems: { id: string; label: string; icon: any }[];
  cartCount?: number; 
}

const LOGO_URL = "https://res.cloudinary.com/dzvusz0u4/image/upload/v1765977310/wrzwildc1kqsq5skklio.png";

const showWebSystemNotification = (title: string, body: string) => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (document.visibilityState === 'visible') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body });
        }
      });
    }
  } catch (error) {
    // Best effort only.
  }
};

export const Header: React.FC<{ currentPage: string, setPage: (p: string) => void, onLoginClick: () => void }> = ({ 
  onLoginClick 
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md z-[100] border-b border-gray-100 px-6 md:px-12 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 shadow-lg border border-gray-50">
          <img src={LOGO_URL} className="w-full h-full object-contain" alt="Logo" />
        </div>
        <span className="font-black text-xl text-gray-800 tracking-tighter">FARMOLINK</span>
      </div>
      <button 
        onClick={onLoginClick}
        className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 uppercase tracking-widest"
      >
        ENTRAR
      </button>
    </header>
  );
};

export const MainLayout: React.FC<LayoutProps> = ({ 
    children, user, activePage, onNavigate, onLogout, menuItems, cartCount 
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false); 
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  
  const prevUnreadCountRef = useRef(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (!user?.id) return;

      loadNotifications();

      const channel = supabase
          .channel(`user-notifs-${user.id}`)
          .on('postgres_changes', 
              { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, 
              (payload: any) => {
                  loadNotifications();
                  playSound('notification');
                  triggerHapticFeedback([18, 50, 18]);
                  showWebSystemNotification(
                    payload?.new?.title || 'Nova notificacao',
                    payload?.new?.message || 'Existe uma nova atualizacao'
                  );
              }
          )
          .subscribe();
      
      return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
              if (showNotif) toggleNotif();
          }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotif]);

  const loadNotifications = async () => {
      const data = await fetchNotifications();
      const currentUnread = data.filter(n => !n.read).length;
      prevUnreadCountRef.current = currentUnread;
      setNotifications(data);
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNavigate = (id: string) => {
      onNavigate(id);
      setIsMobileMenuOpen(false);
      playSound('click');
  };

  const toggleNotif = async () => {
      setShowNotif(!showNotif);
      if (!showNotif && unreadCount > 0) {
          const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
          setNotifications(prev => prev.map(n => ({...n, read: true})));
          prevUnreadCountRef.current = 0;
          await markNotificationsReadBatch(unreadIds);
      }
  };

  const handleDeleteNotif = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      playSound('trash');
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // 2. ROTEAMENTO INTELIGENTE DE NOTIFICAÇÕES
  const handleNotificationClick = async (notif: AppNotification) => {
      // Marca como lida
      if (!notif.read) {
          await markNotificationRead(notif.id);
          setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      }

      setShowNotif(false);
      playSound('click');

      const type = (notif.type || '').toUpperCase();
      const title = (notif.title || '').toUpperCase();
      const msg = (notif.message || '').toUpperCase();

      // --- LOGICA REFINADA PARA EVITAR CONFUSÃO ENTRE "PEDIDO DE PREÇO" E "PEDIDO DE VENDA" ---

      // A. PEDIDOS CONFIRMADOS / VENDAS (PRIORIDADE)
      // Identifica se é uma compra real (Order)
      if (
          type.includes('ORDER') || 
          title.includes('ENCOMENDA') || 
          title.includes('COMPRA') || 
          (title.includes('PEDIDO') && !title.includes('PREÇO') && !title.includes('ORÇAMENTO') && !title.includes('COTAÇÃO'))
      ) {
          if (user.role === 'PHARMACY') onNavigate('pharmacy-orders');
          else if (user.role === 'CUSTOMER') onNavigate('orders');
          else onNavigate('admin-orders');
      }
      
      // B. RECEITAS / COTAÇÕES / TRIAGEM (PRÉ-VENDA)
      // Identifica se é fase de negociação (Request)
      else if (
          type.includes('RX') || 
          title.includes('RECEITA') || 
          msg.includes('RECEITA') || 
          title.includes('ORÇAMENTO') || 
          title.includes('PREÇO') ||
          title.includes('COTAÇÃO')
      ) {
          if (user.role === 'PHARMACY') onNavigate('pharmacy-requests');
          else if (user.role === 'CUSTOMER') onNavigate('prescriptions');
          else onNavigate('admin-orders');
      } 
      
      // C. SUPORTE (SUPPORT)
      else if (type.includes('SUPPORT') || title.includes('SUPORTE') || msg.includes('CHAMADO') || msg.includes('TICKET')) {
          if (user.role === 'ADMIN') onNavigate('admin-support');
          else onNavigate('support');
      }
      
      // D. FINANCEIRO (FINANCE)
      else if (type.includes('FINANCE') || title.includes('TAXA') || title.includes('PAGAMENTO') || msg.includes('FATURA')) {
          if (user.role === 'PHARMACY') onNavigate('pharmacy-financial');
          else if (user.role === 'ADMIN') onNavigate('admin-financial');
      }
      
      // E. PADRÃO / SISTEMA
      else {
          if (user.role === 'PHARMACY') onNavigate('dashboard');
          else if (user.role === 'ADMIN') onNavigate('admin-dashboard');
          else onNavigate('home');
      }
  };

  const getNotifIcon = (type: string) => {
      const t = type.toUpperCase();
      if (t.includes('RX')) return <FileText size={16} className="text-blue-500" />;
      if (t.includes('ORDER')) return <ShoppingBag size={16} className="text-emerald-500" />;
      if (t.includes('SUPPORT')) return <MessageCircle size={16} className="text-purple-500" />;
      if (t.includes('FINANCE')) return <Wallet size={16} className="text-yellow-500" />;
      return <Info size={16} className="text-gray-500" />;
  };

  return (
    <div className="flex h-[100dvh] bg-gradient-to-br from-slate-100 via-cyan-50 to-emerald-100 overflow-hidden font-sans">
        
        {isMobileMenuOpen && (
            <div className="fixed inset-0 bg-black/60 z-[60] md:hidden backdrop-blur-sm transition-all" onClick={() => setIsMobileMenuOpen(false)} />
        )}

        <aside className={`
            fixed inset-y-0 left-0 z-[70] bg-gradient-to-b from-slate-950 via-emerald-950 to-teal-900 text-white shadow-2xl flex flex-col transition-all duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'} 
            md:relative md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-64'}
        `}>
            <div className={`h-20 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-4'} border-b border-white/10 bg-white/5 backdrop-blur-sm shrink-0`}>
                {!isCollapsed ? (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-white p-1.5 rounded-xl text-emerald-800 shadow-sm shrink-0 ring-2 ring-emerald-300/30">
                            <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain" />
                        </div>
                        <div className="animate-fade-in overflow-hidden">
                            <h1 className="font-bold text-lg tracking-tight leading-none text-white truncate">FARMOLINK</h1>
                            <p className="text-[9px] text-cyan-300 uppercase tracking-widest leading-none mt-1 font-black truncate">
                                {user.role === 'CUSTOMER' ? 'UTENTE' : (user.role === 'ADMIN' ? 'ADMINISTRADOR' : 'FARMÁCIA')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white p-1.5 rounded-xl text-emerald-800 shadow-lg ring-2 ring-emerald-300/30">
                        <img src={LOGO_URL} alt="Logo" className="w-10 h-10 object-contain" />
                    </div>
                )}

                <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-cyan-200 p-1 hover:bg-white/10 rounded-full">
                    <X size={24}/>
                </button>

                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)} 
                    className={`hidden md:flex text-cyan-200 hover:text-white transition-colors p-1 rounded hover:bg-white/10 ${isCollapsed ? 'absolute -right-3 top-8 bg-emerald-700 rounded-full shadow-md border border-emerald-300/30' : ''}`}
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 custom-scrollbar">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => handleNavigate(item.id)}
                        className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-3.5 rounded-2xl transition-all duration-200 group relative border
                            ${activePage === item.id 
                                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg border-white/30 scale-[1.02]' 
                                : 'text-emerald-50 hover:bg-white/10 hover:text-white border-transparent'
                            }
                        `}
                    >
                        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${activePage === item.id ? 'bg-white/25' : 'bg-white/5 group-hover:bg-white/15'}`}>
                            <item.icon size={20} className={`${activePage === item.id ? 'text-white' : 'text-cyan-200 group-hover:text-white'} shrink-0`} />
                        </div>
                        
                        {!isCollapsed && (
                            <span className="font-black ml-3 text-[11px] whitespace-nowrap overflow-hidden text-ellipsis animate-fade-in flex-1 text-left pr-4 uppercase tracking-wider">
                                {item.label}
                            </span>
                        )}

                        {!isCollapsed && activePage === item.id && (
                            <span className="h-2 w-2 rounded-full bg-white shadow absolute right-3 top-1/2 -translate-y-1/2" />
                        )}
                        
                        {item.id === 'cart' && cartCount && cartCount > 0 ? (
                            <span className={`absolute ${isCollapsed ? 'top-1 right-1 w-4 h-4 p-0' : 'right-3 top-1/2 -translate-y-1/2 px-2 py-0.5'} bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center`}>
                                {cartCount}
                            </span>
                        ) : null}
                    </button>
                ))}
            </nav>

            <div className="p-3 border-t border-white/10 bg-black/20 backdrop-blur-sm shrink-0">
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 mb-3 px-1'}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-white font-bold border-2 border-white/20 shrink-0 text-sm shadow-inner">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                    
                    {!isCollapsed && (
                        <div className="flex-1 overflow-hidden animate-fade-in">
                            <p className="text-sm font-bold text-white truncate uppercase">{user.name}</p>
                            <p className="text-[10px] text-cyan-200 truncate font-black">{user.email.toUpperCase()}</p>
                        </div>
                    )}
                </div>
                
                <button 
                    onClick={onLogout} 
                    className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-start px-4'} gap-3 bg-white/5 hover:bg-red-600/90 text-cyan-100 hover:text-white py-3 rounded-xl transition-all duration-300 group shadow-sm border border-white/10`}
                >
                    <LogOut size={18} className="shrink-0 group-hover:scale-110 transition-transform" />
                    {!isCollapsed && <span className="text-[11px] font-black whitespace-nowrap uppercase tracking-widest">ENCERRAR SESSÃO</span>}
                </button>
            </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-transparent h-full">
            <header className="bg-white/80 backdrop-blur-md border-b border-white/60 h-16 flex items-center justify-between px-4 md:px-8 shadow-sm z-50 sticky top-0 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-gray-500 hover:text-emerald-600 p-2 transition-colors shrink-0 bg-white rounded-xl border border-gray-200">
                        <Menu size={24} />
                    </button>
                    <h2 className="font-black text-gray-800 text-lg md:text-xl truncate uppercase tracking-tight">
                        {menuItems.find(m => m.id === activePage)?.label || 'FARMOLINK'}
                    </h2>
                </div>

                <div className="flex items-center gap-1 md:gap-4 shrink-0">
                    {user.role === UserRole.CUSTOMER && (
                        <button onClick={() => onNavigate('cart')} className="relative p-2 text-gray-500 hover:text-emerald-600 transition-colors rounded-xl hover:bg-white border border-transparent hover:border-emerald-200">
                            <ShoppingCart size={22} />
                            {cartCount && cartCount > 0 ? (
                                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full ring-2 ring-white">
                                    {cartCount}
                                </span>
                            ) : null}
                        </button>
                    )}

                    <div className="relative" ref={notifRef}>
                        <button onClick={() => toggleNotif()} className="relative p-2 text-gray-500 hover:text-emerald-600 transition-colors rounded-xl hover:bg-white border border-transparent hover:border-emerald-200">
                            <Bell size={22} className={unreadCount > 0 ? 'animate-bounce text-emerald-600' : ''} />
                            {unreadCount > 0 && <span className="absolute top-2 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>}
                        </button>

                        {showNotif && (
                            <div className="absolute top-full right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[100] animate-fade-in origin-top-right">
                                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                                    <h4 className="font-black text-xs text-gray-700 uppercase tracking-widest">NOTIFICAÇÕES</h4>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{notifications.length}</span>
                                </div>
                                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                                    {notifications.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest italic">SEM NOVAS NOTIFICAÇÕES</div>
                                    ) : (
                                        notifications.map(n => (
                                            <div 
                                                key={n.id} 
                                                onClick={() => handleNotificationClick(n)}
                                                className={`p-4 border-b border-gray-50 hover:bg-gray-50 relative group transition-colors cursor-pointer ${!n.read ? 'bg-blue-50/30' : ''}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="mt-1">{getNotifIcon(n.type)}</div>
                                                    <div className="flex-1 min-w-0 pr-6">
                                                        <p className="text-xs font-black text-gray-800 uppercase tracking-tighter truncate">{n.title}</p>
                                                        <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                                                        <p className="text-[8px] text-gray-300 font-bold mt-1 uppercase">{new Date(n.date).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={(e) => handleDeleteNotif(e, n.id)} 
                                                    className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 scroll-smooth pb-24 custom-scrollbar">
                <div className="max-w-7xl mx-auto min-h-full">
                    {children}
                </div>
            </main>
        </div>
    </div>
  );
};
