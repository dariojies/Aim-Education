import React, { useState } from 'react';
import { Trophy, Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

interface AuthProps {
  onLogin: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const { language, t } = useLanguage();

  // Local translation helper for Auth component
  const localT = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      subtitle: {
        es: 'Plataforma Inteligente de Entrenamiento',
        en: 'Smart Training Platform'
      },
      loginTitle: {
        es: 'Iniciar Sesión',
        en: 'Login'
      },
      invalidCredentials: {
        es: 'Credenciales incorrectas.',
        en: 'Invalid credentials.'
      },
      email: {
        es: 'Correo Electrónico',
        en: 'Email Address'
      },
      password: {
        es: 'Contraseña',
        en: 'Password'
      },
      enter: {
        es: 'Entrar',
        en: 'Login'
      }
    };
    return translations[key]?.[language] || translations[key]?.['en'] || key;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const emailLower = formData.email.toLowerCase();
    const password = formData.password;

    setTimeout(() => {
      // Check for Coach credentials (hardcoded)
      if (emailLower === 'abel@gmail.com' && password === '1234') {
        onLogin();
      } else {
        setError(localT('invalidCredentials'));
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto mb-4">
            <Trophy className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
            {t('app.name')}
          </h1>
          <p className="text-slate-500 mt-2 font-medium">
            {localT('subtitle')}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-xl">
          <h2 className="text-2xl font-black text-slate-900 mb-6 text-center tracking-tight">
            {localT('loginTitle')}
          </h2>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">{localT('email')}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="email"
                  required
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-12 pr-4 py-3.5 rounded-2xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all font-medium"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">{localT('password')}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 pl-12 pr-4 py-3.5 rounded-2xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all font-medium"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 mt-8 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {localT('enter')}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
