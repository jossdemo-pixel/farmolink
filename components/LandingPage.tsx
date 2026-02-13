
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './Layout';
import { Button } from './UI';
import { CarouselSlide, Partner } from '../types';
import { ArrowRight, ChevronLeft, ChevronRight, Upload, Search, MapPin, Loader2, Pill } from 'lucide-react';
import { fetchLandingContent } from '../services/dataService';

interface LandingPageProps {
    onLoginClick: () => void;
    onNavigate: (page: string) => void;
}

const DEFAULT_SLIDES: CarouselSlide[] = [
    {
        id: 'default-1',
        title: 'A maior rede de farmácias online de Angola',
        subtitle: 'Compare preços, envie receitas e receba seus medicamentos no conforto de casa.',
        imageUrl: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?q=80&w=2070&auto=format&fit=crop',
        buttonText: 'Começar Agora',
        order: 1
    },
    {
        id: 'default-2',
        title: 'Envie sua Receita Médica',
        subtitle: 'Tire uma foto e receba orçamentos de várias farmácias em Luanda e outras províncias.',
        imageUrl: 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=2070&auto=format&fit=crop',
        buttonText: 'Enviar Receita',
        order: 2
    }
];

export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onNavigate }) => {
    const [slides, setSlides] = useState<CarouselSlide[]>(DEFAULT_SLIDES);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const timeoutRef = useRef<any>(null);

    useEffect(() => {
        const loadContent = async () => {
            setLoading(true);
            try {
                const content = await fetchLandingContent();
                if (content.slides && content.slides.length > 0) {
                    setSlides(content.slides);
                }
                setPartners(content.partners || []);
            } catch (e) {
                console.error("Erro ao carregar conteúdo dinâmico:", e);
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, []);

    const resetTimeout = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }

    useEffect(() => {
        if (isPaused || slides.length <= 1) return;
        resetTimeout();
        timeoutRef.current = setTimeout(() => {
            setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
        }, 8000); 

        return () => resetTimeout();
    }, [currentSlide, isPaused, slides.length]);

    const nextSlide = () => {
        setCurrentSlide(currentSlide === slides.length - 1 ? 0 : currentSlide + 1);
    }

    const prevSlide = () => {
        setCurrentSlide(currentSlide === 0 ? slides.length - 1 : currentSlide - 1);
    }

    return (
        <div className="font-sans text-gray-900 bg-white min-h-screen">
            <Header 
                currentPage="landing" 
                setPage={() => {}} 
                onLoginClick={onLoginClick}
            />

            <div 
                className="relative h-[500px] md:h-[650px] w-full overflow-hidden bg-gray-900 text-white mt-[64px]"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
            >
                <div 
                    className="flex transition-transform duration-1000 ease-in-out h-full"
                    style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                >
                    {slides.map((slide) => (
                        <div key={slide.id} className="min-w-full h-full relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-10"></div>
                            <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                            
                            <div className="absolute inset-0 z-20 flex items-center container mx-auto px-6 md:px-12">
                                <div className="max-w-2xl text-left space-y-6 animate-fade-in">
                                    <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.1] drop-shadow-lg">
                                        {slide.title}
                                    </h2>
                                    <p className="text-lg md:text-xl text-gray-200 opacity-90 font-medium max-w-xl">
                                        {slide.subtitle}
                                    </p>
                                    <div className="pt-4">
                                        <button 
                                            onClick={onLoginClick}
                                            className="px-10 py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[24px] font-black text-lg shadow-2xl shadow-emerald-500/30 transition-all transform hover:-translate-y-1 flex items-center gap-3 active:scale-95"
                                        >
                                            {slide.buttonText} <ArrowRight size={22}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* CONTROLES DISCRETOS E FLUTUANTES NA BASE - REDESIGN */}
                {slides.length > 1 && (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-6 bg-black/30 backdrop-blur-xl px-8 py-3.5 rounded-full border border-white/20 shadow-2xl">
                        <button onClick={prevSlide} className="text-white/50 hover:text-white transition-all hover:scale-110 active:scale-90">
                            <ChevronLeft size={24}/>
                        </button>
                        
                        <div className="flex gap-2.5">
                            {slides.map((_, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => setCurrentSlide(idx)}
                                    className={`h-2.5 rounded-full transition-all duration-500 ${currentSlide === idx ? 'w-10 bg-emerald-400' : 'w-2.5 bg-white/20 hover:bg-white/40'}`}
                                />
                            ))}
                        </div>

                        <button onClick={nextSlide} className="text-white/50 hover:text-white transition-all hover:scale-110 active:scale-90">
                            <ChevronRight size={24}/>
                        </button>
                    </div>
                )}
            </div>

            <section className="py-24 bg-gray-50">
                <div className="container mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <span className="text-emerald-600 font-black uppercase tracking-[0.3em] text-xs">Ecosistema FarmoLink</span>
                        <h2 className="text-3xl md:text-5xl font-black text-gray-900 mt-4 tracking-tighter">Sua saúde, nossa prioridade digital.</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[20px] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><Search size={32}/></div>
                            <h3 className="text-xl font-black text-gray-800 mb-3">Busca Inteligente</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">Compare estoques e preços de todas as farmácias parceiras em segundos.</p>
                        </div>
                        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[20px] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><Upload size={32}/></div>
                            <h3 className="text-xl font-black text-gray-800 mb-3">Receitas Digitais</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">Envie fotos de suas prescrições e receba propostas personalizadas para seu tratamento.</p>
                        </div>
                        <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                            <div className="w-16 h-16 bg-orange-50 text-orange-600 rounded-[20px] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform"><MapPin size={32}/></div>
                            <h3 className="text-xl font-black text-gray-800 mb-3">Delivery Rápido</h3>
                            <p className="text-gray-500 text-sm leading-relaxed">Entregas seguras em Luanda e arredores, com rastreamento em tempo real.</p>
                        </div>
                    </div>
                </div>
            </section>

            {partners.length > 0 && (
                <section className="py-16 bg-white border-t border-gray-50">
                    <div className="container mx-auto px-6">
                        <p className="text-center text-[10px] font-black text-gray-300 uppercase tracking-[0.5em] mb-12">Algumas das maiores farmácias de Angola já estão aqui</p>
                        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700">
                            {partners.filter(p => p.active).map(p => (
                                <img key={p.id} src={p.logoUrl} alt={p.name} className="h-10 md:h-14 object-contain" />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <footer className="bg-white border-t border-gray-100 py-12 text-center">
                <div className="flex justify-center items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center p-1.5 shadow-lg">
                        <img src="https://res.cloudinary.com/dzvusz0u4/image/upload/v1765977310/wrzwildc1kqsq5skklio.png" className="w-full h-full object-contain brightness-0 invert" alt="Logo" />
                    </div>
                    <span className="font-black text-xl text-gray-800 tracking-tighter">FarmoLink Angola</span>
                </div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">&copy; {new Date().getFullYear()} FarmoLink. Tecnologia a favor da sua saúde.</p>
                <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                    <button onClick={() => onNavigate('privacy-policy')} className="text-gray-500 hover:text-emerald-700 font-semibold">
                        Politica de Privacidade e Termos de Uso
                    </button>
                </div>
            </footer>
        </div>
    );
};


