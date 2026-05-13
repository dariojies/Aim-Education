
import React, { createContext, useState, useContext, ReactNode } from 'react';

type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  currency: string;
  price: string;
}

const translations: Record<string, Record<Language, string>> = {
  // App General
  'app.name': { en: 'AIM', es: 'AIM' },
  'app.desc': { en: 'Pro Coach Suite', es: 'Panel Pro para Entrenadores' },
  'nav.dashboard': { en: 'Overview', es: 'Resumen' },
  'nav.students': { en: 'Teams & Lists', es: 'Equipos & Lista' },
  'nav.games': { en: 'Library', es: 'Biblioteca' },
  'nav.sessions': { en: 'Planning', es: 'Calendario' },
  'nav.settings': { en: 'Settings', es: 'Ajustes' },
  'nav.aicoach': { en: 'AI Assistant', es: 'Asistente IA' },
  'nav.wallet': { en: 'Wallet', es: 'Monedero' },
  'nav.apps': { en: 'Apps', es: 'Aplicaciones' },
  
  // Apps Ecosystem
  'apps.title': { en: 'Apps Ecosystem', es: 'Ecosistema de Apps' },
  'apps.desc': { en: 'Manage your connected platforms', es: 'Tus plataformas conectadas' },
  'apps.open': { en: 'Open App', es: 'Abrir App' },
  
  // Premium
  'premium.title': { en: 'Upgrade to Coach Pro', es: 'Pásate a Coach Pro' },
  'premium.desc': { en: 'Unlock the full power of Artificial Intelligence for your club.', es: 'Desbloquea todo el poder de la Inteligencia Artificial para tu club.' },
  'premium.price.val': { en: '$9.99', es: '9,99€' },
  'premium.price.period': { en: '/mo', es: '/mes' },
  'premium.feature.ai_chat': { en: 'Unlimited AI Strategy Consultations', es: 'Consultas de Estrategia IA Ilimitadas' },
  'premium.feature.ai_drills': { en: 'AI-Powered Drill Generation', es: 'Generación de Ejercicios por IA' },
  'premium.feature.sync': { en: 'Advanced Cloud Data Sync', es: 'Sincronización Avanzada en la Nube' },
  'premium.feature.analytics': { en: 'Professional Team Analytics', es: 'Analíticas Profesionales de Equipo' },
  'premium.cta': { en: 'Subscribe Now', es: 'Suscribirse Ahora' },
  'premium.status.free': { en: 'Free Version', es: 'Versión Gratuita' },
  'premium.status.pro': { en: 'Coach Pro Active', es: 'Plan Pro Activo' },
  'premium.billing': { en: 'Subscription & Billing', es: 'Suscripción y Facturación' },
  'premium.manage': { en: 'Manage Plan', es: 'Gestionar Plan' },
  'premium.locked': { en: 'Feature Locked', es: 'Función Bloqueada' },

  // Checkout
  'pay.title': { en: 'Secure Checkout', es: 'Pago Seguro' },
  'pay.card_holder': { en: 'Card Holder Name', es: 'Nombre en la tarjeta' },
  'pay.card_number': { en: 'Card Number', es: 'Número de tarjeta' },
  'pay.expiry': { en: 'Expiry (MM/YY)', es: 'Caducidad (MM/AA)' },
  'pay.cvc': { en: 'CVC', es: 'CVC' },
  'pay.processing': { en: 'Processing secure payment...', es: 'Procesando pago seguro...' },
  'pay.success': { en: 'Payment Successful!', es: '¡Pago completado con éxito!' },
  'pay.btn': { en: 'Confirm Payment', es: 'Confirmar Pago' },

  // AI Coach (Gated)
  'ai.title': { en: 'AI Sports Consultant', es: 'Consultor Deportivo IA' },
  'ai.subtitle': { en: 'Expert analysis of your club data', es: 'Análisis experto de los datos de tu club' },
  'ai.ph': { en: 'Ask me anything about your team or drills...', es: 'Pregúntame lo que quieras sobre tu equipo o ejercicios...' },
  'ai.suggest.plan': { en: 'Create a monthly plan', es: 'Crear plan mensual' },
  'ai.suggest.analyze': { en: 'Analyze attendance', es: 'Analizar asistencia' },
  'ai.suggest.drills': { en: 'Missing drills?', es: '¿Qué ejercicios me faltan?' },
  'ai.welcome': { en: 'Hello! I am your AI Assistant. I have analyzed your current data. How can I help you manage your sessions today?', es: '¡Hola! Soy tu Asistente IA. He analizado tus datos actuales. ¿Cómo puedo ayudarte a gestionar tus sesiones hoy?' },
  'ai.thinking': { en: 'Analyzing data...', es: 'Analizando datos...' },

  // Dashboard
  'dash.welcome': { en: 'Hello Coach! 👋', es: '¡Hola Coach! 👋' },
  'dash.summary': { en: 'Managing {sport}. You have {count} students in {groups} groups.', es: 'Gestionando {sport}. Tienes {count} alumnos en {groups} grupos.' },
  'dash.quick_reg': { en: 'Quick Actions', es: 'Acciones Rápidas' },
  'dash.quick_desc': { en: 'Manage your training and attendance quickly.', es: 'Gestiona tus entrenamientos y asistencia de forma rápida.' },
  'dash.plan_session': { en: 'Plan Session', es: 'Planificar Sesión' },
  'dash.add_student': { en: 'Add Student', es: 'Añadir Alumno' },
  'dash.actions': { en: 'Suggested Actions', es: 'Acciones Sugeridas' },
  'dash.take_attendance': { en: 'Take Attendance', es: 'Pasar lista de hoy' },
  'dash.ai_gen': { en: 'Consult with IA', es: 'Consultar con IA' },
  'dash.stat.students': { en: 'Students', es: 'Alumnos' },
  'dash.stat.groups': { en: 'Groups', es: 'Grupos' },
  'dash.stat.drills': { en: 'Drills', es: 'Ejercicios' },
  'dash.stat.sessions': { en: 'Sessions', es: 'Sesiones' },

  'common.details': { en: 'Details', es: 'Detalles' },
  'common.edit': { en: 'Edit', es: 'Editar' },
  'common.update': { en: 'Update', es: 'Actualizar' },
  'common.cancel': { en: 'Cancel', es: 'Cancelar' },
  'common.close': { en: 'Close', es: 'Cerrar' },
  'common.delete': { en: 'Delete', es: 'Eliminar' },
  'common.save': { en: 'Save', es: 'Guardar' },
  'common.create': { en: 'Create', es: 'Crear' },
  'common.loading': { en: 'Loading...', es: 'Cargando...' },
  'common.syncing': { en: 'Syncing...', es: 'Sincronizando...' },
  'groups.title': { en: 'Your Groups', es: 'Tus Grupos' },
  'groups.subtitle': { en: 'Manage categories and schedules', es: 'Gestiona categorías y horarios' },
  'groups.new': { en: 'New Group', es: 'Nuevo Grupo' },
  'groups.search_ph': { en: 'Search group...', es: 'Buscar grupo...' },
  'groups.no_matches': { en: 'No groups match your search.', es: 'No hay grupos que coincidan.' },
  'students.title': { en: 'Students', es: 'Alumnos' },
  'students.registered': { en: 'registered students', es: 'alumnos registrados' },
  'students.new_btn': { en: 'New', es: 'Nuevo' },
  'students.list': { en: 'Students List', es: 'Lista de Alumnos' },
  'students.attendance': { en: 'Attendance', es: 'Asistencia' },
  'students.history': { en: 'History', es: 'Historial' },
  'students.table.student': { en: 'Student', es: 'Alumno' },
  'students.table.position': { en: 'Position', es: 'Posición' },
  'students.table.att_rate': { en: 'Attendance (%)', es: 'Asistencia (%)' },
  'students.table.contact': { en: 'Contact', es: 'Contacto' },
  'students.table.actions': { en: 'Actions', es: 'Acciones' },
  'students.table.empty': { en: 'No students in this group.', es: 'No hay alumnos en este grupo.' },
  'students.att.title': { en: 'Take Attendance', es: 'Toma de Asistencia' },
  'students.att.desc': { en: 'Mark students present for today\'s training', es: 'Marca los alumnos presentes en el entrenamiento de hoy' },
  'students.att.present': { en: 'Present', es: 'Presente' },
  'students.att.absent': { en: 'Absent', es: 'Ausente' },
  'students.att.no_students': { en: 'Select a group with students to take attendance.', es: 'Selecciona un grupo con alumnos para pasar lista.' },
  'students.att.notes': { en: 'Training notes', es: 'Notas del entrenamiento' },
  'students.att.notes_ph': { en: 'E.g.: Worked on high pressure...', es: 'Ej: Trabajamos la presión alta...' },
  'students.att.confirm': { en: 'CONFIRM ATTENDANCE', es: 'CONFIRMAR ASISTENCIA' },
  'students.att.saved': { en: 'ATTENDANCE SAVED!', es: '¡LISTA GUARDADA!' },
  'students.hist.title': { en: 'Session History', es: 'Historial de Sesiones' },
  'students.hist.group_deleted': { en: 'Deleted Group', es: 'Grupo Eliminado' },
  'students.hist.no_notes': { en: 'No notes', es: 'Sin notas' },
  'students.hist.details': { en: 'View Detail', es: 'Ver Detalle' },
  'students.hist.empty': { en: 'No previous records.', es: 'No hay registros previos.' },
  'modal.group.title': { en: 'New Group', es: 'Nuevo Grupo' },
  'modal.group.name': { en: 'Category Name', es: 'Nombre de la categoría' },
  'modal.group.level': { en: 'Level / Age Range', es: 'Nivel / Rango de edad' },
  'modal.group.desc': { en: 'Notes / Schedule', es: 'Observaciones / Horario' },
  'modal.group.btn': { en: 'CREATE CATEGORY', es: 'CREAR CATEGORÍA' },
  'modal.student.title': { en: 'Student Registration', es: 'Registro de Alumno' },
  'modal.student.first': { en: 'First Name', es: 'Nombre' },
  'modal.student.last': { en: 'Last Name', es: 'Apellidos' },
  'modal.student.age': { en: 'Age', es: 'Edad' },
  'modal.student.group': { en: '-- Group / Category --', es: '-- Grupo / Categoría --' },
  'modal.student.pos': { en: 'Position', es: 'Posición' },
  'modal.student.contact': { en: 'Emergency Contact (Phone)', es: 'Teléfono de Emergencia' },
  'modal.student.btn': { en: 'SAVE FILE', es: 'GUARDAR FICHA' },
  'sessions.title': { en: 'Training Sessions', es: 'Entrenamientos' },
  'sessions.create': { en: 'Create Session', es: 'Nueva Sesión' },
  'sessions.history': { en: 'History', es: 'Historial' },
  'sessions.form.title': { en: 'Session Title', es: 'Título de la Sesión' },
  'sessions.form.group': { en: 'Assigned Group', es: 'Grupo Asignado' },
  'sessions.form.date': { en: 'Date', es: 'Fecha' },
  'sessions.form.desc': { en: 'Session Objectives', es: 'Objetivos de la sesión' },
  'sessions.timeline': { en: 'Timeline', es: 'Línea de Tiempo' },
  'sessions.library': { en: 'Your Library', es: 'Tu Biblioteca' },
  'sessions.save_btn': { en: 'SAVE TRAINING', es: 'GUARDAR ENTRENAMIENTO' },
  'sessions.empty': { en: 'No sessions planned yet.', es: 'No hay sesiones planificadas aún.' },
  'games.library': { en: 'Library', es: 'Biblioteca' },
  'games.create': { en: 'New Drill', es: 'Nuevo Ejercicio' },
  'games.ai.title': { en: 'AI Assistant', es: 'Asistente IA' },
  'games.ai.desc': { en: 'Tell the AI what you want to work on and it will design a drill for you.', es: 'Dile a la IA qué quieres trabajar y diseñará un ejercicio para ti.' },
  'games.ai.placeholder': { en: 'E.g.: Ball control drills for kids...', es: 'Ej: Ejercicios de control de balón para niños...' },
  'games.ai.btn': { en: 'Generate', es: 'Generar' },
  'games.ai.thinking': { en: 'Thinking...', es: 'Pensando...' },
  'settings.title': { en: 'App Settings', es: 'Configuración de la App' },
  'settings.sport_label': { en: 'Active Sport', es: 'Deporte Activo' },
  'settings.sport_help': { en: 'This will adjust how the AI generates drills and the overall app context.', es: 'Esto ajustará cómo la IA genera los ejercicios y el contexto general de la app.' },
  'settings.color_label': { en: 'Primary Color', es: 'Color Principal' },
  'settings.save_btn': { en: 'Save Changes', es: 'Guardar Cambios' },
  'settings.saved_msg': { en: 'Settings Saved!', es: '¡Configuración Guardada!' },
  'settings.backend_title': { en: 'Backend Connectivity', es: 'Conectividad con Backend' },
  'settings.backend_desc': { en: 'This application is ready to connect with a PostgreSQL database through a Django API.', es: 'Esta aplicación está preparada para conectarse con una base de datos PostgreSQL a través de una API de Django.' },
  'cat.General': { en: 'General', es: 'General' },
  'cat.Warm Up': { en: 'Warm Up', es: 'Calentamiento' },
  'cat.Technical': { en: 'Technical', es: 'Técnico' },
  'cat.Tactical': { en: 'Tactical', es: 'Táctico' },
  'cat.Physical': { en: 'Physical', es: 'Físico' },
  'diff.U5': { en: 'Infant (< 5)', es: 'Infantil (< 5)' },
  'diff.U7': { en: 'U7', es: 'U7' },
  'diff.U9': { en: 'U9', es: 'U9' },
  'diff.U12': { en: 'U12', es: 'U12' },
  'diff.U16': { en: 'U16', es: 'U16' },
  'diff.SENIOR': { en: 'Senior', es: 'Senior' },
  'diff.ALL_AGES': { en: 'All Ages', es: 'Todas las edades' },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('es');
  
  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  const currency = language === 'es' ? '€' : '$';
  const price = language === 'es' ? '9,99€' : '$9.99';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currency, price }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
