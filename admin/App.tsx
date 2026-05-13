
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Trophy, CalendarDays, Menu, X, Settings, Sparkles, ShieldCheck, Lock, Wallet, LogOut, FileText, AppWindow } from 'lucide-react';
import StudentsView from './components/StudentsView';
import GamesView from './components/GamesView';
import SessionsView from './components/SessionsView';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';
import AICoachView from './components/AICoachView';
import WalletView from './components/WalletView';
import AccessManagementView from './components/AccessManagementView';
import ReceiptsView from './components/ReceiptsView';
import AppsView from './components/AppsView';
import { Auth } from './components/Auth';
import { ViewState } from './types';
import { useLanguage } from './LanguageContext';
import * as storage from './services/storage';

const App: React.FC = () => {
  const currentUser = storage.getCurrentUser();
  const [isAuthenticated, setIsAuthenticated] = useState(!!currentUser);
  const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  const navItems = [
    { id: 'DASHBOARD', label: t('nav.dashboard'), icon: <LayoutDashboard size={20} /> },
    { id: 'STUDENTS', label: t('nav.students'), icon: <Users size={20} /> },
    { id: 'RECEIPTS', label: 'Recibos', icon: <FileText size={20} /> },
    { id: 'WALLET', label: t('nav.wallet'), icon: <Wallet size={20} /> },
    { id: 'GAMES', label: t('nav.games'), icon: <Trophy size={20} /> },
    { id: 'SESSIONS', label: t('nav.sessions'), icon: <CalendarDays size={20} /> },
    { id: 'AI_COACH', label: t('nav.aicoach'), icon: <Sparkles size={20} />, special: true },
    { id: 'APPS', label: t('nav.apps'), icon: <AppWindow size={20} /> },
    { id: 'SETTINGS', label: t('nav.settings'), icon: <Settings size={20} /> },
  ];

  if (currentUser?.isSuperAdmin) {
    navItems.push({ id: 'ACCESS_MANAGEMENT', label: 'Gestión Accesos', icon: <ShieldCheck size={20} /> });
  }

  const renderView = () => {
    switch (currentView) {
      case 'DASHBOARD': return <DashboardView onNavigate={(v) => setCurrentView(v)} />;
      case 'STUDENTS': return <StudentsView />;
      case 'GAMES': return <GamesView />;
      case 'SESSIONS': return <SessionsView />;
      case 'AI_COACH': return <AICoachView />;
      case 'SETTINGS': return <SettingsView />;
      case 'RECEIPTS': return <ReceiptsView />;
      case 'WALLET': return <WalletView />;
      case 'APPS': return <AppsView />;
      case 'ACCESS_MANAGEMENT': return <AccessManagementView />;
      default: return <DashboardView onNavigate={(v) => setCurrentView(v)} />;
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  if (!isAuthenticated) {
    return <Auth onLogin={() => setIsAuthenticated(true)} />;
  }

  // Si el usuario está autenticado pero NO tiene permisos de administrador
  if (!currentUser?.canAccessAdmin) {
    window.location.replace('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="font-black text-xl flex items-center gap-2 text-slate-900 tracking-tighter">
          <div className="bg-slate-900 text-white p-1 rounded-lg"><Trophy size={18} /></div>
          {t('app.name')}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleLanguage} className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase">
            {language}
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-slate-900 text-white rounded-xl">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`${mobileMenuOpen ? 'fixed inset-0 bg-white z-[100]' : 'hidden'} md:block w-full md:w-72 bg-white flex-shrink-0 transition-all duration-300 md:h-screen sticky top-0 border-r border-slate-100 shadow-sm`}>
        <div className="p-8 hidden md:block border-b border-slate-50 mb-6">
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tighter">
            <div className="bg-emerald-600 p-2 rounded-2xl shadow-lg shadow-emerald-100"><Trophy size={28} className="text-white" /></div>
            {t('app.name')}
          </h1>
          <p className="text-[10px] text-slate-400 mt-2 uppercase font-black tracking-[0.2em]">{t('app.desc')}</p>
        </div>

        <nav className="px-4 py-2 space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as ViewState);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-[1.5rem] transition-all duration-300 group
                ${currentView === item.id
                  ? 'bg-slate-900 text-white shadow-2xl shadow-slate-200'
                  : (item.special ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'hover:bg-slate-50 text-slate-400 hover:text-slate-900')
                }`}
            >
              <div className={`p-2 rounded-xl transition-colors ${currentView === item.id ? 'bg-emerald-500/20 text-white' : (item.special ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-emerald-600')}`}>
                {item.icon}
              </div>
              <span className="font-black text-sm tracking-tight flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </nav>


      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto h-screen scroll-smooth bg-slate-50/50">
        <div className="max-w-6xl mx-auto p-6 md:p-12">
          <header className="mb-10 flex justify-between items-end">
            <div>
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-2">Coach Dashboard</div>
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter">
                {navItems.find(i => i.id === currentView)?.label}
              </h2>
            </div>
            <button
              onClick={() => {
                storage.saveCurrentUser(null);
                setIsAuthenticated(false);
              }}
              className="text-slate-400 hover:text-red-500 transition-colors flex items-center gap-2 text-xs font-black uppercase tracking-wider"
            >
              Logout <LogOut className="w-4 h-4" />
            </button>
          </header>

          <div className="animate-fade-in">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
