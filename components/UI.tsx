
import React, { useState, useEffect } from 'react';
import { playSound } from '../services/soundService';
import { X, CheckCircle, AlertCircle, Info, Loader2, Eye, EyeOff } from 'lucide-react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'danger' }> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  onClick,
  ...props 
}) => {
  const baseStyles = "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg",
    secondary: "bg-emerald-100 hover:bg-emerald-200 text-emerald-800",
    outline: "border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50",
    danger: "bg-red-500 hover:bg-red-600 text-white"
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      playSound('click');
      if (onClick) onClick(e);
  }

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} onClick={handleClick} {...props}>
      {children}
    </button>
  );
};

export const LoadingOverlay = () => (
    <div className="fixed inset-0 z-[9999] bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center animate-fade-in">
        <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-[10px] font-black text-emerald-800 uppercase tracking-[0.3em] animate-pulse">Processando Operação...</p>
    </div>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { title?: string }> = ({ children, className = '', title, ...props }) => (
  <div className={`bg-white/95 rounded-2xl shadow-md border border-white/70 overflow-hidden backdrop-blur-sm ${className}`} {...props}>
    {title && <div className="px-6 py-4 border-b border-gray-100/80 font-black text-lg text-gray-800 tracking-tight">{title}</div>}
    <div className="p-6 text-gray-800">
      {children}
    </div>
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode, color?: 'green' | 'blue' | 'yellow' | 'red' | 'gray', className?: string }> = ({ children, color = 'gray', className = '' }) => {
  const colors = {
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-800'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${colors[color]} ${className}`}>
      {children}
    </span>
  );
};

export const PasswordInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }> = ({ 
  icon,
  className = '',
  ...props 
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        {icon || null}
      </div>
      <input 
        type={showPassword ? "text" : "password"}
        className={`w-full pl-10 pr-12 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-gray-50 focus:bg-white ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        title={showPassword ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors group"
      >
        <div className="relative">
          {showPassword ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
          {/* Tooltip em português */}
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {showPassword ? "Ocultar" : "Mostrar"}
          </div>
        </div>
      </button>
    </div>
  );
};

type NumericInputValue = number | '' | null | undefined;
type NumericInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: NumericInputValue;
  onValueChange?: (value: number | '') => void;
  allowEmpty?: boolean;
  integer?: boolean;
};

const normalizeNumericInputValue = (value: NumericInputValue): string => {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  return String(value);
};

const parseNumericBound = (value: string | number | undefined): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onValueChange,
  allowEmpty = false,
  integer = false,
  min,
  max,
  onBlur,
  onFocus,
  ...props
}) => {
  const [draft, setDraft] = useState<string>(normalizeNumericInputValue(value));
  const [isFocused, setIsFocused] = useState(false);
  const minValue = parseNumericBound(min);
  const maxValue = parseNumericBound(max);

  useEffect(() => {
    if (!isFocused) {
      setDraft(normalizeNumericInputValue(value));
    }
  }, [value, isFocused]);

  const clampValue = (raw: number) => {
    let next = integer ? Math.trunc(raw) : raw;
    if (typeof minValue === 'number') next = Math.max(minValue, next);
    if (typeof maxValue === 'number') next = Math.min(maxValue, next);
    return next;
  };

  const parseRaw = (raw: string): number | '' => {
    if (raw === '') return '';
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) return '';
    return clampValue(parsed);
  };

  const commitDraft = (raw: string) => {
    const parsed = parseRaw(raw);
    if (parsed === '') {
      if (allowEmpty) {
        setDraft('');
        onValueChange?.('');
        return;
      }
      const currentParsed = parseRaw(normalizeNumericInputValue(value));
      const fallback = currentParsed === '' ? (typeof minValue === 'number' ? minValue : 0) : currentParsed;
      setDraft(String(fallback));
      onValueChange?.(fallback);
      return;
    }

    setDraft(String(parsed));
    onValueChange?.(parsed);
  };

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      value={draft}
      onFocus={(e) => {
        setIsFocused(true);
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseRaw(raw);
        if (parsed !== '') {
          onValueChange?.(parsed);
        } else if (raw === '' && allowEmpty) {
          onValueChange?.('');
        }
      }}
      onBlur={(e) => {
        setIsFocused(false);
        commitDraft(e.target.value);
        onBlur?.(e);
      }}
    />
  );
};

export const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const styles = {
        success: "bg-emerald-600 text-white",
        error: "bg-red-600 text-white",
        info: "bg-blue-600 text-white"
    };

    const icons = {
        success: <CheckCircle size={18} />,
        error: <AlertCircle size={18} />,
        info: <Info size={18} />
    };

    return (
        <div className={`fixed bottom-5 right-4 z-[9999] p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slide-in-right ${styles[type]}`}>
            {icons[type]}
            <span className="text-sm font-bold pr-4 border-r border-white/20">{message}</span>
            <button onClick={onClose} className="hover:scale-110 transition-transform"><X size={16}/></button>
        </div>
    );
}
