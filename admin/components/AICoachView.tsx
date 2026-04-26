
import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, MessageSquare, TrendingUp, Calendar, Trash2, Lock, CheckCircle2 } from 'lucide-react';
import * as storage from '../services/storage';
import { consultAICoach } from '../services/geminiService';
import { useLanguage } from '../LanguageContext';
import PaymentModal from './PaymentModal';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

const AICoachView: React.FC = () => {
  const [isPremium, setIsPremium] = useState(storage.getSportConfig().isPremium);
  const [showPayment, setShowPayment] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { t, language, price } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPremium) {
      setMessages([{ role: 'ai', text: t('ai.welcome') }]);
    }
    
    const handleStorageUpdate = () => setIsPremium(storage.getSportConfig().isPremium);
    window.addEventListener('storage_updated', handleStorageUpdate);
    return () => window.removeEventListener('storage_updated', handleStorageUpdate);
  }, [isPremium]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (overridePrompt?: string) => {
    const textToSend = overridePrompt || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const students = await storage.getStudents();
      const groups = await storage.getGroups();
      const games = await storage.getGames();
      const sessions = await storage.getSessions();
      
      const response = await consultAICoach(textToSend, { students, groups, games, sessions }, language);
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Error: " + e }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    setIsPremium(true);
  };

  // VISTA DE PAGO (PAYWALL)
  if (!isPremium) {
    return (
      <>
        <div className="max-w-4xl mx-auto min-h-[500px] flex flex-col bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden animate-fade-in relative">
          <div className="absolute top-0 right-0 p-10 opacity-5 text-slate-900">
             <Lock size={200} />
          </div>
          
          <div className="p-12 text-center space-y-8 relative z-10 flex-1 flex flex-col justify-center">
            <div className="flex justify-center">
               <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-2xl shadow-emerald-200">
                  <Sparkles size={48} className="text-white" />
               </div>
            </div>
            
            <div className="space-y-4">
               <h2 className="text-4xl font-black text-slate-900 tracking-tight">{t('premium.title')}</h2>
               <p className="text-slate-500 max-w-lg mx-auto font-medium">{t('premium.desc')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
               {[
                 t('premium.feature.ai_chat'),
                 t('premium.feature.ai_drills'),
                 t('premium.feature.sync'),
                 t('premium.feature.analytics')
               ].map((f, i) => (
                 <div key={i} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                    <span className="text-sm font-bold text-slate-700">{f}</span>
                 </div>
               ))}
            </div>

            <div className="pt-6">
               <button 
                 onClick={() => setShowPayment(true)}
                 className="bg-slate-900 text-white px-12 py-5 rounded-[1.5rem] font-black text-xl hover:bg-emerald-600 transition-all shadow-xl hover:scale-105"
               >
                  {t('premium.cta')} — {price}
               </button>
               <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cancela en cualquier momento</p>
            </div>
          </div>
        </div>
        {showPayment && <PaymentModal onClose={() => setShowPayment(false)} onSuccess={handlePaymentSuccess} />}
      </>
    );
  }

  // VISTA DE CHAT (PREMIUM)
  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-250px)] flex flex-col bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden animate-fade-in">
      {/* Header con insignia PRO */}
      <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-3 rounded-2xl shadow-lg">
            <Sparkles className="text-white" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
               <h2 className="text-xl font-black tracking-tight">{t('ai.title')}</h2>
               <span className="text-[9px] font-black bg-emerald-500 px-1.5 py-0.5 rounded text-white uppercase tracking-widest">PRO</span>
            </div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{t('ai.subtitle')}</p>
          </div>
        </div>
        <button onClick={() => setMessages([{ role: 'ai', text: t('ai.welcome') }])} className="p-2 hover:bg-white/10 rounded-xl transition">
          <Trash2 size={20} className="text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/30">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            <div className={`max-w-[80%] p-5 rounded-3xl font-medium text-sm leading-relaxed shadow-sm
              ${m.role === 'user' 
                ? 'bg-slate-900 text-white rounded-tr-none' 
                : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
              {m.text.split('\n').map((line, j) => <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-white border border-slate-100 p-5 rounded-3xl rounded-tl-none flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-75"></div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-150"></div>
              <span className="text-[10px] font-black text-slate-400 ml-2 uppercase tracking-widest">{t('ai.thinking')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Actions */}
      <div className="px-8 py-4 bg-white border-t border-slate-50 flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => handleSend(t('ai.suggest.plan'))} className="shrink-0 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black border border-emerald-100 hover:bg-emerald-100 transition flex items-center gap-2">
          <Calendar size={14} /> {t('ai.suggest.plan')}
        </button>
        <button onClick={() => handleSend(t('ai.suggest.analyze'))} className="shrink-0 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black border border-emerald-100 hover:bg-emerald-100 transition flex items-center gap-2">
          <TrendingUp size={14} /> {t('ai.suggest.analyze')}
        </button>
        <button onClick={() => handleSend(t('ai.suggest.drills'))} className="shrink-0 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-black border border-amber-100 hover:bg-amber-100 transition flex items-center gap-2">
          <MessageSquare size={14} /> {t('ai.suggest.drills')}
        </button>
      </div>

      {/* Input */}
      <div className="p-8 bg-white">
        <div className="relative">
          <input 
            type="text" 
            placeholder={t('ai.ph')}
            className="w-full pl-6 pr-16 py-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white p-3 rounded-2xl hover:bg-slate-800 transition disabled:opacity-20 shadow-lg"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AICoachView;
