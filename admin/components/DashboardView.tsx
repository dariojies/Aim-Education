
import React, { useState, useEffect } from 'react';
import { Users, Trophy, Calendar, Layers, ArrowRight, Plus, Sparkles } from 'lucide-react';
import { DashboardStats, ViewState } from '../types';
import * as storage from '../services/storage';
import { useLanguage } from '../LanguageContext';

const DashboardView: React.FC<{ onNavigate: (view: ViewState) => void }> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const { t } = useLanguage();
  const sport = storage.getSportConfig();

  useEffect(() => {
    storage.getStats().then(setStats);
  }, []);

  if (!stats) return <div className="p-10 text-center text-slate-400 font-bold animate-pulse">{t('common.syncing')}</div>;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-10 rounded-[2rem] shadow-2xl relative overflow-hidden text-white">
        <div className="relative z-10">
          <h2 className="text-4xl font-black mb-2 tracking-tighter">{t('dash.welcome')}</h2>
          <p className="text-slate-400 max-w-md font-medium">
             {t('dash.summary').replace('{sport}', sport.name).replace('{count}', stats.totalStudents.toString()).replace('{groups}', stats.totalGroups.toString())}
          </p>
        </div>
        <Trophy size={180} className="absolute -top-10 -right-10 text-white opacity-5 rotate-12" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Users size={24} /></div>
          <div><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('dash.stat.students')}</div><div className="text-3xl font-black text-slate-900">{stats.totalStudents}</div></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Layers size={24} /></div>
          <div><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('dash.stat.groups')}</div><div className="text-3xl font-black text-slate-900">{stats.totalGroups}</div></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><Trophy size={24} /></div>
          <div><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('dash.stat.drills')}</div><div className="text-3xl font-black text-slate-900">{stats.totalGames}</div></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><Calendar size={24} /></div>
          <div><div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t('dash.stat.sessions')}</div><div className="text-3xl font-black text-slate-900">{stats.sessionsThisMonth}</div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-emerald-600 p-8 rounded-[2rem] shadow-xl text-white">
          <h3 className="text-2xl font-black mb-4">{t('dash.quick_reg')}</h3>
          <p className="text-emerald-100 mb-8 font-medium">{t('dash.quick_desc')}</p>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => onNavigate('SESSIONS')} className="bg-white/10 hover:bg-white/20 p-4 rounded-2xl font-bold transition flex flex-col items-center gap-2">
              <Calendar size={20} /> {t('dash.plan_session')}
            </button>
            <button onClick={() => onNavigate('AI_COACH')} className="bg-white text-emerald-600 p-4 rounded-2xl font-bold transition flex flex-col items-center gap-2">
              <Sparkles size={20} /> {t('nav.aicoach')}
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-2xl font-black text-slate-900 mb-6">{t('dash.actions')}</h3>
          <div className="space-y-4">
            <button onClick={() => onNavigate('STUDENTS')} className="w-full flex items-center justify-between p-5 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition group border border-transparent hover:border-emerald-100">
              <span className="font-bold text-slate-700 group-hover:text-emerald-600 transition">{t('dash.take_attendance')}</span>
              <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-600 transition translate-x-0 group-hover:translate-x-1" />
            </button>
            <button onClick={() => onNavigate('AI_COACH')} className="w-full flex items-center justify-between p-5 bg-slate-50 rounded-2xl hover:bg-emerald-50 transition group border border-transparent hover:border-emerald-100">
              <span className="font-bold text-slate-700 group-hover:text-emerald-600 transition">{t('dash.ai_gen')}</span>
              <ArrowRight size={20} className="text-slate-300 group-hover:text-emerald-600 transition translate-x-0 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
