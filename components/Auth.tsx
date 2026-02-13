
import React, { useEffect, useState } from 'react';
import { UserRole, User } from '../types';
import { signInUser, signUpUser, signUpPartner, resetPassword, updateUserPassword } from '../services/dataService';
import { supabase } from '../services/supabaseClient';
import { Button, PasswordInput } from './UI';
import { Mail, Lock, User as UserIcon, ArrowRight, AlertTriangle, Info, ArrowLeft, Briefcase, Phone, Heart, CheckCircle, ShieldCheck } from 'lucide-react';
import { playSound, playWelcomeMessage } from '../services/soundService';

interface AuthProps {
  onLogin: (user: User) => void;
  onNavigate?: (page: string) => void;
}

const LOGO_URL = "https://res.cloudinary.com/dzvusz0u4/image/upload/v1765977310/wrzwildc1kqsq5skklio.png";
const REMEMBER_EMAIL_KEY = 'farmolink_remember_email';
const REMEMBER_PASSWORD_KEY = 'farmolink_remember_password';
const REMEMBER_ACCOUNTS_KEY = 'farmolink_remember_accounts';
const MAX_REMEMBERED_ACCOUNTS = 5;

interface RememberedAccount {
  email: string;
  password: string;
  lastUsedAt: string;
}

export const UpdatePasswordView: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionChecked, setSessionChecked] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            setSessionError(null);
            setSessionChecked(false);

            for (let attempt = 0; attempt < 4; attempt++) {
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;

                if (data?.session?.user) {
                    setSessionChecked(true);
                    return;
                }

                await new Promise((r) => setTimeout(r, 450));
            }

            setSessionChecked(true);
            setSessionError('Link inválido ou expirado. Solicite uma nova recuperação de senha.');
        };

        check();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sessionChecked) return;
        if (sessionError) return;
        if(password.length < 6) return alert("A senha deve ter no mínimo 6 caracteres");
        if(password !== confirm) return alert("As senhas não coincidem");

        setLoading(true);
        const result = await updateUserPassword(password);
        setLoading(false);

        if(result.success) {
            playSound('success');
            alert("Senha atualizada com sucesso! Você já está logado.");
            onComplete();
        } else {
            playSound('error');
            alert("Erro ao atualizar senha: " + result.error);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center border border-gray-100">
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
                    <Lock size={32}/>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Definir Nova Senha</h2>
                <p className="text-gray-500 mb-6 text-sm">Digite sua nova senha abaixo para recuperar o acesso.</p>

                {sessionError ? (
                    <div className="text-left space-y-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800 text-sm flex gap-3">
                            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                            <div>{sessionError}</div>
                        </div>
                        <Button onClick={onComplete} className="w-full py-3">
                            Voltar ao login
                        </Button>
                    </div>
                ) : (
                
                <form onSubmit={handleUpdate} className="space-y-4 text-left">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Nova Senha</label>
                        <PasswordInput 
                            required 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Confirmar Senha</label>
                        <PasswordInput 
                            required 
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            placeholder="Repita a senha"
                            icon={<Lock className="h-5 w-5 text-gray-400" />}
                        />
                    </div>
                    <Button type="submit" disabled={loading} className="w-full py-3">
                        {loading ? 'Salvando...' : 'Atualizar Senha'}
                    </Button>
                </form>
                )}
            </div>
        </div>
    );
};

