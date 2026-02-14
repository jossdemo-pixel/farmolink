
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Camera, Send, BrainCircuit, Sparkles, ShieldCheck, ChevronRight, ArrowLeft, Loader2, X, Check, MessageSquare, AlertTriangle, Truck, Store, MapPin, Activity, Info } from 'lucide-react';
import { Pharmacy, User, Product } from '../types';
import { Button, Card } from '../components/UI';
import { createPrescriptionRequest } from '../services/orderService';
import { analyzePrescriptionVision } from '../services/geminiService';
import { playSound } from '../services/soundService';
import { uploadImageToCloudinary } from '../services/cloudinaryService';

const MedicalDisclaimer = ({ method }: { method: 'MANUAL' | 'AI' | null }) => {
    if (method === 'AI') {
        return (
            <div className="mt-8 p-6 bg-blue-50 rounded-[32px] border border-blue-100 animate-fade-in">
                <div className="flex gap-4 items-start">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg">
                        <BrainCircuit size={20} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-[11px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-2">
                            Assistente de Receitas IA <Sparkles size={12} className="text-blue-500"/>
                        </p>
                        <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                            A IA apenas transcreve o texto para facilitar. <strong>A validaÃ§Ã£o final Ã© sempre do farmacÃªutico.</strong>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-8 p-6 bg-gray-50 rounded-[32px] border border-gray-200">
            <div className="flex gap-4 items-start">
                <div className="p-2 bg-gray-400 text-white rounded-xl">
                    <ShieldCheck size={20} />
                </div>
                <div className="space-y-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">SeguranÃ§a Garantida</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                        As farmÃ¡cias parceiras sÃ³ entregam medicamentos se apresentares a receita original fÃ­sica no ato da entrega ou levantamento. O FarmoLink serve para reservares e saberes os preÃ§os primeiro.
                    </p>
                </div>
            </div>
        </div>
    );
};

export const PrescriptionUploadView = ({ pharmacies, user, onNavigate }: { pharmacies: Pharmacy[], user: User, onNavigate: (page: string) => void, onAddToCart: (p: Product) => void }) => {
  const [method, setMethod] = useState<'MANUAL' | 'AI' | null>(null);
  const [step, setStep] = useState<'CHOOSE' | 'UPLOAD' | 'PROCESSING' | 'CONFIRM'>('CHOOSE');
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [selectedPharmacies, setSelectedPharmacies] = useState<string[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [userNotes, setUserNotes] = useState('');
  
  // NOVO: Estado de preferÃªncia de entrega
  const [deliveryType, setDeliveryType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedPharmacies = useMemo(() => {
    return pharmacies
      .filter(p => p.status === 'APPROVED' && p.isAvailable)
      .sort((a, b) => {
        const aDeliveryPenalty = deliveryType === 'DELIVERY' && !a.deliveryActive ? 1 : 0;
        const bDeliveryPenalty = deliveryType === 'DELIVERY' && !b.deliveryActive ? 1 : 0;
        if (aDeliveryPenalty !== bDeliveryPenalty) return aDeliveryPenalty - bDeliveryPenalty;
        if (typeof a.distanceKm === 'number' && typeof b.distanceKm === 'number') return a.distanceKm - b.distanceKm;
        return (b.review_score || b.rating || 0) - (a.review_score || a.rating || 0);
      });
  }, [pharmacies, deliveryType]);

  const recommendedTargets = useMemo(() => {
    if (sortedPharmacies.length === 0) return [];
    return [sortedPharmacies[0].id];
  }, [sortedPharmacies]);

  useEffect(() => {
    if (step === 'CONFIRM' && selectedPharmacies.length === 0 && recommendedTargets.length > 0) {
      setSelectedPharmacies(recommendedTargets);
    }
  }, [step, selectedPharmacies.length, recommendedTargets]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!navigator.onLine) {
        alert("Sem internet. Envio de receita indisponivel offline.");
        return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);
    setLocalPreview(blobUrl);
    setStep('PROCESSING');
    playSound('click');
    
    try {
        const url = await uploadImageToCloudinary(file as any);
        if (!url) throw new Error("Upload falhou");
        setRemoteUrl(url);

        if (method === 'AI') {
            const analysis = await analyzePrescriptionVision(url);
            setAiAnalysis(analysis);
        }

        setStep('CONFIRM');
        playSound('success');
    } catch (err) {
        alert("NÃ£o consegui carregar a foto. Verifica a tua internet.");
        setStep('UPLOAD');
    }
  };

  const handleFinalSend = async () => {
      if (!navigator.onLine) {
          alert("Sem internet. Nao foi possivel enviar a receita.");
          return;
      }
      // Validacao final: apenas 1 farmacia por envio.
      let targets = [...selectedPharmacies].slice(0, 1);
      if (targets.length === 0) {
          targets = recommendedTargets;
          
          if (targets.length === 0) {
              alert("NÃ£o hÃ¡ farmÃ¡cias disponÃ­veis no momento.");
              return;
          }
      }

      const selectedPharmacy = pharmacies.find(p => p.id === targets[0]);
      if (deliveryType === 'DELIVERY' && selectedPharmacy && !selectedPharmacy.deliveryActive) {
          alert("A farmÃ¡cia selecionada nÃ£o tem entrega ativa. Mude para 'Vou Buscar (Loja)' ou escolha outra farmÃ¡cia.");
          return;
      }

      if (!remoteUrl) {
          alert("Erro na imagem. Tente novamente.");
          return;
      }
      
      setIsSending(true);

      const deliveryTag = deliveryType === 'DELIVERY' ? "[ENTREGA AO DOMICÃLIO]" : "[VOU BUSCAR NA LOJA]";
      
      // ConstrÃ³i a nota final com a preferÃªncia
      const finalNotes = `${deliveryTag} ${userNotes.trim() ? `Obs: ${userNotes}` : (method === 'MANUAL' ? "Aguardo orÃ§amento." : "Pedido com Ajuda IA")}`;

      const result = await createPrescriptionRequest(
          user.id, 
          remoteUrl, 
          targets, 
          finalNotes,
          aiAnalysis
      );

      if (result.success) {
          playSound('save');
          onNavigate('prescriptions');
      } else {
          alert(result.error || "Algo correu mal. Tenta de novo.");
      }
      setIsSending(false);
  };

  const togglePharmacy = (id: string) => {
      const pharmacy = pharmacies.find(p => p.id === id);
      if (deliveryType === 'DELIVERY' && pharmacy && !pharmacy.deliveryActive) {
          alert("Esta farmÃ¡cia nÃ£o estÃ¡ com entrega ativa. Escolha outra ou mude para retirada em loja.");
          return;
      }
      setSelectedPharmacies(prev => (prev[0] === id ? [] : [id]));
      playSound('click');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-24 px-4">
      
      {step === 'CHOOSE' && (
          <div className="space-y-10 py-10 animate-fade-in">
              <div className="text-center space-y-4">
                  <h1 className="text-4xl font-black text-gray-800 tracking-tighter">Como queres mandar a receita?</h1>
                  <p className="text-gray-500 max-w-lg mx-auto font-medium">Escolhe a forma mais rÃ¡pida de pedir anÃ¡lise e receber resposta de uma farmÃ¡cia por vez.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <div 
                    onClick={() => { setMethod('MANUAL'); setStep('UPLOAD'); }}
                    className="bg-white p-8 rounded-[48px] border-4 border-transparent hover:border-emerald-500 shadow-xl cursor-pointer transition-all hover:scale-105 group relative overflow-hidden"
                  >
                      <div className="absolute top-6 right-6 bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Mais Seguro</div>
                      <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[28px] flex items-center justify-center mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                          <Camera size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-gray-800 mb-2">Mandar Direto</h3>
                      <p className="text-sm text-gray-500 font-medium leading-relaxed">Tu escolhes as farmÃ¡cias e elas respondem com os preÃ§os delas.</p>
                      <div className="mt-8 flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest">Tirar Foto <ChevronRight size={16}/></div>
                  </div>

                  <div 
                    onClick={() => { setMethod('AI'); setStep('UPLOAD'); }}
                    className="bg-white p-8 rounded-[48px] border-4 border-transparent hover:border-blue-500 shadow-xl cursor-pointer transition-all hover:scale-105 group relative overflow-hidden"
                  >
                      <div className="absolute top-6 right-6 bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Super RÃ¡pido</div>
                      <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-[28px] flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <BrainCircuit size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-gray-800 mb-2">Scan Inteligente</h3>
                      <p className="text-sm text-gray-500 font-medium leading-relaxed">A nossa IA lÃª a letra do mÃ©dico e acelera o pedido para a farmÃ¡cia que escolheres.</p>
                      <div className="mt-8 flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest">Analisar com IA <Sparkles size={16}/></div>
                  </div>
              </div>
          </div>
      )}

      {step === 'UPLOAD' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
             <button onClick={() => setStep('CHOOSE')} className="flex items-center gap-2 text-gray-400 font-bold text-xs uppercase hover:text-emerald-600 transition-colors">
                 <ArrowLeft size={16}/> Voltar
             </button>
             <Card 
                className={`p-20 text-center border-4 border-dashed cursor-pointer hover:bg-gray-50 transition-all rounded-[60px] group shadow-inner ${method === 'AI' ? 'border-blue-100' : 'border-emerald-100'}`}
                onClick={() => fileInputRef.current?.click()}
             >
                <div className={`w-24 h-24 rounded-[30px] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform ${method === 'AI' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {method === 'AI' ? <BrainCircuit size={48}/> : <Camera size={48} />}
                </div>
                <h3 className="text-2xl font-black text-gray-800 mb-2">Anexar Receita</h3>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">CÃ¢mera ou Galeria</p>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </Card>
          </div>
      )}

      {step === 'PROCESSING' && (
          <div className="text-center py-32 animate-fade-in space-y-6">
              <div className={`w-24 h-24 border-8 rounded-full animate-spin mx-auto shadow-inner ${method === 'AI' ? 'border-blue-100 border-t-blue-600' : 'border-emerald-100 border-t-emerald-600'}`}></div>
              <div>
                  <h2 className="text-2xl font-black text-gray-800">{method === 'AI' ? 'IA estÃ¡ a ler a letra...' : 'A carregar a foto...'}</h2>
                  <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2">SÃ³ mais um bocado</p>
              </div>
          </div>
      )}

      {step === 'CONFIRM' && (
          <div className="grid lg:grid-cols-12 gap-8 animate-scale-in">
              <div className="lg:col-span-5 space-y-4">
                  <Card className="p-0 overflow-hidden rounded-[48px] shadow-2xl border-none bg-black">
                      <div className="relative w-full aspect-[3/4] max-h-[600px] flex items-center justify-center">
                          <img 
                            src={localPreview || remoteUrl || ''} 
                            className="w-full h-full object-contain opacity-90" 
                            alt="Receita" 
                          />
                      </div>
                      <div className="p-5 bg-black/60 backdrop-blur-md flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <ShieldCheck className="text-emerald-400" size={20}/>
                              <span className="text-[10px] text-white font-black uppercase tracking-widest">Foto Carregada</span>
                          </div>
                          <button onClick={() => setStep('UPLOAD')} className="text-white/60 hover:text-white p-2 rounded-xl bg-white/10 transition-colors"><X size={18}/></button>
                      </div>
                  </Card>
              </div>

              <div className="lg:col-span-7 space-y-6">
                  {method === 'AI' && aiAnalysis && (
                      <div className="bg-blue-600 p-8 rounded-[40px] text-white shadow-xl animate-slide-in-right relative overflow-hidden">
                          <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="text-xl font-black flex items-center gap-2"><BrainCircuit/> IA Identificou:</h4>
                            </div>

                            {/* AVISO LEGAL ESTÃTICO (TEXTO AJUSTADO) */}
                            
                            <div className="bg-white/10 border border-white/20 p-4 rounded-2xl mb-6 flex items-start gap-3">
                                <div className="p-2 bg-yellow-400 text-yellow-900 rounded-lg shrink-0">
                                    <Info size={16}/>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-yellow-200 mb-1">Aviso Importante</p>
                                    <p className="text-xs font-medium leading-tight">
                                        A avaliaÃ§Ã£o com IA nÃ£o Ã© 100% eficaz e nunca deve substituir um farmacÃªutico.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {aiAnalysis.suggested_items?.map((it: any, i: number) => (
                                    <div key={i} className="bg-white/10 p-3 rounded-xl flex justify-between border border-white/10">
                                        <span className="font-bold">{it.name}</span>
                                        <span className="font-black opacity-60">{it.quantity}un</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 p-3 bg-blue-800/30 rounded-xl flex items-center gap-2 border border-blue-500/30">
                                <ShieldCheck size={14} className="text-blue-300 shrink-0"/>
                                <p className="text-[9px] font-black uppercase text-blue-200">As farmÃ¡cias confirmarÃ£o o stock real</p>
                            </div>
                          </div>
                          <Sparkles className="absolute -right-6 -bottom-6 text-white/5 w-32 h-32" />
                      </div>
                  )}

                  <Card className="p-8 rounded-[40px] border-gray-100 shadow-sm space-y-6">
                      
                      {/* NOVO SELETOR DE PREFERÃŠNCIA DE ENTREGA */}
                      <div>
                          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                              <Truck size={14} className="text-emerald-500"/> Como prefere receber?
                          </h5>
                          <div className="flex gap-3">
                              <button 
                                onClick={() => { setDeliveryType('DELIVERY'); playSound('click'); }}
                                className={`flex-1 py-4 px-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${deliveryType === 'DELIVERY' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-100 bg-white text-gray-400'}`}
                              >
                                  <Truck size={24}/>
                                  <span className="text-[10px] font-black uppercase">Entrega em Casa</span>
                              </button>
                              <button 
                                onClick={() => { setDeliveryType('PICKUP'); playSound('click'); }}
                                className={`flex-1 py-4 px-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${deliveryType === 'PICKUP' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-100 bg-white text-gray-400'}`}
                              >
                                  <Store size={24}/>
                                  <span className="text-[10px] font-black uppercase">Vou Buscar (Loja)</span>
                              </button>
                          </div>
                          {deliveryType === 'DELIVERY' && (
                              <p className="text-[9px] font-bold text-emerald-600 mt-2 text-center bg-emerald-50 py-2 rounded-lg">
                                  Nota: Algumas farmÃ¡cias podem nÃ£o ter serviÃ§o de entrega ativo.
                              </p>
                          )}
                      </div>

                      <div className="border-t border-gray-100 pt-6">
                          <div className="flex justify-between items-center mb-6">
                              <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Farmacia de Destino</h5>
                              <span className={`text-[10px] px-3 py-1 rounded-full font-black ${method === 'AI' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {selectedPharmacies.length > 0 ? '1' : 'AUTO-1'} SELECIONADA
                              </span>
                          </div>
                          <p className="text-[10px] text-gray-500 font-semibold mb-4">
                              Para evitar pedidos em massa, cada receita e enviada para apenas uma farmacia por vez.
                          </p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-2 mb-6">
                              {sortedPharmacies.map((p, index) => {
                                  // Verifica se hÃ¡ conflito de entrega
                                  const deliveryConflict = deliveryType === 'DELIVERY' && !p.deliveryActive;
                                  
                                  return (
                                      <div 
                                        key={p.id}
                                        onClick={() => togglePharmacy(p.id)}
                                        className={`p-4 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${selectedPharmacies.includes(p.id) ? (method === 'AI' ? 'bg-blue-50 border-blue-500 shadow-md scale-[1.02]' : 'bg-emerald-50 border-emerald-500 shadow-md scale-[1.02]') : 'bg-white border-gray-100 hover:border-gray-200'}`}
                                      >
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${selectedPharmacies.includes(p.id) ? (method === 'AI' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white') : 'bg-gray-100 text-gray-400'}`}>
                                                  {p.name.charAt(0)}
                                              </div>
                                              <div className="min-w-0">
                                                  <p className="text-[11px] font-black text-gray-800 truncate">{p.name}</p>
                                                  {index === 0 && (
                                                      <span className="text-[8px] font-bold text-blue-700 uppercase bg-blue-50 px-1 rounded w-fit">Recomendada</span>
                                                  )}
                                                  {typeof p.distanceKm === 'number' && (
                                                      <p className="text-[9px] text-gray-500 font-bold">A {p.distanceKm.toFixed(1)} km</p>
                                                  )}
                                                  {deliveryConflict && (
                                                      <span className="text-[8px] font-bold text-red-500 flex items-center gap-1 uppercase bg-red-50 px-1 rounded w-fit">
                                                          <X size={8}/> Sem Entrega
                                                      </span>
                                                  )}
                                              </div>
                                          </div>
                                          {selectedPharmacies.includes(p.id) ? <div className={`p-1 rounded-full text-white ${method === 'AI' ? 'bg-blue-500' : 'bg-emerald-500'}`}><Check size={12}/></div> : <div className="w-5 h-5 rounded-full border-2 border-gray-100"></div>}
                                      </div>
                                  );
                              })}
                              {sortedPharmacies.length === 0 && (
                                  <div className="col-span-full p-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-center">
                                      <p className="text-[10px] font-bold text-gray-500 uppercase">Nenhuma farmacia disponivel no momento</p>
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                          <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <MessageSquare size={14} /> ObservaÃ§Ãµes Adicionais
                          </h5>
                          <textarea
                              className="w-full p-3 bg-white border-none rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-100 h-20 resize-none text-gray-700"
                              placeholder="Ex: Tenho preferÃªncia por genÃ©ricos. / JÃ¡ tenho o Paracetamol."
                              value={userNotes}
                              onChange={e => setUserNotes(e.target.value)}
                          />
                      </div>
                  </Card>

                  <div className="pt-2">
                      <Button 
                        onClick={handleFinalSend} 
                        disabled={isSending} 
                        className={`w-full py-6 rounded-[32px] font-black text-xl shadow-2xl active:scale-95 transition-all text-white ${method === 'AI' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}
                      >
                          {isSending ? <Loader2 className="animate-spin mr-2" /> : <Send size={24} className="mr-2"/>}
                          {method === 'AI' ? 'PEDIR ORÃ‡AMENTO' : 'ENVIAR PEDIDO AGORA'}
                      </Button>
                  </div>
              </div>
          </div>
      )}

      <MedicalDisclaimer method={method} />
    </div>
  );
};
