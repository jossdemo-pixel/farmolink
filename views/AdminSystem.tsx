
import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Toast, Badge, NumericInput } from '../components/UI';
import { generateFullSystemBackup, restoreFullSystemBackup, sendSystemNotification, sendSystemNotificationToUser, fetchNotificationRecipients, NotificationRecipient, RestoreOptions, fetchAllAdminBanners, saveAllAdminBanners, saveAdminBanner, deleteAdminBanner, fetchAdminFaq, saveAdminFaq, fetchAdminAbout, saveAdminAbout, fetchAllCarouselSlides, saveAllCarouselSlides, saveCarouselSlide, fetchLegalContent, saveLegalContent, DEFAULT_PRIVACY_POLICY_TEXT, DEFAULT_TERMS_OF_USE_TEXT, DEFAULT_LEGAL_UPDATED_AT } from '../services/dataService';
import { 
    Settings, Save, Megaphone, ShieldCheck, Download, 
    UploadCloud, X, CheckCircle2, AlertTriangle, Database, 
    Users, Store, ShoppingBag, FileText, Loader2, Image as ImageIcon,
    MessageSquare, Info, HelpCircle, Plus, Trash2, Edit
} from 'lucide-react';
import { playSound } from '../services/soundService';

// Função para gerar UUID
const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const AdminSettingsView = () => {
    const [activeTab, setActiveTab] = useState<'network' | 'about' | 'faq' | 'legal' | 'banners' | 'broadcast'>('network');
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
    
    // Configurações de Rede
    const [config, setConfig] = useState({ commissionRate: 10, minOrderValue: 2000, supportWhatsapp: '244923123456', supportEmail: 'ajuda@farmolink.ao' });
    const [broadcast, setBroadcast] = useState({
        title: '',
        message: '',
        target: 'ALL' as 'ALL' | 'CUSTOMER' | 'PHARMACY',
        category: 'GENERAL' as 'GENERAL' | 'MARKETING'
    });
    const [broadcastMode, setBroadcastMode] = useState<'GLOBAL' | 'INDIVIDUAL'>('GLOBAL');
    const [recipientRoleFilter, setRecipientRoleFilter] = useState<'CUSTOMER' | 'PHARMACY' | 'ADMIN'>('CUSTOMER');
    const [recipientSearchTerm, setRecipientSearchTerm] = useState<string>('');
    const [recipientOptions, setRecipientOptions] = useState<NotificationRecipient[]>([]);
    const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');

    // Sobre Nós
    const [aboutData, setAboutData] = useState({
        mission: 'Digitalizar o ecossistema farmacêutico angolano, proporcionando transparência de preços e conveniência para todos os utilizadores, de Luanda a Cabinda.',
        innovation: 'Criado por angolanos para angolanos, entendemos os desafios logísticos e de literacia digital. Trabalhamos diretamente com farmacêuticos para oferecer soluções reais.',
        values: [
            { icon: '✓', title: 'Transparência', desc: 'Preços reais das farmácias em tempo real, sem surpresas.' },
            { icon: '🛡️', title: 'Segurança', desc: 'Dados protegidos conforme a Lei de Proteção de Dados de Angola (APD).' },
            { icon: '❤️', title: 'Ética', desc: 'Sempre exigimos a receita original para entrega de medicamentos.' },
            { icon: '🌍', title: 'Acessibilidade', desc: 'Feito para funcionar em qualquer telemóvel com dados móveis.' }
        ]
    });

    // FAQ
    const [faqData, setFaqData] = useState([
        { question: "Como compro na FarmoLink?", answer: "Podes pesquisar diretamente pelo nome do medicamento na tela inicial, ou tirar uma foto da tua receita médica. A IA analisará a receita e mostrará os medicamentos disponíveis nas farmácias mais próximas, com os respetivos preços." },
        { question: "Faz entregas?", answer: "Sim! Algumas farmácias têm entrega própria e outras permitem apenas levantamento em loja. Quando fazes a compra, a plataforma já indica se a farmácia faz entrega ou levantamento." },
        { question: "Precisa da receita física?", answer: "SIM. A entrega de medicamentos sujeitos a receita médica só será feita se entregares a receita original física ao estafeta. Isto é uma exigência legal em Angola e protege a tua saúde." },
        { question: "Como pago?", answer: "Diretamente à farmácia ou ao estafeta no ato da entrega. Aceitamos pagamento via TPA (Multicaixa), MCX Express ou dinheiro." },
        { question: "A IA pode errar a ler a receita?", answer: "Sim, a IA é apenas um assistente. O farmacêutico da farmácia fará sempre uma verificação manual da foto da receita antes de preparar a encomenda. A segurança é prioridade." },
        { question: "Os preços são iguais à loja?", answer: "Sim. As farmácias parceiras comprometem-se a praticar os mesmos preços que cobram no balcão físico. Sem surpresas." },
        { question: "Os meus dados estão seguros?", answer: "Sim. Todos os teus dados são criptografados e protegidos conforme a Lei de Proteção de Dados de Angola (APD). Usamos servidores seguros e não partilhamos informações pessoais com terceiros sem consentimento." },
        { question: "Posso devolver um medicamento?", answer: "Medicamentos só podem ser devolvidos se chegarem danificados ou com defeito. Contacta-nos imediatamente se isto acontecer e solucionaremos o problema." }
    ]);

    // Slides do Carrossel
    const [slidesData, setSlidesData] = useState<any[]>([]);
    const [editingFaqIndex, setEditingFaqIndex] = useState<number | null>(null);
    const [legalData, setLegalData] = useState({
        privacyPolicy: DEFAULT_PRIVACY_POLICY_TEXT,
        termsOfUse: DEFAULT_TERMS_OF_USE_TEXT,
        updatedAt: DEFAULT_LEGAL_UPDATED_AT
    });

    // Carregar dados do Supabase ao montar o componente
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [slides, faqs, about, legal] = await Promise.all([
                    fetchAllCarouselSlides(),
                    fetchAdminFaq(),
                    fetchAdminAbout(),
                    fetchLegalContent()
                ]);

                // Carregar slides do Supabase
                if (slides && slides.length > 0) {
                    setSlidesData(slides);
                } else {
                    // Se não houver no BD, inicializar vazio
                    setSlidesData([]);
                }

                if (faqs && faqs.length > 0) {
                    setFaqData(faqs.map(f => ({ question: f.question, answer: f.answer })));
                }

                if (about) {
                    setAboutData(about);
                }
                if (legal) {
                    setLegalData(legal);
                }
            } catch (e) {
                console.error("Erro ao carregar dados:", e);
            }
            setLoading(false);
        };

        loadData();
    }, []);

    useEffect(() => {
        let isMounted = true;
        const timer = window.setTimeout(async () => {
            const users = await fetchNotificationRecipients(
                recipientRoleFilter,
                broadcastMode === 'INDIVIDUAL' ? recipientSearchTerm : ''
            );
            if (!isMounted) return;
            setRecipientOptions(users);
            setSelectedRecipientId(prev => (users.some(u => u.id === prev) ? prev : ''));
        }, 250);

        return () => {
            isMounted = false;
            window.clearTimeout(timer);
        };
    }, [recipientRoleFilter, recipientSearchTerm, broadcastMode]);

    const handleSaveConfig = () => {
        setLoading(true);
        setTimeout(() => { setLoading(false); playSound('save'); setToast({msg: "Configurações Salvas!", type: 'success'}); }, 800);
    };

    const handleSaveAbout = async () => {
        setLoading(true);
        const success = await saveAdminAbout(aboutData);
        setLoading(false);
        if (success) {
            playSound('save');
            setToast({msg: "Sobre Nós atualizado com sucesso!", type: 'success'});
        } else {
            setToast({msg: "Erro ao salvar. Tente novamente.", type: 'error'});
        }
    };

    const handleSaveFaq = async () => {
        setLoading(true);
        const success = await saveAdminFaq(faqData);
        setLoading(false);
        if (success) {
            playSound('save');
            setToast({msg: "FAQ atualizado com sucesso!", type: 'success'});
            setEditingFaqIndex(null);
        } else {
            setToast({msg: "Erro ao salvar. Tente novamente.", type: 'error'});
        }
    };

    const handleSaveSlides = async () => {
        setLoading(true);
        const success = await saveAllCarouselSlides(slidesData);
        setLoading(false);
        if (success) {
            playSound('save');
            setToast({msg: "Todos os slides foram salvos com sucesso!", type: 'success'});
        } else {
            setToast({msg: "Erro ao salvar. Tente novamente.", type: 'error'});
        }
    };

    const handleSaveLegal = async () => {
        setLoading(true);
        const success = await saveLegalContent(legalData);
        setLoading(false);
        if (success) {
            playSound('save');
            setToast({msg: "Politica e Termos atualizados com sucesso!", type: 'success'});
        } else {
            setToast({msg: "Erro ao salvar conteudo legal.", type: 'error'});
        }
    };

    const handleSaveSingleSlide = async (slideId: number | string) => {
        setLoading(true);
        const slide = slidesData.find((s: any) => s.id === slideId);
        if (slide) {
            const success = await saveCarouselSlide(slide);
            setLoading(false);
            if (success) {
                playSound('save');
                setToast({msg: "Slide salvo com sucesso!", type: 'success'});
            } else {
                setToast({msg: "Erro ao salvar. Tente novamente.", type: 'error'});
            }
        }
    };

    const addSlide = () => {
        const maxOrder = slidesData.length > 0 ? Math.max(...slidesData.map((s: any) => s.order || 0)) : 0;
        setSlidesData([...slidesData, { id: generateUUID(), title: '', subtitle: '', buttonText: 'Saiba Mais', imageUrl: '', order: maxOrder + 1 }]);
    };

    const handleSendBroadcast = async () => {
        if (!broadcast.title || !broadcast.message) return;
        setLoading(true);
        const result = broadcastMode === 'GLOBAL'
            ? await sendSystemNotification(broadcast.target, broadcast.title, broadcast.message, broadcast.category)
            : await sendSystemNotificationToUser(
                selectedRecipientId,
                broadcast.title,
                broadcast.message,
                recipientRoleFilter === 'PHARMACY' ? 'pharmacy-orders' : (recipientRoleFilter === 'ADMIN' ? 'admin-dashboard' : 'home'),
                broadcast.category
            );
        setLoading(false);
        if (result.success) {
            playSound('success');
            const reason = String(result.details?.reason || '');
            const recipients = Number(result.details?.recipients || 0);
            if (reason === 'no_tokens') {
                setToast({
                    msg: recipients > 0
                        ? `Comunicado enviado no app para ${recipients} utilizador(es). Nenhum dispositivo movel registado para push neste publico.`
                        : 'Comunicado enviado no app. Nenhum dispositivo movel registado para push.',
                    type: 'success'
                });
            } else if (reason === 'fcm_auth_unavailable' || reason === 'fcm_not_configured') {
                setToast({
                    msg: recipients > 0
                        ? `Comunicado enviado no app para ${recipients} utilizador(es). Push movel indisponivel no momento.`
                        : 'Comunicado enviado no app. Push movel indisponivel no momento.',
                    type: 'success'
                });
            } else {
                setToast({msg: "Comunicado enviado!", type: 'success'});
            }
            setBroadcast({ ...broadcast, title: '', message: '' });
        } else {
            const reason = result.error ? ` (${result.error})` : '';
            setToast({msg: `Falha ao enviar comunicado.${reason}`, type: 'error'});
        }
    };

    const addFaqItem = () => {
        setFaqData([...faqData, { question: '', answer: '' }]);
    };

    const deleteFaqItem = (index: number) => {
        setFaqData(faqData.filter((_, i) => i !== index));
        playSound('trash');
    };

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {toast && <Toast message={toast.msg} type={toast.type === 'success' ? 'success' : 'error'} onClose={() => setToast(null)} />}
            
            {/* ABAS */}
            <div className="flex gap-2 border-b border-gray-200 overflow-x-auto pb-0">
                <button onClick={() => setActiveTab('network')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'network' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    ⚙️ Rede
                </button>
                <button onClick={() => setActiveTab('about')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'about' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    ℹ️ Sobre Nós
                </button>
                <button onClick={() => setActiveTab('faq')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'faq' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    ❓ FAQ
                </button>
                <button onClick={() => setActiveTab('legal')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'legal' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    Legal
                </button>
                <button onClick={() => setActiveTab('banners')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'banners' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    🖼️ Banners
                </button>
                <button onClick={() => setActiveTab('broadcast')} className={`px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === 'broadcast' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-800'}`}>
                    📢 Comunicados
                </button>
            </div>

            {/* ABA: REDE */}
            {activeTab === 'network' && (
                <div className="grid lg:grid-cols-2 gap-8">
                    <Card title="Parâmetros de Rede" className="p-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Taxa (%)</label>
                                    <NumericInput
                                        className="w-full p-3 border rounded-xl"
                                        value={config.commissionRate}
                                        onValueChange={value => {
                                            if (typeof value === 'number') {
                                                setConfig({ ...config, commissionRate: value });
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase">Min. (Kz)</label>
                                    <NumericInput
                                        className="w-full p-3 border rounded-xl"
                                        value={config.minOrderValue}
                                        onValueChange={value => {
                                            if (typeof value === 'number') {
                                                setConfig({ ...config, minOrderValue: value });
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <div><label className="text-[10px] font-black text-gray-400 uppercase">WhatsApp</label><input type="text" className="w-full p-3 border rounded-xl" value={config.supportWhatsapp} onChange={e => setConfig({...config, supportWhatsapp: e.target.value})}/></div>
                            <div><label className="text-[10px] font-black text-gray-400 uppercase">Email</label><input type="email" className="w-full p-3 border rounded-xl" value={config.supportEmail} onChange={e => setConfig({...config, supportEmail: e.target.value})}/></div>
                            <Button onClick={handleSaveConfig} disabled={loading} className="w-full py-4"><Save size={18} className="mr-2"/> Atualizar Regras</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* ABA: SOBRE NÓS */}
            {activeTab === 'about' && (
                <div className="space-y-6">
                    <Card title="Missão" className="p-6">
                        <textarea className="w-full p-4 border rounded-xl font-medium text-gray-700 h-32" value={aboutData.mission} onChange={e => setAboutData({...aboutData, mission: e.target.value})}/>
                        <Button onClick={handleSaveAbout} disabled={loading} className="w-full mt-4 py-4"><Save size={18} className="mr-2"/> Salvar Missão</Button>
                    </Card>

                    <Card title="Inovação Local" className="p-6">
                        <textarea className="w-full p-4 border rounded-xl font-medium text-gray-700 h-32" value={aboutData.innovation} onChange={e => setAboutData({...aboutData, innovation: e.target.value})}/>
                        <Button onClick={handleSaveAbout} disabled={loading} className="w-full mt-4 py-4"><Save size={18} className="mr-2"/> Salvar Inovação</Button>
                    </Card>

                    <Card title="Valores" className="p-6">
                        <div className="space-y-4">
                            {aboutData.values.map((value, idx) => (
                                <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                    <div className="grid grid-cols-2 gap-4 mb-2">
                                        <input placeholder="Título" value={value.title} onChange={e => {
                                            const newValues = [...aboutData.values];
                                            newValues[idx].title = e.target.value;
                                            setAboutData({...aboutData, values: newValues});
                                        }} className="p-2 border rounded-xl font-bold text-sm"/>
                                        <input placeholder="Ícone" value={value.icon} onChange={e => {
                                            const newValues = [...aboutData.values];
                                            newValues[idx].icon = e.target.value;
                                            setAboutData({...aboutData, values: newValues});
                                        }} className="p-2 border rounded-xl text-center text-lg"/>
                                    </div>
                                    <textarea placeholder="Descrição" value={value.desc} onChange={e => {
                                        const newValues = [...aboutData.values];
                                        newValues[idx].desc = e.target.value;
                                        setAboutData({...aboutData, values: newValues});
                                    }} className="w-full p-2 border rounded-xl text-sm h-20"/>
                                </div>
                            ))}
                        </div>
                        <Button onClick={handleSaveAbout} disabled={loading} className="w-full mt-4 py-4"><Save size={18} className="mr-2"/> Salvar Valores</Button>
                    </Card>
                </div>
            )}

            {/* ABA: FAQ */}
            {activeTab === 'faq' && (
                <div className="space-y-4">
                    {faqData.map((item, idx) => (
                        <Card key={idx} className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="font-bold text-gray-800">Pergunta {idx + 1}</h4>
                                <button onClick={() => deleteFaqItem(idx)} className="p-2 hover:bg-red-100 rounded-xl text-red-600 transition-colors">
                                    <Trash2 size={18}/>
                                </button>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Pergunta</label>
                                    <input 
                                        type="text"
                                        value={item.question} 
                                        onChange={e => {
                                            const newFaq = [...faqData];
                                            newFaq[idx].question = e.target.value;
                                            setFaqData(newFaq);
                                        }}
                                        className="w-full p-3 border rounded-xl font-bold"
                                        placeholder="Ex: Como compro na FarmoLink?"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Resposta</label>
                                    <textarea 
                                        value={item.answer} 
                                        onChange={e => {
                                            const newFaq = [...faqData];
                                            newFaq[idx].answer = e.target.value;
                                            setFaqData(newFaq);
                                        }}
                                        className="w-full p-3 border rounded-xl h-32 text-sm"
                                        placeholder="Resposta detalhada..."
                                    />
                                </div>
                            </div>
                        </Card>
                    ))}
                    <Button onClick={addFaqItem} className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-600 hover:border-emerald-600 hover:text-emerald-600"><Plus size={18} className="mr-2"/> Adicionar Pergunta</Button>
                    <Button onClick={handleSaveFaq} disabled={loading} className="w-full py-4 bg-emerald-600"><Save size={18} className="mr-2"/> Salvar Todas as FAQ</Button>
                </div>
            )}

            {/* ABA: LEGAL */}
            {activeTab === 'legal' && (
                <div className="space-y-6">
                    <Card title="Politica de Privacidade" className="p-6">
                        <textarea
                            className="w-full p-4 border rounded-xl h-64 text-sm"
                            value={legalData.privacyPolicy}
                            onChange={e => setLegalData({ ...legalData, privacyPolicy: e.target.value })}
                            placeholder="Escreva o texto completo da Politica de Privacidade..."
                        />
                    </Card>
                    <Card title="Termos de Uso (visivel dentro da Politica)" className="p-6">
                        <textarea
                            className="w-full p-4 border rounded-xl h-64 text-sm"
                            value={legalData.termsOfUse}
                            onChange={e => setLegalData({ ...legalData, termsOfUse: e.target.value })}
                            placeholder="Escreva o texto completo dos Termos de Uso..."
                        />
                    </Card>
                    <Card title="Data da Ultima Atualizacao" className="p-6">
                        <input
                            type="date"
                            className="w-full p-3 border rounded-xl"
                            value={legalData.updatedAt}
                            onChange={e => setLegalData({ ...legalData, updatedAt: e.target.value })}
                        />
                        <Button onClick={handleSaveLegal} disabled={loading} className="w-full mt-4 py-4 bg-emerald-600">
                            <Save size={18} className="mr-2"/> Salvar Conteudo Legal
                        </Button>
                    </Card>
                </div>
            )}

            {/* ABA: SLIDES DO CARROSSEL */}
            {activeTab === 'banners' && (
                <div className="space-y-4">
                    {slidesData.map((slide: any, idx: number) => (
                        <Card key={slide.id} className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="font-bold text-gray-800">Slide {idx + 1}</h4>
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Ordem de Exibição</label>
                                    <NumericInput
                                        value={slide.order || idx + 1}
                                        integer
                                        className="w-full p-3 border rounded-xl font-bold text-lg"
                                        placeholder="Ex: 1, 2, 3..."
                                        onValueChange={value => {
                                            if (typeof value === 'number') {
                                                const newSlides = slidesData.map((s: any) => s.id === slide.id ? { ...s, order: value } : s);
                                                setSlidesData(newSlides);
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Título Principal</label>
                                    <input 
                                        type="text"
                                        value={slide.title} 
                                        onChange={e => {
                                            const newSlides = slidesData.map((s: any) => s.id === slide.id ? {...s, title: e.target.value} : s);
                                            setSlidesData(newSlides);
                                        }}
                                        className="w-full p-3 border rounded-xl font-bold text-lg"
                                        placeholder="Ex: A maior rede de farmácias online"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Subtítulo</label>
                                    <input 
                                        type="text"
                                        value={slide.subtitle || ''} 
                                        onChange={e => {
                                            const newSlides = slidesData.map((s: any) => s.id === slide.id ? {...s, subtitle: e.target.value} : s);
                                            setSlidesData(newSlides);
                                        }}
                                        className="w-full p-3 border rounded-xl text-sm text-gray-600"
                                        placeholder="Ex: Compare preços e receba medicamentos"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">URL da Imagem</label>
                                    <input 
                                        type="text"
                                        value={slide.imageUrl} 
                                        onChange={e => {
                                            const newSlides = slidesData.map((s: any) => s.id === slide.id ? {...s, imageUrl: e.target.value} : s);
                                            setSlidesData(newSlides);
                                        }}
                                        className="w-full p-3 border rounded-xl"
                                        placeholder="URL da imagem"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Texto do Botão</label>
                                    <input 
                                        type="text"
                                        value={slide.buttonText || 'Começar Agora'} 
                                        onChange={e => {
                                            const newSlides = slidesData.map((s: any) => s.id === slide.id ? {...s, buttonText: e.target.value} : s);
                                            setSlidesData(newSlides);
                                        }}
                                        className="w-full p-3 border rounded-xl font-bold text-emerald-600"
                                        placeholder="Ex: Começar Agora"
                                    />
                                </div>
                                
                                {/* PREVIEW DO SLIDE */}
                                {slide.imageUrl && (
                                    <div className="mt-6 pt-6 border-t">
                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-3">Pré-visualização</p>
                                        <div className="relative overflow-hidden rounded-2xl h-48 bg-gradient-to-r from-gray-100 to-gray-200 group">
                                            <img src={slide.imageUrl} alt="Slide" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"/>
                                            <div className="absolute inset-0 bg-black/50 flex flex-col items-start justify-center text-white p-8">
                                                <h3 className="text-2xl font-black mb-2 max-w-lg">{slide.title}</h3>
                                                <p className="text-sm mb-4 max-w-lg">{slide.subtitle}</p>
                                                <button className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors">
                                                    {slide.buttonText}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* BOTÃO DE SALVAR INDIVIDUAL */}
                                <Button 
                                    onClick={() => handleSaveSingleSlide(slide.id)}
                                    disabled={loading}
                                    className="w-full mt-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                >
                                    <Save size={16} className="mr-2"/> Salvar Este Slide
                                </Button>
                            </div>
                        </Card>
                    ))}
                    <Button onClick={addSlide} className="w-full py-4 border-2 border-dashed border-gray-300 text-gray-600 hover:border-emerald-600 hover:text-emerald-600"><Plus size={18} className="mr-2"/> Adicionar Slide</Button>
                    <Button onClick={handleSaveSlides} disabled={loading} className="w-full py-4 bg-emerald-600 font-bold shadow-lg"><Save size={18} className="mr-2"/> Salvar Todos os Slides</Button>
                </div>
            )}

            {/* ABA: COMUNICADOS */}
            {activeTab === 'broadcast' && (
                <Card className="p-8 border-l-8 border-orange-500 shadow-lg">
                    <h3 className="text-xl font-black text-gray-800 flex items-center gap-2 mb-6"><Megaphone className="text-orange-500"/> Enviar Comunicado Global</h3>
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setBroadcastMode('GLOBAL');
                                    setRecipientSearchTerm('');
                                    setSelectedRecipientId('');
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-black ${broadcastMode === 'GLOBAL' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                            >
                                Global
                            </button>
                            <button
                                onClick={() => setBroadcastMode('INDIVIDUAL')}
                                className={`px-4 py-2 rounded-xl text-xs font-black ${broadcastMode === 'INDIVIDUAL' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}
                            >
                                Individual
                            </button>
                        </div>
                        <input className="w-full p-3 border rounded-xl font-bold" placeholder="Assunto..." value={broadcast.title} onChange={e => setBroadcast({...broadcast, title: e.target.value})}/>
                        <textarea className="w-full p-3 border rounded-xl h-24 text-sm" placeholder="Mensagem..." value={broadcast.message} onChange={e => setBroadcast({...broadcast, message: e.target.value})}/>
                        <div className="flex gap-2 flex-wrap">
                            <select
                                className="p-3 border rounded-xl text-xs font-bold bg-gray-50 min-w-[150px]"
                                value={broadcast.category}
                                onChange={e => setBroadcast({...broadcast, category: e.target.value as 'GENERAL' | 'MARKETING'})}
                            >
                                <option value="GENERAL">Categoria: Geral</option>
                                <option value="MARKETING">Categoria: Marketing</option>
                            </select>
                            {broadcastMode === 'GLOBAL' ? (
                                <select 
                                    className="p-3 border rounded-xl text-xs font-bold bg-gray-50"
                                    value={broadcast.target}
                                    onChange={e => setBroadcast({...broadcast, target: e.target.value as any})}
                                >
                                    <option value="ALL">Todos</option>
                                    <option value="CUSTOMER">Clientes</option>
                                    <option value="PHARMACY">Farmácias</option>
                                </select>
                            ) : (
                                <>
                                    <select
                                        className="p-3 border rounded-xl text-xs font-bold bg-gray-50 min-w-[130px]"
                                        value={recipientRoleFilter}
                                        onChange={e => setRecipientRoleFilter(e.target.value as any)}
                                    >
                                        <option value="CUSTOMER">Clientes</option>
                                        <option value="PHARMACY">Farmácias</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                    <input
                                        type="text"
                                        className="p-3 border rounded-xl text-xs font-semibold bg-gray-50 flex-1 min-w-[180px]"
                                        placeholder="Pesquisar por nome ou email..."
                                        value={recipientSearchTerm}
                                        onChange={e => setRecipientSearchTerm(e.target.value)}
                                    />
                                    <select
                                        className="p-3 border rounded-xl text-xs font-bold bg-gray-50 flex-1 min-w-[240px]"
                                        value={selectedRecipientId}
                                        onChange={e => setSelectedRecipientId(e.target.value)}
                                    >
                                        <option value="">Selecionar utilizador...</option>
                                        {recipientOptions.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.name} - {u.email || 'sem email'}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
                            <Button className="flex-1 py-4 bg-orange-600 text-white min-w-[220px]" onClick={handleSendBroadcast} disabled={loading || !broadcast.title || !broadcast.message || (broadcastMode === 'INDIVIDUAL' && !selectedRecipientId)}>Enviar Notificação</Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export const AdminBackupView = () => {
    const [loading, setLoading] = useState(false);
    const [restoreProgress, setRestoreProgress] = useState<string | null>(null);
    const [backupFile, setBackupFile] = useState<any | null>(null);
    const [options, setOptions] = useState<RestoreOptions>({
        config: true,
        users: true,
        pharmacies: true,
        catalog: true,
        inventory: true,
        orders: false,
        prescriptions: false,
        support: false
    });
    
    const fileRef = useRef<HTMLInputElement>(null);

    const handleBackup = async () => { 
        setLoading(true); 
        await generateFullSystemBackup(); 
        setLoading(false); 
    };

    const handleFileSelect = (e: any) => {
        const file = e.target.files?.[0]; 
        if(!file) return;
        
        const reader = new FileReader();
        reader.onload = (event: any) => {
            try {
                const json = JSON.parse(event.target?.result);
                if (!json.data) throw new Error("Arquivo inválido");
                setBackupFile(json);
                playSound('click');
            } catch (err) {
                alert("Erro ao ler arquivo de backup. Certifique-se que é um JSON válido do FarmoLink.");
            }
        };
        reader.readAsText(file);
    };

    const handleConfirmRestore = async () => {
        if (!backupFile) return;
        if (!confirm("AVISO CRÍTICO: Esta operação irá sobrescrever dados existentes com base nas suas seleções. Continuar?")) return;

        setLoading(true);
        setRestoreProgress("🚀 Sincronizando dados...");
        
        const res = await restoreFullSystemBackup(backupFile, options);
        
        if(res.success) { 
            playSound('success'); 
            setRestoreProgress("✅ Dados restaurados sem duplicatas!");
            setBackupFile(null);
            if (fileRef.current) fileRef.current.value = '';
        } else {
            playSound('error');
            setRestoreProgress(`❌ Erro: ${res.message}`);
        }
        setLoading(false);
    };

    const toggleOption = (key: keyof RestoreOptions) => {
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
        playSound('click');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Cofre de Segurança</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Backup e Restauro Inteligente</p>
                </div>
                <Badge color="red" className="px-4 py-1.5 font-black uppercase text-[10px]">Zona de Risco</Badge>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                <Card className="p-8 border-emerald-100 shadow-sm flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                        <Download size={40} />
                    </div>
                    <h3 className="text-xl font-black text-gray-800 mb-2">Exportar snapshot</h3>
                    <p className="text-sm text-gray-400 mb-8">Baixa todos os dados criados no software até agora em um arquivo protegido.</p>
                    <Button onClick={handleBackup} disabled={loading} className="w-full py-4 bg-emerald-600 shadow-lg shadow-emerald-100">
                        {loading ? <Loader2 className="animate-spin" /> : "Gerar Backup Total"}
                    </Button>
                </Card>

                <Card className="p-8 border-blue-100 shadow-sm flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                        <UploadCloud size={40} />
                    </div>
                    <h3 className="text-xl font-black text-gray-800 mb-2">Restaurar itens</h3>
                    <p className="text-sm text-gray-400 mb-8">Sobe um arquivo de backup e escolhe quais grupos de dados deseja recuperar.</p>
                    <Button onClick={() => fileRef.current?.click()} disabled={loading} variant="outline" className="w-full py-4 border-blue-600 text-blue-600 border-2 font-black">
                        Selecionar Arquivo
                    </Button>
                    <input type="file" ref={fileRef} className="hidden" accept=".json" onChange={handleFileSelect}/>
                </Card>
            </div>

            {backupFile && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <Card className="w-full max-w-2xl p-0 overflow-hidden shadow-2xl border-4 border-emerald-500 animate-scale-in">
                        <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-emerald-500" size={32}/>
                                <div>
                                    <h3 className="font-black text-gray-800 text-lg">Configurar Restauro Inteligente</h3>
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Arquivo gerado em: {new Date(backupFile.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                            <button onClick={() => setBackupFile(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X/></button>
                        </div>

                        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest bg-gray-100 p-3 rounded-xl border border-dashed text-center">
                                O restauro não criará itens duplicados. IDs existentes serão apenas atualizados.
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <RestoreOptionToggle 
                                    label="Marketing & Visual" 
                                    count={(backupFile.data.carousel_slides?.length || 0) + (backupFile.data.partners?.length || 0)} 
                                    icon={<ImageIcon size={16}/>} 
                                    active={options.config} 
                                    onClick={() => toggleOption('config')} 
                                />
                                <RestoreOptionToggle 
                                    label="Diretório de Usuários" 
                                    count={backupFile.data.profiles?.length || 0} 
                                    icon={<Users size={16}/>} 
                                    active={options.users} 
                                    onClick={() => toggleOption('users')} 
                                />
                                <RestoreOptionToggle 
                                    label="Parceiros (Farmácias)" 
                                    count={backupFile.data.pharmacies?.length || 0} 
                                    icon={<Store size={16}/>} 
                                    active={options.pharmacies} 
                                    onClick={() => toggleOption('pharmacies')} 
                                />
                                <RestoreOptionToggle 
                                    label="Catálogo Mestre" 
                                    count={backupFile.data.global_products?.length || 0} 
                                    icon={<Database size={16}/>} 
                                    active={options.catalog} 
                                    onClick={() => toggleOption('catalog')} 
                                />
                                <RestoreOptionToggle 
                                    label="Stock das Lojas" 
                                    count={backupFile.data.products?.length || 0} 
                                    icon={<ShieldCheck size={16}/>} 
                                    active={options.inventory} 
                                    onClick={() => toggleOption('inventory')} 
                                />
                                <RestoreOptionToggle 
                                    label="Histórico de Vendas" 
                                    count={backupFile.data.orders?.length || 0} 
                                    icon={<ShoppingBag size={16}/>} 
                                    active={options.orders} 
                                    onClick={() => toggleOption('orders')} 
                                />
                                <RestoreOptionToggle 
                                    label="Receitas & Cotações" 
                                    count={(backupFile.data.prescriptions?.length || 0) + (backupFile.data.prescription_quotes?.length || 0)} 
                                    icon={<FileText size={16}/>} 
                                    active={options.prescriptions} 
                                    onClick={() => toggleOption('prescriptions')} 
                                />
                                <RestoreOptionToggle 
                                    label="SAC & Notificações" 
                                    count={(backupFile.data.support_tickets?.length || 0) + (backupFile.data.notifications?.length || 0)} 
                                    icon={<MessageSquare size={16}/>} 
                                    active={options.support} 
                                    onClick={() => toggleOption('support')} 
                                />
                            </div>

                            <div className="pt-6 border-t flex flex-col gap-4">
                                <Button onClick={handleConfirmRestore} disabled={loading} className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-lg shadow-xl shadow-emerald-200">
                                    {loading ? <Loader2 className="animate-spin mr-2"/> : <CheckCircle2 size={24} className="mr-2"/>}
                                    Confirmar Injeção de Dados
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {restoreProgress && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] w-full max-w-sm">
                    <div className="bg-gray-900 p-5 rounded-2xl text-white font-mono text-xs flex items-center justify-between shadow-2xl border border-gray-700 animate-slide-in-bottom">
                        <span className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                            {restoreProgress}
                        </span>
                        <button onClick={() => setRestoreProgress(null)} className="text-gray-500 hover:text-white p-1 hover:bg-gray-800 rounded"><X size={16}/></button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Componente Interno de Toggle
const RestoreOptionToggle = ({ label, count, icon, active, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 bg-white opacity-60 hover:opacity-100'}`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl transition-colors ${active ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
                {icon}
            </div>
            <div>
                <p className={`text-[11px] font-black uppercase tracking-tight ${active ? 'text-emerald-900' : 'text-gray-400'}`}>{label}</p>
                <p className="text-[9px] text-gray-400 font-bold">{count} registros identificados</p>
            </div>
        </div>
        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${active ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'border-gray-200'}`}>
            {active && <CheckCircle2 size={14}/>}
        </div>
    </div>
);

