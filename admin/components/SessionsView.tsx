
import React, { useState, useEffect } from 'react';
import { 
  Plus, Calendar, Trash2, Clock, PlayCircle, 
  Pencil, Eye, X, Layout, Target, ChevronRight,
  Info, ArrowLeft, Hourglass
} from 'lucide-react';
import { Session, Game, SessionItem, DifficultyLevel, Group } from '../types';
import * as storage from '../services/storage';
import { useLanguage } from '../LanguageContext';

const SessionsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CREATE' | 'LIST'>('LIST');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionDescription, setSessionDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState<SessionItem[]>([]);
  const [targetDuration, setTargetDuration] = useState<number>(60);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [sessionsData, gamesData, groupsData] = await Promise.all([
      storage.getSessions(),
      storage.getGames(),
      storage.getGroups()
    ]);
    setSessions(sessionsData);
    setGames(gamesData);
    setGroups(groupsData);
    if (groupsData.length > 0 && !selectedGroupId) setSelectedGroupId(groupsData[0].id);
    setLoading(false);
  };

  const addGameToSession = (game: Game) => {
    setSelectedItems(prev => [
      ...prev,
      { gameId: game.id, durationMin: game.durationMin }
    ]);
  };

  const removeGameFromSession = (index: number) => {
    const newItems = [...selectedItems];
    newItems.splice(index, 1);
    setSelectedItems(newItems);
  };

  const updateItemDuration = (index: number, minutes: number) => {
    const newItems = [...selectedItems];
    newItems[index].durationMin = Math.max(1, minutes || 0);
    setSelectedItems(newItems);
  };

  const calculateTotalDuration = (items: SessionItem[]) => {
    return items.reduce((acc, curr) => acc + curr.durationMin, 0);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle || !selectedGroupId) return;

    const newSession: Session = {
      id: editingId || storage.generateId(),
      groupId: selectedGroupId,
      title: sessionTitle,
      date: sessionDate,
      description: sessionDescription,
      items: selectedItems,
      totalDuration: calculateTotalDuration(selectedItems)
    };

    await storage.addSession(newSession);
    resetForm();
    loadData();
    setActiveTab('LIST');
  };

  const resetForm = () => {
    setEditingId(null);
    setSessionTitle('');
    setSessionDescription('');
    setSessionDate(new Date().toISOString().split('T')[0]);
    setSelectedItems([]);
    setTargetDuration(60);
  };

  const handleEdit = (session: Session) => {
    setEditingId(session.id);
    setSessionTitle(session.title);
    setSelectedGroupId(session.groupId);
    setSessionDescription(session.description || '');
    setSessionDate(session.date);
    setSelectedItems(session.items);
    setTargetDuration(session.totalDuration || 60);
    setActiveTab('CREATE');
  };

  const totalActual = calculateTotalDuration(selectedItems);

  if (loading) return <div className="p-10 text-center animate-pulse font-bold text-slate-400">...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
        <button
          onClick={() => setActiveTab('LIST')}
          className={`flex-1 px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-black transition ${activeTab === 'LIST' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Calendar size={18} /> {t('sessions.history')}
        </button>
        <button
          onClick={() => { setActiveTab('CREATE'); if(!editingId) resetForm(); }}
          className={`flex-1 px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-black transition ${activeTab === 'CREATE' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Plus size={18} /> {editingId ? t('common.edit') : t('sessions.create')}
        </button>
      </div>

      <div className="min-h-[600px]">
        {activeTab === 'LIST' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800">{t('sessions.title')}</h2>
            <div className="grid grid-cols-1 gap-4">
              {sessions.length === 0 && (
                <div className="py-20 text-center text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                  <p className="font-bold">{t('sessions.empty')}</p>
                </div>
              )}
              {sessions.slice().reverse().map(session => {
                const group = groups.find(g => g.id === session.groupId);
                return (
                  <div key={session.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition group flex flex-col md:flex-row items-center gap-6">
                    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex flex-col items-center justify-center border border-slate-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <span className="text-sm font-black uppercase">{new Date(session.date).toLocaleString('default', { month: 'short' })}</span>
                      <span className="text-2xl font-black">{session.date.split('-')[2]}</span>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded">{group?.name || '---'}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded">{session.totalDuration} min</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-800">{session.title}</h3>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedSession(session)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition"><Eye size={20} /></button>
                      <button onClick={() => handleEdit(session)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition"><Pencil size={20} /></button>
                      <button onClick={() => storage.removeSession(session.id).then(loadData)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition"><Trash2 size={20} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'CREATE' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <h2 className="text-2xl font-black text-slate-800">{editingId ? t('common.edit') : t('sessions.create')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{t('sessions.form.title')}</label>
                    <input type="text" value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" placeholder="..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{t('sessions.form.group')}</label>
                    <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600">
                      {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{t('sessions.form.date')}</label>
                    <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Duración Objetivo (min)</label>
                    <input type="number" value={targetDuration} onChange={e => setTargetDuration(parseInt(e.target.value) || 0)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Planificado</label>
                    <div className={`w-full p-4 rounded-2xl font-black transition-colors border ${totalActual > targetDuration ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                      {totalActual} / {targetDuration} min
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{t('sessions.form.desc')}</label>
                   <textarea value={sessionDescription} onChange={e => setSessionDescription(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 h-24" />
                </div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[300px]">
                <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><Target className="text-emerald-600" /> {t('sessions.timeline')}</h3>
                <div className="space-y-4">
                  {selectedItems.map((item, idx) => {
                    const game = games.find(g => g.id === item.gameId);
                    return (
                      <div key={idx} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center gap-4 group">
                        <div className="bg-white text-emerald-600 w-10 h-10 rounded-2xl flex items-center justify-center font-black shadow-sm shrink-0">{idx+1}</div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-800 text-sm">{game?.title || 'Game Deleted'}</div>
                          <div className="text-[9px] font-black text-slate-400 uppercase">Ajustar tiempo individual</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-slate-400" />
                          <input 
                            type="number" 
                            value={item.durationMin} 
                            onChange={(e) => updateItemDuration(idx, parseInt(e.target.value))} 
                            className="w-20 p-3 bg-white border border-slate-100 rounded-xl text-center font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500 outline-none" 
                          />
                          <span className="text-[10px] font-bold text-slate-400">min</span>
                        </div>
                        <button onClick={() => removeGameFromSession(idx)} className="p-2 text-slate-300 hover:text-rose-500 transition"><Trash2 size={18} /></button>
                      </div>
                    );
                  })}
                  {selectedItems.length === 0 && (
                    <div className="py-12 text-center text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl">
                      Añade ejercicios desde tu biblioteca
                    </div>
                  )}
                </div>
                <div className="mt-8 pt-6 border-t border-slate-50">
                  <button onClick={handleCreate} disabled={!sessionTitle} className="w-full bg-slate-900 text-white py-5 rounded-[1.5rem] font-black text-lg hover:bg-slate-800 transition disabled:opacity-20 shadow-xl">{t('sessions.save_btn')}</button>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-emerald-600 p-8 rounded-[2.5rem] shadow-xl text-white h-fit">
                <h3 className="text-xl font-black mb-4">{t('sessions.library')}</h3>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {games.map(game => (
                    <div key={game.id} className="p-4 bg-white/10 border border-white/10 rounded-2xl hover:bg-white hover:text-emerald-600 transition cursor-pointer group flex justify-between items-center" onClick={() => addGameToSession(game)}>
                      <div><div className="font-bold text-sm">{game.title}</div><div className="text-[9px] opacity-60 uppercase">{game.durationMin} min</div></div>
                      <Plus size={16} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

       {selectedSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-[3rem] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-10 bg-slate-900 text-white relative">
              <button onClick={() => setSelectedSession(null)} className="absolute top-8 right-8 p-2 bg-white/10 rounded-full"><X size={24} /></button>
              <h2 className="text-3xl font-black">{selectedSession.title}</h2>
              <p className="text-slate-400 mt-2 font-medium">{new Date(selectedSession.date).toLocaleDateString()}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-8">
              <div className="space-y-3">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sessions.form.desc')}</h3>
                 <p className="text-slate-600 bg-slate-50 p-6 rounded-3xl border border-slate-100">{selectedSession.description}</p>
              </div>
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sessions.timeline')}</h3>
                {selectedSession.items.map((item, idx) => {
                  const game = games.find(g => g.id === item.gameId);
                  return (
                    <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-start gap-4">
                       <div className="bg-emerald-50 text-emerald-600 w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0">{idx + 1}</div>
                       <div className="flex-1">
                         <h4 className="font-black text-slate-800 text-lg">{game?.title || 'Deleted Drill'}</h4>
                         <div className="text-[9px] font-black text-slate-400 uppercase">{item.durationMin} min</div>
                       </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionsView;
