
import React, { useState, useEffect } from 'react';
import { Wallet, Gift, Share2, Users, ArrowUpRight, ArrowDownLeft, Info, Copy, Check } from 'lucide-react';
import * as storage from '../services/storage';
import { Student, WalletTransaction } from '../types';
import { useLanguage } from '../LanguageContext';

const WalletView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      storage.getWalletTransactions(selectedStudent.id).then(setTransactions);
    }
  }, [selectedStudent]);

  const loadData = async () => {
    const s = await storage.getStudents();
    setStudents(s);
    if (s.length > 0) setSelectedStudent(s[0]);
  };

  const calculateBalance = (txs: WalletTransaction[]) => {
    return txs.reduce((acc, tx) => tx.type === 'CREDIT' ? acc + tx.amount : acc - tx.amount, 0);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="bg-slate-100 p-8 rounded-[3rem] text-slate-300">
           <Wallet size={80} />
        </div>
        <h2 className="text-2xl font-black text-slate-800">El Monedero está vacío</h2>
        <p className="text-slate-500 max-w-xs">Registra a tu primer alumno para empezar a acumular saldo por referidos.</p>
      </div>
    );
  }

  const balance = calculateBalance(transactions);
  const referredStudents = students.filter(s => s.referredById === selectedStudent?.id);

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Header & Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <div className="bg-emerald-600 p-2 rounded-2xl text-white shadow-lg"><Wallet size={24} /></div>
             Monedero AIM
          </h2>
          <p className="text-slate-500 font-medium">Gestiona tus bonos y recompensas por recomendación.</p>
        </div>
        <select 
          value={selectedStudent?.id} 
          onChange={(e) => setSelectedStudent(students.find(s => s.id === e.target.value) || null)}
          className="bg-white border border-slate-200 px-6 py-4 rounded-2xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
        >
          {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Balance Card */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden group">
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <p className="text-emerald-400 font-black uppercase text-xs tracking-[0.2em] mb-2">Saldo Acumulado</p>
                <div className="text-7xl font-black tracking-tighter flex items-baseline gap-2">
                   {balance.toFixed(2)}<span className="text-3xl text-emerald-500">€</span>
                </div>
                <div className="mt-6 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full w-fit">
                   <Info size={14} className="text-emerald-300" />
                   <span className="text-[10px] font-bold text-slate-300">Disponible para próximos pagos</span>
                </div>
              </div>
              <div className="bg-emerald-600/20 border border-emerald-500/30 p-8 rounded-[2.5rem] backdrop-blur-md flex flex-col items-center gap-4 text-center">
                <Gift size={40} className="text-emerald-400" />
                <div>
                   <p className="text-xl font-black">{referredStudents.length}</p>
                   <p className="text-[10px] uppercase font-black tracking-widest text-emerald-300">Amigos Vinculados</p>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl group-hover:bg-emerald-600/20 transition-all duration-700"></div>
          </div>

          {/* Transaction History */}
          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
             <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800">Historial de Movimientos</h3>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Últimos 30 días</div>
             </div>
             <div className="divide-y divide-slate-50">
               {transactions.length === 0 ? (
                 <div className="p-20 text-center text-slate-400 font-bold italic">No hay movimientos registrados.</div>
               ) : (
                 transactions.slice().reverse().map(tx => (
                   <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${tx.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                           {tx.type === 'CREDIT' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                        </div>
                        <div>
                           <p className="font-black text-slate-800">{tx.description}</p>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(tx.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className={`text-lg font-black ${tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.type === 'CREDIT' ? '+' : '-'}{tx.amount.toFixed(2)}€
                      </div>
                   </div>
                 ))
               )}
             </div>
          </div>
        </div>

        {/* Referrals & Share Sidebar */}
        <div className="space-y-8">
           <div className="bg-emerald-600 rounded-[3rem] p-10 text-white shadow-xl space-y-8">
              <div className="flex items-center gap-4">
                <Share2 size={32} />
                <h3 className="text-xl font-black leading-tight">Recomienda y gana</h3>
              </div>
              <p className="text-emerald-100 text-sm font-medium">Obtén el <span className="text-white font-black">1% mensual</span> de la cuota de cada amigo que traigas a AIM Education.</p>
              
              <div className="space-y-3">
                 <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200 ml-1">Tu código de referido</p>
                 <div className="bg-white/10 border border-white/20 p-5 rounded-2xl flex items-center justify-between group">
                    <span className="text-2xl font-black tracking-widest font-mono">{selectedStudent?.referralCode}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedStudent?.referralCode || '')}
                      className="p-3 bg-white text-emerald-600 rounded-xl hover:scale-110 transition shadow-lg"
                    >
                       {copied ? <Check size={20} /> : <Copy size={20} />}
                    </button>
                 </div>
              </div>

              <div className="pt-4 space-y-4">
                <div className="flex items-start gap-3">
                   <div className="bg-emerald-400/30 p-1.5 rounded-lg mt-0.5"><Users size={14} /></div>
                   <p className="text-[10px] font-bold leading-relaxed opacity-80 italic">Saldo acumulable, no caduca y se activa desde el 2º mes.</p>
                </div>
              </div>
           </div>

           {/* Linked Friends List */}
           <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8">
              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Amigos Vinculados</h4>
              <div className="space-y-4">
                 {referredStudents.map(s => (
                   <div key={s.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-2xl transition">
                      <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400">
                         {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <div>
                         <p className="font-bold text-slate-800 text-sm">{s.firstName} {s.lastName}</p>
                         <p className="text-[9px] font-black text-emerald-500 uppercase">Activo (Generando 1%)</p>
                      </div>
                   </div>
                 ))}
                 {referredStudents.length === 0 && (
                   <p className="text-center py-4 text-xs font-bold text-slate-300 italic">Comparte tu código para ver a tus amigos aquí.</p>
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default WalletView;
