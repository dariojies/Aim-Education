
import React, { useState, useEffect } from 'react';
import { Save, Settings, Dumbbell, CreditCard, Sparkles, CheckCircle, ShieldCheck } from 'lucide-react';
import * as storage from '../services/storage';
import { useLanguage } from '../LanguageContext';
import PaymentModal from './PaymentModal';

const SettingsView: React.FC = () => {
  const [config, setConfig] = useState(storage.getSportConfig());
  const [saved, setSaved] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const { t, price } = useLanguage();

  useEffect(() => {
    const handleUpdate = () => setConfig(storage.getSportConfig());
    window.addEventListener('storage_updated', handleUpdate);
    return () => window.removeEventListener('storage_updated', handleUpdate);
  }, []);

  const handleSave = () => {
    storage.saveSportConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const togglePremium = () => {
    if (!config.isPremium) {
      setShowPayment(true);
    } else {
      const newConfig = { ...config, isPremium: false };
      storage.saveSportConfig(newConfig);
      setConfig(newConfig);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* APP SETTINGS */}
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
              <Settings className="text-emerald-600" /> {t('settings.title')}
            </h2>

            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('settings.sport_label')}</label>
                <div className="relative">
                  <Dumbbell className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input 
                    type="text"
                    value={config.name}
                    onChange={(e) => setConfig({ ...config, name: e.target.value })}
                    className="w-full pl-12 p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800"
                    placeholder="..."
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-medium px-1">{t('settings.sport_help')}</p>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('settings.color_label')}</label>
                <div className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <input 
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                    className="w-12 h-12 rounded-xl cursor-pointer border-none bg-transparent"
                  />
                  <span className="text-slate-600 font-mono text-sm font-black uppercase tracking-widest">{config.primaryColor}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-10">
            <button 
              onClick={handleSave}
              className={`w-full py-5 rounded-2xl font-black text-white transition-all shadow-xl flex items-center justify-center gap-3 ${saved ? 'bg-emerald-600 scale-95' : 'bg-slate-900 hover:bg-emerald-600'}`}
            >
              <Save size={20} />
              {saved ? t('settings.saved_msg') : t('settings.save_btn')}
            </button>
          </div>
        </div>

        {/* BILLING / PRO PANEL */}
        <div className={`p-10 rounded-[2.5rem] border flex flex-col justify-between transition-all duration-500
          ${config.isPremium 
            ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-400/20 text-white shadow-2xl shadow-emerald-200' 
            : 'bg-white border-slate-100 shadow-sm text-slate-800'}`}>
          
          <div>
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-2xl font-black flex items-center gap-3 tracking-tight">
                <CreditCard className={config.isPremium ? 'text-emerald-200' : 'text-emerald-600'} /> {t('premium.billing')}
              </h2>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest
                ${config.isPremium ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {config.isPremium ? 'Active' : 'Free'}
              </span>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${config.isPremium ? 'text-emerald-200' : 'text-slate-400'}`}>Current Plan</p>
                <h4 className="text-3xl font-black tracking-tighter">
                   {config.isPremium ? 'Coach Pro' : 'Free Starter'}
                </h4>
                <p className="mt-2 text-sm font-medium opacity-70">
                   {config.isPremium ? t('premium.status.pro') : t('premium.desc')}
                </p>
              </div>

              {config.isPremium ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm font-bold bg-white/10 p-4 rounded-2xl">
                     <ShieldCheck size={20} className="text-emerald-300" />
                     Suscripción gestionada vía AIM Cloud
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                   <div className="flex items-center gap-3 text-xs font-bold"><CheckCircle size={16} className="text-emerald-500" /> IA Sin límites</div>
                   <div className="flex items-center gap-3 text-xs font-bold"><CheckCircle size={16} className="text-emerald-500" /> Soporte prioritario 24/7</div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-10">
            <button 
              onClick={togglePremium}
              className={`w-full py-5 rounded-2xl font-black transition-all shadow-xl flex items-center justify-center gap-3 
                ${config.isPremium 
                  ? 'bg-white text-emerald-700 hover:bg-slate-50' 
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              {config.isPremium ? (
                <>Cancelar Suscripción</>
              ) : (
                <><Sparkles size={20} /> Suscribirse a Pro — {price}</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER INFO */}
      <div className="p-8 bg-slate-100 rounded-[2rem] border border-slate-200 text-slate-500">
        <h3 className="font-black text-slate-900 mb-2 uppercase text-xs tracking-widest">{t('settings.backend_title')}</h3>
        <p className="text-sm font-medium leading-relaxed max-w-2xl">
          {t('settings.backend_desc')} Esta arquitectura soporta escalado a miles de usuarios y procesamiento de pagos seguros.
        </p>
      </div>
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} onSuccess={() => setShowPayment(false)} />}
    </div>
  );
};

export default SettingsView;
