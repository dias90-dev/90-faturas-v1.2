import { useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, User, Crown } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !supabase.auth) {
      setError('O Supabase não está configurado ou inicializado corretamente. Verifique as variáveis de ambiente.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        alert('Link de recuperação enviado! Verifique o seu email.');
        setIsForgotPassword(false);
      } else if (isRegister) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Registo efetuado! Verifique o seu email para confirmar a conta.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      if (!isForgotPassword) onClose();
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-bg-card border border-accent-blue/30 rounded-3xl p-8 w-full max-w-sm relative z-10 shadow-2xl"
          >
            <button onClick={onClose} className="absolute right-6 top-6 text-slate-500 hover:text-white">
              <X size={20} />
            </button>

            <div className="text-center mb-8">
              <Crown size={48} className="mx-auto text-accent-blue mb-4" />
              <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">
                {isForgotPassword ? 'Recuperar Senha' : isRegister ? 'Criar Conta Cloud' : 'Acesso Supabase'}
              </h2>
              <p className="text-slate-400 text-sm">
                {isForgotPassword ? 'Introduza o seu email para receber um link de acesso.' : 'Sincronize as suas faturas em tempo real com segurança total.'}
                {isForgotPassword && (
                  <p className="mt-2 text-[10px] text-amber-500 font-bold bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                    DICA: Se receber erro de "localhost", tente abrir o link diretamente no navegador onde usa a App.
                  </p>
                )}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input 
                  type="email"
                  placeholder="Email"
                  required
                  className="input-custom pl-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {!isForgotPassword && (
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="password"
                    placeholder="Palavra-passe"
                    required
                    className="input-custom pl-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <p className="text-accent-red text-[11px] font-bold uppercase tracking-widest text-center">
                  {error}
                </p>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-accent-blue text-white font-black py-4 rounded-xl uppercase tracking-widest shadow-lg shadow-accent-blue/20 hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
              >
                {loading ? 'Processando...' : isForgotPassword ? 'Enviar Link' : isRegister ? 'Registar agora' : 'Login'}
              </button>
            </form>

            <div className="mt-8 flex flex-col gap-4 text-center">
              {!isForgotPassword && !isRegister && (
                <button 
                  onClick={() => setIsForgotPassword(true)}
                  className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hover:text-white"
                >
                  Esqueceu a palavra-passe?
                </button>
              )}
              
              <button 
                onClick={() => {
                  setIsRegister(!isRegister);
                  setIsForgotPassword(false);
                }}
                className="text-xs text-slate-500 font-bold uppercase tracking-widest hover:text-accent-blue"
              >
                {isForgotPassword ? 'Voltar para Login' : isRegister ? 'Já tem conta? Faça Login' : 'Não tem conta? Registe-se grátis'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
