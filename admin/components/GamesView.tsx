
import React, { useState, useEffect } from 'react';
import { Plus, List, Sparkles, Trash2, Clock, BarChart, Pencil, Eye, X, Lock, Trophy } from 'lucide-react';
import { Game, SportCategory, DifficultyLevel } from '../types';
import * as storage from '../services/storage';
import { generateGameIdea } from '../services/geminiService';
import { useLanguage } from '../LanguageContext';

const GamesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CREATE' | 'LIST'>('LIST');
  const [games, setGames] = useState<Game[]>([]);
  const [filterDifficulty, setFilterDifficulty] = useState<DifficultyLevel | 'ALL'>('ALL');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(storage.getSportConfig().isPremium);
  const { t, language } = useLanguage();

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Game>>({
    title: '',
    description: '',
    category: SportCategory.GENERAL,
    difficulty: DifficultyLevel.ALL_AGES,
    durationMin: 15,
    tags: []
  });

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await storage.getGames();
        setGames(data);
        setIsPremium(storage.getSportConfig().isPremium);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    
    const handleStorageUpdate = () => setIsPremium(storage.getSportConfig().isPremium);
    window.addEventListener('storage_updated', handleStorageUpdate);
    return () => window.removeEventListener('storage_updated', handleStorageUpdate);
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const newGame: Game = {
      id: editingId || storage.generateId(), 
      title: formData.title!,
      description: formData.description || '',
      category: formData.category || SportCategory.GENERAL,
      difficulty: formData.difficulty || DifficultyLevel.ALL_AGES,
      durationMin: formData.durationMin || 15,
      tags: formData.tags || []
    };

    await storage.addGame(newGame);
    resetForm();
    setRefresh(r => r + 1);
    setActiveTab('LIST');
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      title: '',
      description: '',
      category: SportCategory.GENERAL,
      difficulty: DifficultyLevel.ALL_AGES,
      durationMin: 15,
      tags: []
    });
  };

  const handleGenerateAI = async () => {
    if (!isPremium) {
       alert(t('premium.locked') + ": " + t('premium.desc'));
       return;
    }
    if (!aiPrompt) return;
    setIsGenerating(true);
    try {
      const suggestion = await generateGameIdea(aiPrompt, language);
      setFormData({
        ...formData,
        title: suggestion.title,
        description: suggestion.description,
        category: suggestion.category,
        difficulty: suggestion.difficulty,
        durationMin: suggestion.durationMin,
      });
    } catch (error) {
      alert("Failed to generate game. Please check your API Key.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (game: Game) => {
    setEditingId(game.id);
    setFormData({
      title: game.title,
      description: game.description,
      category: game.category,
      difficulty: game.difficulty,
      durationMin: game.durationMin,
      tags: game.tags
    });
    setActiveTab('CREATE');
  };

  const handleDelete = async (id: string) => {
    if(confirm('¿Seguro que quieres eliminar este ejercicio?')) {
      await storage.removeGame(id);
      setRefresh(r => r + 1);
    }
  }

  const handleTabChange = (tab: 'CREATE' | 'LIST') => {
    setActiveTab(tab);
    if (tab === 'CREATE' && !editingId) {
       resetForm();
    } else if (tab === 'LIST') {
      resetForm();
    }
  };

  const filteredGames = games.filter(g => 
    filterDifficulty === 'ALL' || (g.difficulty || DifficultyLevel.ALL_AGES) === filterDifficulty
  );

  const getDifficultyColor = (level?: DifficultyLevel) => {
    switch (level) {
      case DifficultyLevel.SENIOR: return 'bg-red-100 text-red-700 border-red-200';
      case DifficultyLevel.U16: return 'bg-orange-100 text-orange-700 border-orange-200';
      case DifficultyLevel.U12: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case DifficultyLevel.U9: return 'bg-lime-100 text-lime-700 border-lime-200';
      case DifficultyLevel.U7: return 'bg-green-100 text-green-700 border-green-200';
      case DifficultyLevel.U5: return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case DifficultyLevel.ALL_AGES: return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading && games.length === 0) {
    return <div className="p-10 text-center text-slate-400 font-bold animate-pulse">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
        <button
          onClick={() => handleTabChange('LIST')}
          className={`flex-1 min-w-max px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-black transition ${activeTab === 'LIST' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <List size={18} /> {t('games.library')}
        </button>
        <button
          onClick={() => handleTabChange('CREATE')}
          className={`flex-1 min-w-max px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-black transition ${activeTab === 'CREATE' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Plus size={18} /> {editingId ? t('common.edit') : t('games.create')}
        </button>
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'LIST' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-800">{t('games.library')} ({filteredGames.length})</h2>
              <div className="flex items-center gap-2">
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value as DifficultyLevel | 'ALL')}
                  className="p-3 border border-slate-200 rounded-xl font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">Todas las edades</option>
                  {Object.values(DifficultyLevel).map(level => (
                    <option key={level} value={level}>{t(`diff.${level}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGames.length === 0 && (
                 <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                    <p className="font-bold">No hay ejercicios que mostrar.</p>
                 </div>
              )}
              {filteredGames.map(game => (
                <div key={game.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition group flex flex-col h-full relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">
                        {t(`cat.${game.category}`)}
                      </span>
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded border ${getDifficultyColor(game.difficulty)}`}>
                        {t(`diff.${game.difficulty || DifficultyLevel.ALL_AGES}`)}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-xl font-black text-slate-800 mb-2">{game.title}</h3>
                  <p className="text-slate-500 text-sm line-clamp-3 mb-6 flex-grow">{game.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase">
                      <Clock size={14} /> {game.durationMin}m
                    </div>
                    <div className="flex gap-1">
                       <button onClick={() => setSelectedGame(game)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition"><Eye size={16} /></button>
                       <button onClick={() => handleEdit(game)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-emerald-50 hover:text-emerald-600 transition"><Pencil size={16} /></button>
                       <button onClick={() => handleDelete(game.id)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'CREATE' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {!editingId && (
                <div className={`p-8 rounded-[2.5rem] border transition shadow-xl relative overflow-hidden
                  ${isPremium ? 'bg-gradient-to-r from-slate-900 to-emerald-900 border-emerald-500/20 text-white' : 'bg-white border-slate-100 shadow-sm'}`}>
                  {!isPremium && <div className="absolute top-4 right-8 bg-emerald-600 text-white text-[9px] font-black px-2 py-1 rounded uppercase flex items-center gap-1"><Lock size={10} /> PRO FEATURE</div>}
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-2xl ${isPremium ? 'bg-emerald-500' : 'bg-slate-100 text-slate-400'}`}>
                       <Sparkles size={24} />
                    </div>
                    <div>
                       <h3 className={`text-xl font-black ${isPremium ? 'text-white' : 'text-slate-800'}`}>{t('games.ai.title')}</h3>
                       <p className={`text-sm ${isPremium ? 'text-emerald-200' : 'text-slate-400'}`}>{t('games.ai.desc')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input 
                      type="text" 
                      value={aiPrompt}
                      disabled={!isPremium}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={t('games.ai.placeholder')}
                      className={`flex-1 p-5 rounded-2xl outline-none border transition font-medium
                        ${isPremium 
                          ? 'bg-white/10 border-white/10 text-white placeholder-white/30 focus:bg-white/20' 
                          : 'bg-slate-50 border-slate-100 text-slate-300'}`}
                    />
                    <button 
                      onClick={handleGenerateAI}
                      disabled={isGenerating || !aiPrompt || !isPremium}
                      className={`px-8 py-5 rounded-2xl font-black transition flex items-center justify-center gap-2 shadow-lg
                        ${isPremium 
                          ? 'bg-white text-emerald-600 hover:scale-105' 
                          : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    >
                      {isGenerating ? t('games.ai.thinking') : t('games.ai.btn')}
                      {!isGenerating && <Sparkles size={18} />}
                    </button>
                  </div>
                </div>
              )}
              <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm space-y-6">
                <h2 className="text-2xl font-black text-slate-800">
                  {editingId ? t('common.edit') : t('games.create')}
                </h2>
                <form onSubmit={handleCreate} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Título del Ejercicio</label>
                      <input required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Duración (min)</label>
                      <input type="number" className="w-full p-4 bg-slate-50 border rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600" value={formData.durationMin} onChange={e => setFormData({ ...formData, durationMin: parseInt(e.target.value) })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Categoría</label>
                      <select className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as SportCategory })}>
                        {Object.values(SportCategory).map(cat => (
                          <option key={cat} value={cat}>{t(`cat.${cat}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Edad / Nivel</label>
                      <select className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={formData.difficulty} onChange={e => setFormData({ ...formData, difficulty: e.target.value as DifficultyLevel })}>
                        {Object.values(DifficultyLevel).map(diff => (
                          <option key={diff} value={diff}>{t(`diff.${diff}`)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Descripción y Reglas</label>
                    <textarea required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none h-40 font-medium" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                  </div>
                  <div className="pt-4 flex gap-3">
                    {editingId && (
                      <button type="button" onClick={resetForm} className="flex-1 bg-slate-100 text-slate-500 py-5 rounded-2xl font-black hover:bg-slate-200 transition">
                        {t('common.cancel')}
                      </button>
                    )}
                    <button type="submit" className="flex-[2] bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition shadow-xl">
                      {editingId ? t('common.update') : 'Guardar Ejercicio'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div className="hidden lg:block space-y-6 text-center p-10 bg-emerald-50 rounded-[3rem] border border-emerald-100">
               <Trophy size={64} className="mx-auto text-emerald-600 mb-4" />
               <h4 className="text-xl font-black text-emerald-900 italic">"Los grandes entrenadores nunca dejan de aprender ejercicios."</h4>
            </div>
          </div>
        )}
      </div>
      {selectedGame && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[3rem] max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-100">
            <div className="p-10 border-b border-slate-50 flex justify-between items-start sticky top-0 bg-white z-10">
              <div>
                <div className="flex gap-2 mb-3">
                   <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 px-2 py-1 rounded text-slate-500">{t(`cat.${selectedGame.category}`)}</span>
                   <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${getDifficultyColor(selectedGame.difficulty)}`}>{t(`diff.${selectedGame.difficulty || DifficultyLevel.ALL_AGES}`)}</span>
                </div>
                <h2 className="text-3xl font-black text-slate-900">{selectedGame.title}</h2>
              </div>
              <button onClick={() => setSelectedGame(null)} className="p-3 bg-slate-50 rounded-full hover:bg-rose-50 hover:text-rose-500 transition"><X size={24} /></button>
            </div>
            <div className="p-10 overflow-y-auto space-y-8">
              <div className="flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-[0.2em]"><Clock size={16} /> {selectedGame.durationMin} minutos</div>
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Instrucciones y Desarrollo</h3>
                 <div className="text-slate-700 leading-relaxed font-medium bg-slate-50 p-8 rounded-[2rem] border border-slate-100 whitespace-pre-wrap">{selectedGame.description}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamesView;
