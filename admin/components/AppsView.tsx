import React from 'react';
import { ExternalLink, Dumbbell, AppWindow } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

interface ConnectedApp {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  colorClass: string;
}

const AppsView: React.FC = () => {
  const { t } = useLanguage();

  const connectedApps: ConnectedApp[] = [
    {
      id: 'aim-training',
      name: 'Aim Training',
      description: 'Plataforma completa de entrenamiento para alumnos y entrenadores.',
      url: 'https://entrenamiento.aimeducation.es',
      icon: <Dumbbell size={32} />,
      colorClass: 'bg-emerald-600'
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
            <AppWindow size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">{t('apps.title')}</h2>
            <p className="text-slate-500 font-medium">{t('apps.desc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connectedApps.map((app) => (
            <div key={app.id} className="group relative bg-slate-50 rounded-[2rem] p-8 border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg ${app.colorClass}`}>
                {app.icon}
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">{app.name}</h3>
              <p className="text-slate-500 text-sm mb-8 font-medium leading-relaxed">
                {app.description}
              </p>
              
              <a 
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                {t('apps.open')} <ExternalLink size={16} />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AppsView;