export const AuthView: React.FC<AuthProps> = ({ onLogin, onNavigate }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [isPartnerMode, setIsPartnerMode] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(''); 
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [legalConsent, setLegalConsent] = useState(false);
  const [pharmacyLegalDeclaration, setPharmacyLegalDeclaration] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let parsedAccounts: RememberedAccount[] = [];
    try {
      const rawAccounts = localStorage.getItem(REMEMBER_ACCOUNTS_KEY);
      if (rawAccounts) {
        const parsed = JSON.parse(rawAccounts);
        if (Array.isArray(parsed)) {
          parsedAccounts = parsed
            .filter((item: any) => item && typeof item.email === 'string' && typeof item.password === 'string')
            .map((item: any) => ({
              email: item.email.toLowerCase().trim(),
              password: item.password,
              lastUsedAt: item.lastUsedAt || ''
            }));
        }
      }
    } catch (e) {
      parsedAccounts = [];
    }

    setRememberedAccounts(parsedAccounts);

    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    const savedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
    if (savedPassword) {
      setPassword(savedPassword);
      setRememberEmail(true);
    } else if (!savedEmail && parsedAccounts.length > 0) {
      // Se não houver último login salvo, pré-preenche o mais recente do histórico.
      setEmail(parsedAccounts[0].email);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setResetCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldownSeconds]);

  const handleEmailChange = (value: string) => {
    const normalized = value.toLowerCase().trim();
    setEmail(value);
    const remembered = rememberedAccounts.find(a => a.email === normalized);
    if (remembered) {
      setPassword(remembered.password);
      setRememberEmail(true);
    }
  };

  const saveRememberedAccount = (emailValue: string, passwordValue: string) => {
    const normalizedEmail = emailValue.toLowerCase().trim();
    const nowIso = new Date().toISOString();
    const updatedAccounts = [
      { email: normalizedEmail, password: passwordValue, lastUsedAt: nowIso },
      ...rememberedAccounts.filter(a => a.email !== normalizedEmail)
    ].slice(0, MAX_REMEMBERED_ACCOUNTS);

    setRememberedAccounts(updatedAccounts);
    localStorage.setItem(REMEMBER_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isOffline) {
      setLoading(false);
      setErrorMsg('Sem internet. Este passo exige conexao para continuar.');
      return;
    }

    if (!isLoginMode && !isResetMode && !pdpaConsent) {
        setErrorMsg('É necessário aceitar o processamento de dados para continuar.');
        setLoading(false);
        return;
    }
    if (!isLoginMode && !isResetMode && !legalConsent) {
       setErrorMsg('Para criar conta, aceite os Termos de Uso e a Politica de Privacidade.');
       setLoading(false);
       return;
    }

    if (!isLoginMode && !isResetMode && isPartnerMode && !pharmacyLegalDeclaration) {
       setErrorMsg('Para farmacias, e obrigatorio declarar operacao legal com licenca valida.');
       setLoading(false);
       return;
    }

    if (!email.includes('@') || !email.includes('.')) {
       setErrorMsg('Por favor, insira um endereço de e-mail válido.');
       playSound('error');
       setLoading(false);
       return;
    }

    if (isResetMode) {
      if (resetCooldownSeconds > 0) {
        setLoading(false);
        return;
      }

      const targetEmail = email.trim().toLowerCase();
      const result = await resetPassword(email.trim());
      setLoading(false);
      if (result.success) {
        setSuccessMsg(
          `Email enviado para ${targetEmail}. Abra a tua caixa de entrada e clique no link para redefinir a senha. Verifique também Spam/Lixo.`
        );
        setEmail('');
        setPassword('');
        setResetCooldownSeconds(90);
        playSound('save');
      } else {
        setErrorMsg(result.message);
        playSound('error');
      }
      return;
    }

    let result;
    if (isLoginMode) {
      result = await signInUser(email.trim(), password);
    } else {
      if (isPartnerMode) {
         result = await signUpPartner(name, email.trim(), password, phone);
      } else {
         result = await signUpUser(name, email.trim(), password, UserRole.CUSTOMER, phone);
      }
    }

    if (result.user) {
      if (isLoginMode) {
        if (rememberEmail) {
          const normalizedEmail = email.trim().toLowerCase();
          localStorage.setItem(REMEMBER_EMAIL_KEY, normalizedEmail);
          localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
          saveRememberedAccount(normalizedEmail, password);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
          localStorage.removeItem(REMEMBER_PASSWORD_KEY);
          localStorage.removeItem(REMEMBER_ACCOUNTS_KEY);
          setRememberedAccounts([]);
        }
      }
      playWelcomeMessage(result.user.name); 
      onLogin(result.user);
    } else {
      playSound('error');
      setErrorMsg(result.error || 'Ocorreu um erro desconhecido.');
    }
    
    setLoading(false);
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setIsResetMode(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword('');
    setName('');
    setPhone('');
    setPdpaConsent(false);
    setLegalConsent(false);
    setPharmacyLegalDeclaration(false);
    playSound('click');
  };

  const switchToPartnerSignup = () => {
    setIsPartnerMode(true);
    setIsLoginMode(false);
    setIsResetMode(false);
    setErrorMsg(null);
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setPdpaConsent(false);
    setLegalConsent(false);
    setPharmacyLegalDeclaration(false);
    playSound('click');
  }

  const toggleReset = () => {
    setIsResetMode(!isResetMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    playSound('click');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        
        <div className={`p-8 text-center transition-colors duration-500 ${isPartnerMode && !isLoginMode ? 'bg-blue-800' : 'bg-emerald-600'}`}>
          <div className="flex justify-center mb-6">
             <div className="bg-white p-4 rounded-3xl shadow-xl">
                <img src={LOGO_URL} className="h-24 w-24 object-contain" alt="Logo" />
             </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">FarmoLink</h1>
          <p className="text-emerald-100 opacity-90">
             {isPartnerMode ? 'Parceiros' : 'Sua farmácia digital'}
          </p>
        </div>

        <div className="p-8">
          
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-800">
              {isResetMode ? 'Recuperar Senha' : (
                isLoginMode ? 'Acessar Conta' : (isPartnerMode ? 'Candidatura de Farmácia' : 'Criar Nova Conta')
              )}
            </h2>
            {isResetMode && <p className="text-gray-500 text-sm mt-1">Digite seu e-mail para receber um link de redefinição.</p>}
            {isPartnerMode && !isLoginMode && <p className="text-gray-500 text-sm mt-1">Crie sua conta. Após aprovação, você poderá configurar sua farmácia.</p>}
            {isPartnerMode && !isLoginMode && <p className="text-[11px] text-blue-700 mt-2 font-semibold">A ativacao do parceiro depende da validacao documental e licenciamento.</p>}
          </div>

          {errorMsg && (
            <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 bg-green-50 text-green-600 text-sm p-3 rounded-lg flex items-center">
              <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            
            {!isLoginMode && !isResetMode && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="text" 
                  required={!isLoginMode}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-gray-50 focus:bg-white"
                  placeholder={isPartnerMode ? "Nome do Responsável" : "Nome Completo"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}

            {!isLoginMode && !isResetMode && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  type="tel" 
                  required={!isLoginMode}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-gray-50 focus:bg-white"
                  placeholder="Seu Telefone (ex: 923...)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="email" 
                required
                name="email"
                list="farmolink-remembered-emails"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-gray-50 focus:bg-white"
                placeholder={isPartnerMode && !isLoginMode ? "E-mail Corporativo" : "Seu E-mail"}
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
              />
              {isLoginMode && rememberedAccounts.length > 0 && (
                <datalist id="farmolink-remembered-emails">
                  {rememberedAccounts.map((account) => (
                    <option key={account.email} value={account.email} />
                  ))}
                </datalist>
              )}
            </div>

            {!isResetMode && (
              <PasswordInput 
                required
                name="password"
                autoComplete={isLoginMode ? "current-password" : "new-password"}
                placeholder="Sua Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<Lock className="h-5 w-5 text-gray-400" />}
              />
            )}

            {isLoginMode && !isResetMode && (
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600"
                />
                Lembrar meus dados neste dispositivo
              </label>
            )}

            {!isLoginMode && !isResetMode && (
                <div className="flex items-start gap-2 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <input 
                        type="checkbox" 
                        id="pdpa" 
                        className="mt-1 h-4 w-4 rounded text-emerald-600"
                        checked={pdpaConsent}
                        onChange={e => setPdpaConsent(e.target.checked)}
                    />
                    <label htmlFor="pdpa" className="text-[10px] text-gray-500 leading-tight">
                        Autorizo o processamento dos meus dados pessoais e de saúde pela FarmoLink, conforme a <strong>Lei de Proteção de Dados de Angola (APD)</strong>.
                    </label>
                </div>
            )}

            {!isLoginMode && !isResetMode && (
                <div className="flex items-start gap-2 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <input 
                        type="checkbox" 
                        id="legal-consent" 
                        className="mt-1 h-4 w-4 rounded text-emerald-600"
                        checked={legalConsent}
                        onChange={e => setLegalConsent(e.target.checked)}
                    />
                    <label htmlFor="legal-consent" className="text-[10px] text-gray-500 leading-tight">
                        Li e aceito os
                        {' '}
                        <button type="button" className="font-bold text-emerald-700 underline" onClick={() => onNavigate?.('privacy-policy')}>Termos de Uso</button>
                        {' '}e a{' '}
                        <button type="button" className="font-bold text-emerald-700 underline" onClick={() => onNavigate?.('privacy-policy')}>Politica de Privacidade</button>.
                    </label>
                </div>
            )}

            {!isLoginMode && !isResetMode && isPartnerMode && (
                <div className="flex items-start gap-2 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <input 
                        type="checkbox" 
                        id="pharmacy-legal" 
                        className="mt-1 h-4 w-4 rounded text-blue-600"
                        checked={pharmacyLegalDeclaration}
                        onChange={e => setPharmacyLegalDeclaration(e.target.checked)}
                    />
                    <label htmlFor="pharmacy-legal" className="text-[10px] text-blue-800 leading-tight">
                        Declaro que a farmacia possui licenca valida para operar e cumprir as regras de dispensacao, incluindo retencao/validacao de receita quando exigido.
                    </label>
                </div>
            )}

            {isLoginMode && !isResetMode && (
              <div className="flex justify-end">
                <button 
                  type="button" 
                  onClick={toggleReset}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <Button 
              type="submit" 
              className={`w-full py-3.5 mt-2 text-lg font-bold shadow-lg transition-transform active:scale-95 ${isPartnerMode && !isLoginMode ? '!bg-blue-700 hover:!bg-blue-800' : ''}`}
              disabled={loading || (isResetMode && resetCooldownSeconds > 0)}
            >
              {loading ? 'Processando...' : (
                <span className="flex items-center justify-center gap-2">
                  {isResetMode
                    ? (resetCooldownSeconds > 0 ? `Aguarde ${resetCooldownSeconds}s` : 'Enviar Link')
                    : (isLoginMode ? 'Entrar' : (isPartnerMode ? 'Enviar Candidatura' : 'Criar Conta'))}
                  {!isResetMode && <ArrowRight className="h-5 w-5" />}
                </span>
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-xs text-gray-500">
            <button type="button" className="underline hover:text-emerald-700" onClick={() => onNavigate?.('privacy-policy')}>Termos de Uso</button>
            {' '}|{' '}
            <button type="button" className="underline hover:text-emerald-700" onClick={() => onNavigate?.('privacy-policy')}>Politica de Privacidade</button>
          </div>

          {isResetMode && (
             <div className="mt-4 text-center">
               <button onClick={toggleReset} className="text-gray-500 text-sm hover:text-gray-800 flex items-center justify-center gap-1 mx-auto">
                 <ArrowLeft className="w-4 h-4" /> Voltar para o Login
               </button>
             </div>
          )}

          {!isResetMode && (
            <div className="mt-6 text-center pt-6 border-t border-gray-100">
              <p className="text-gray-500 text-sm mb-2">
                {isLoginMode ? 'Ainda não tem uma conta?' : 'Já possui cadastro?'}
              </p>
              <button 
                onClick={() => { toggleMode(); setIsPartnerMode(false); }}
                className="font-bold text-emerald-600 hover:underline transition-colors mb-6"
              >
                {isLoginMode ? 'Criar conta de Cliente' : 'Fazer Login'}
              </button>

              {!isPartnerMode && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button 
                        onClick={switchToPartnerSignup}
                        className="text-xs text-gray-400 hover:text-blue-600 flex items-center justify-center gap-1 mx-auto transition-colors"
                    >
                        <Briefcase className="w-3 h-3" /> Sou Farmácia: Cadastrar / Entrar
                    </button>
                  </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


