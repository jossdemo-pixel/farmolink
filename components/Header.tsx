
import React from 'react';
import { FileStack, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 no-print">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-600 p-2 rounded-lg text-white">
            <FileStack className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">FarmoRelato</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide">ANGOLA • ACADÉMICO</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full text-sm font-medium border border-emerald-100">
            <ShieldCheck className="w-4 h-4" />
            <span>Verificação APA 6ª Ed.</span>
          </div>
        </div>
      </div>
    </header>
  );
};
