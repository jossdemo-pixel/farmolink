import React, { useEffect, useState } from 'react';
import { Info, HelpCircle, MessageCircle, CheckCircle, Shield, Heart, Zap, Globe, FileText, Lock } from 'lucide-react';
import { Card, Button } from '../components/UI';
import { fetchLegalContent, openSupportWhatsApp, DEFAULT_PRIVACY_POLICY_TEXT, DEFAULT_TERMS_OF_USE_TEXT, DEFAULT_LEGAL_UPDATED_AT } from '../services/dataService';

interface PublicInfoViewsProps {
  onNavigate: (page: string) => void;
}

const formatLegalDate = (dateIso: string) => {
  if (!dateIso) return DEFAULT_LEGAL_UPDATED_AT;
  const [year, month, day] = dateIso.split('-');
  if (!year || !month || !day) return dateIso;
  return `${day}/${month}/${year}`;
};

export const AboutView: React.FC<PublicInfoViewsProps> = ({ onNavigate }) => {
  const handleWhatsAppContact = async () => {
    const ok = await openSupportWhatsApp('Ola! Tenho uma duvida sobre a FarmoLink.');
    if (!ok) onNavigate('support');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 font-sans animate-fade-in">
      <div className="max-w-4xl mx-auto">
        
        {/* CABEÇALHO CENTRALIZADO */}
        <div className="text-center mb-12">
          <div className="bg-emerald-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
            <Info size={40} />
          </div>
          <h1 className="text-4xl font-black text-gray-800 mb-2 tracking-tight">FarmoLink Angola</h1>
          <p className="text-lg text-gray-600 font-medium">Transformando o acesso à saúde em Angola</p>
        </div>

        {/* MISSÃO E INOVAÇÃO */}
        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <Card className="rounded-[40px] p-8 shadow-lg border-l-8 border-l-emerald-500">
            <h2 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2">
              <Globe className="text-emerald-600" size={24} />
              Nossa Missão
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Digitalizar o ecossistema farmacêutico angolano, proporcionando <strong>transparência de preços</strong> e <strong>conveniência</strong> para todos os utilizadores, de Luanda a Cabinda.
            </p>
          </Card>

          <Card className="rounded-[40px] p-8 shadow-lg border-l-8 border-l-blue-500">
            <h2 className="text-xl font-black text-gray-800 mb-4 flex items-center gap-2">
              <Zap className="text-blue-600" size={24} />
              Inovação Local
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Criado por angolanos para angolanos, entendemos os desafios logísticos e de literacia digital. Trabalhamos diretamente com farmacêuticos para oferecer soluções reais.
            </p>
          </Card>
        </div>

        {/* VALORES - GRELHA */}
        <div className="mb-10">
          <h2 className="text-2xl font-black text-gray-800 mb-6 text-center">Nossos Valores</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-[30px] p-6 shadow-md border border-gray-100 flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <CheckCircle className="text-emerald-600" size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-800 mb-2">Transparência</h3>
                <p className="text-sm text-gray-600">Preços reais das farmácias em tempo real, sem surpresas.</p>
              </div>
            </div>

            <div className="bg-white rounded-[30px] p-6 shadow-md border border-gray-100 flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <Shield className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-800 mb-2">Segurança</h3>
                <p className="text-sm text-gray-600">Dados protegidos conforme a Lei de Proteção de Dados de Angola (APD).</p>
              </div>
            </div>

            <div className="bg-white rounded-[30px] p-6 shadow-md border border-gray-100 flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <Heart className="text-red-600" size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-800 mb-2">Ética</h3>
                <p className="text-sm text-gray-600">Sempre exigimos a receita original para entrega de medicamentos.</p>
              </div>
            </div>

            <div className="bg-white rounded-[30px] p-6 shadow-md border border-gray-100 flex items-start gap-4">
              <div className="flex-shrink-0 mt-1">
                <Globe className="text-purple-600" size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-800 mb-2">Acessibilidade</h3>
                <p className="text-sm text-gray-600">Feito para funcionar em qualquer telemóvel com dados móveis.</p>
              </div>
            </div>
          </div>
        </div>

        {/* CONVITE PARA FARMÁCIAS */}
        <Card className="rounded-[40px] p-8 shadow-lg bg-gradient-to-r from-blue-50 to-blue-100 border-l-8 border-l-blue-600 mb-10">
          <h2 className="text-xl font-black text-blue-900 mb-3">És Farmácia?</h2>
          <p className="text-blue-800 leading-relaxed font-medium mb-4">
            Junta-te à rede FarmoLink e expande o teu negócio. Oferecemos uma plataforma simples para gerir o teu catálogo, receitas e entregas.
          </p>
          <Button 
            onClick={() => onNavigate('pharmacies-list')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold"
          >
            Saber Mais
          </Button>
        </Card>

        {/* BLOCO FINAL DE AJUDA */}
        <div className="bg-blue-600 rounded-[40px] p-8 text-white shadow-xl mb-8">
          <div className="flex items-start gap-4">
            <MessageCircle className="flex-shrink-0" size={32} />
            <div>
              <h3 className="text-xl font-black mb-2">Ainda tens dúvidas?</h3>
              <p className="text-blue-100 mb-4">Estamos disponíveis no WhatsApp para ajudar com qualquer pergunta.</p>
              <Button 
                onClick={handleWhatsAppContact}
                variant="outline"
                className="border-2 border-white text-white hover:bg-blue-700"
              >
                Contacte-nos
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============= FAQ VIEW =============

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: "Como compro na FarmoLink?",
    answer: "Podes pesquisar diretamente pelo nome do medicamento na tela inicial, ou tirar uma foto da tua receita médica. A IA analisará a receita e mostrará os medicamentos disponíveis nas farmácias mais próximas, com os respetivos preços."
  },
  {
    question: "Faz entregas?",
    answer: "Sim! Algumas farmácias têm entrega própria e outras permitem apenas levantamento em loja. Quando fazes a compra, a plataforma já indica se a farmácia faz entrega ou levantamento."
  },
  {
    question: "Precisa da receita física?",
    answer: "SIM. A entrega de medicamentos sujeitos a receita médica só será feita se entregares a receita original física ao estafeta. Isto é uma exigência legal em Angola e protege a tua saúde."
  },
  {
    question: "Como pago?",
    answer: "Diretamente à farmácia ou ao estafeta no ato da entrega. Aceitamos pagamento via TPA (Multicaixa), MCX Express ou dinheiro."
  },
  {
    question: "A IA pode errar a ler a receita?",
    answer: "Sim, a IA é apenas um assistente. O farmacêutico da farmácia fará sempre uma verificação manual da foto da receita antes de preparar a encomenda. A segurança é prioridade."
  },
  {
    question: "Os preços são iguais à loja?",
    answer: "Sim. As farmácias parceiras comprometem-se a praticar os mesmos preços que cobram no balcão físico. Sem surpresas."
  },
  {
    question: "Os meus dados estão seguros?",
    answer: "Sim. Todos os teus dados são criptografados e protegidos conforme a Lei de Proteção de Dados de Angola (APD). Usamos servidores seguros e não partilhamos informações pessoais com terceiros sem consentimento."
  },
  {
    question: "Posso devolver um medicamento?",
    answer: "Medicamentos só podem ser devolvidos se chegarem danificados ou com defeito. Contacta-nos imediatamente se isto acontecer e solucionaremos o problema."
  }
];

export const FAQView: React.FC<PublicInfoViewsProps> = ({ onNavigate }) => {
  const handleWhatsAppContact = async () => {
    const ok = await openSupportWhatsApp('Ola! Tenho uma pergunta sobre a FarmoLink.');
    if (!ok) onNavigate('support');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 font-sans animate-fade-in">
      <div className="max-w-3xl mx-auto">
        
        {/* CABEÇALHO */}
        <div className="text-center mb-12">
          <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
            <HelpCircle size={40} />
          </div>
          <h1 className="text-4xl font-black text-gray-800 mb-2 tracking-tight">Perguntas Frequentes (FAQ)</h1>
          <p className="text-lg text-gray-600 font-medium">Encontra respostas às dúvidas mais comuns</p>
        </div>

        {/* ACORDEÃO DE PERGUNTAS */}
        <div className="space-y-3 mb-10">
          {faqItems.map((item, index) => (
            <details 
              key={index}
              className="bg-white rounded-[25px] shadow-md border border-gray-100 group cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
            >
              <summary className="p-6 flex items-center justify-between font-black text-gray-800 select-none hover:bg-gray-50 transition-colors">
                <span className="flex-1 text-left">{item.question}</span>
                <svg 
                  className="w-6 h-6 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-700 leading-relaxed font-medium border-t border-gray-100 bg-gray-50">
                {item.answer}
              </div>
            </details>
          ))}
        </div>

        {/* BLOCO FINAL DE AJUDA */}
        <div className="bg-blue-600 rounded-[40px] p-8 text-white shadow-xl">
          <div className="flex items-start gap-4">
            <MessageCircle className="flex-shrink-0" size={32} />
            <div>
              <h3 className="text-xl font-black mb-2">Ainda tens dúvidas?</h3>
              <p className="text-blue-100 mb-4">Estamos disponíveis no WhatsApp para ajudar com qualquer pergunta ou situação não coberta por este FAQ.</p>
              <Button 
                onClick={handleWhatsAppContact}
                variant="outline"
                className="border-2 border-white text-white hover:bg-blue-700"
              >
                Contacte-nos
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TermsOfUseView: React.FC<PublicInfoViewsProps> = ({ onNavigate }) => {
  const [updatedAt, setUpdatedAt] = useState(DEFAULT_LEGAL_UPDATED_AT);

  useEffect(() => {
    const load = async () => {
      const legal = await fetchLegalContent();
      setUpdatedAt(legal.updatedAt || DEFAULT_LEGAL_UPDATED_AT);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 font-sans animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-700">
            <FileText size={28} />
          </div>
          <h1 className="text-3xl font-black text-gray-800">Termos de Uso</h1>
          <p className="text-sm text-gray-500 mt-2">Ultima atualizacao: {formatLegalDate(updatedAt)}</p>
        </div>

        <Card className="rounded-3xl p-8 border border-gray-100">
          <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
            <p>Os Termos de Uso agora estao incluidos dentro da Politica de Privacidade.</p>
            <p>Abra a Politica para ler o documento completo.</p>
          </div>
        </Card>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => onNavigate('privacy-policy')} variant="outline">Abrir Politica de Privacidade</Button>
          <Button onClick={() => onNavigate('home')}>Voltar</Button>
        </div>

        {/* FAQ DENTRO DE SOBRE NÓS */}
        <div className="mt-10 mb-8">
          <h2 className="text-2xl font-black text-gray-800 mb-6 text-center">Perguntas Frequentes</h2>
          <div className="space-y-3">
            {faqItems.map((item, index) => (
              <details
                key={index}
                className="bg-white rounded-[25px] shadow-md border border-gray-100 group cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
              >
                <summary className="p-6 flex items-center justify-between font-black text-gray-800 select-none hover:bg-gray-50 transition-colors">
                  <span className="flex-1 text-left">{item.question}</span>
                  <svg
                    className="w-6 h-6 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </summary>
                <div className="px-6 pb-6 text-gray-700 leading-relaxed font-medium border-t border-gray-100 bg-gray-50">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PrivacyPolicyView: React.FC<PublicInfoViewsProps> = ({ onNavigate }) => {
  const [privacyPolicy, setPrivacyPolicy] = useState(DEFAULT_PRIVACY_POLICY_TEXT);
  const [termsOfUse, setTermsOfUse] = useState(DEFAULT_TERMS_OF_USE_TEXT);
  const [updatedAt, setUpdatedAt] = useState(DEFAULT_LEGAL_UPDATED_AT);

  useEffect(() => {
    const load = async () => {
      const legal = await fetchLegalContent();
      setPrivacyPolicy(legal.privacyPolicy || DEFAULT_PRIVACY_POLICY_TEXT);
      setTermsOfUse(legal.termsOfUse || DEFAULT_TERMS_OF_USE_TEXT);
      setUpdatedAt(legal.updatedAt || DEFAULT_LEGAL_UPDATED_AT);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 font-sans animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-700">
            <Lock size={28} />
          </div>
          <h1 className="text-3xl font-black text-gray-800">Politica de Privacidade - FarmoLink</h1>
          <p className="text-sm text-gray-500 mt-2">Ultima atualizacao: {formatLegalDate(updatedAt)}</p>
        </div>

        <Card className="rounded-3xl p-8 border border-gray-100">
          <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="font-black text-gray-900 mb-2">Politica de Privacidade</h2>
              <div className="whitespace-pre-line">{privacyPolicy}</div>
            </section>
            <section className="pt-4 border-t border-gray-100">
              <h2 className="font-black text-gray-900 mb-2">Termos de Uso</h2>
              <div className="whitespace-pre-line">{termsOfUse}</div>
            </section>
          </div>
        </Card>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => onNavigate('home')}>Voltar</Button>
        </div>
      </div>
    </div>
  );
};
