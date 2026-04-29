
import React, { useState } from 'react';
import { X, CreditCard, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import * as storage from '../services/storage';

interface PaymentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<'FORM' | 'PROCESSING' | 'SUCCESS'>('FORM');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  
  const { t, price } = useLanguage();

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo permitir números y limitar a 16 dígitos
    const value = e.target.value.replace(/\D/g, '').slice(0, 16);
    setCardNumber(value);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo números
    let value = e.target.value.replace(/\D/g, '');
    
    // Auto-formatear MM/YY
    if (value.length > 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    
    setExpiry(value.slice(0, 5));
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo números y máximo 3 dígitos
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setCvc(value);
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas de longitud antes de procesar
    if (cardNumber.length < 16 || expiry.length < 5 || cvc.length < 3) {
      alert("Por favor, completa los datos de la tarjeta correctamente.");
      return;
    }

    setStep('PROCESSING');
    
    // Simular procesamiento bancario
    setTimeout(() => {
      setStep('SUCCESS');
      const config = storage.getSportConfig();
      storage.saveSportConfig({ ...config, isPremium: true });
      
      // Mostrar éxito brevemente antes de cerrar
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }, 3000);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/20">
        
        {step === 'FORM' && (
          <>
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-emerald-400" />
                <h3 className="text-xl font-black tracking-tight">{t('pay.title')}</h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
            </div>

            <form onSubmit={handlePay} className="p-10 space-y-6">
              {/* Resumen de pedido */}
              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 flex justify-between items-center">
                <div>
                   <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Plan Coach Pro</p>
                   <p className="font-black text-emerald-900 text-xl">Suscripción Mensual</p>
                </div>
                <div className="text-right">
                   <p className="text-2xl font-black text-emerald-600">{price}</p>
                   <p className="text-[9px] text-emerald-400 font-bold">IVA Incluido</p>
                </div>
              </div>

              {/* Tarjeta Visual (Decorativa) */}
              <div className="w-full aspect-[1.6/1] bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 text-white flex flex-col justify-between shadow-lg mb-8 relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10">
                   <CreditCard size={32} />
                   <div className="text-[10px] font-black tracking-widest opacity-50 uppercase">Secured by Stripe</div>
                </div>
                <div className="space-y-4 relative z-10">
                   <div className="text-xl font-mono tracking-[0.2em]">
                      {cardNumber ? cardNumber.replace(/(.{4})/g, '$1 ').trim() : '•••• •••• •••• ••••'}
                   </div>
                   <div className="flex justify-between items-end">
                      <div className="text-xs uppercase font-bold tracking-widest truncate max-w-[150px]">{cardName || 'NAME SURNAME'}</div>
                      <div className="text-xs font-mono">{expiry || 'MM/YY'}</div>
                   </div>
                </div>
                {/* Círculos decorativos */}
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full"></div>
                <div className="absolute -top-10 -left-10 w-20 h-20 bg-white/5 rounded-full"></div>
              </div>

              <div className="space-y-4">
                 <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('pay.card_holder')}</label>
                   <input 
                      required 
                      value={cardName} 
                      onChange={e => setCardName(e.target.value.toUpperCase())} 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                      placeholder="E.g. JOHN DOE" 
                   />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('pay.card_number')}</label>
                   <input 
                      required 
                      type="text"
                      inputMode="numeric"
                      value={cardNumber} 
                      onChange={handleCardNumberChange} 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold" 
                      placeholder="0000000000000000" 
                   />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('pay.expiry')}</label>
                      <input 
                        required 
                        type="text"
                        inputMode="numeric"
                        placeholder="MM/AA" 
                        value={expiry}
                        onChange={handleExpiryChange}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('pay.cvc')}</label>
                      <input 
                        required 
                        type="text"
                        inputMode="numeric"
                        placeholder="123" 
                        value={cvc}
                        onChange={handleCvcChange}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                      />
                    </div>
                 </div>
              </div>

              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg hover:bg-emerald-600 transition shadow-xl flex items-center justify-center gap-3">
                 <Lock size={18} /> {t('pay.btn')}
              </button>
            </form>
          </>
        )}

        {step === 'PROCESSING' && (
          <div className="p-20 text-center flex flex-col items-center gap-6 animate-pulse">
             <div className="w-20 h-20 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
             <div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">{t('pay.processing')}</h3>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">AIM Secure Payment Gateway</p>
             </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="p-20 text-center flex flex-col items-center gap-6 animate-scale-in">
             <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100">
                <CheckCircle2 size={64} />
             </div>
             <div>
                <h3 className="text-3xl font-black text-slate-900 mb-2">{t('pay.success')}</h3>
                <p className="text-slate-500 font-medium">Bienvenido a la comunidad Pro.</p>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default PaymentModal;
