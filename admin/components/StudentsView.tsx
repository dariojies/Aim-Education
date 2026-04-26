
import React, { useState, useEffect } from 'react';
import { 
  Plus, Users, ClipboardCheck, Trash2, CheckCircle, 
  X, FolderPlus, Layers, History, 
  UserPlus, ChevronRight, Search, Clock, Calendar, FileText,
  UserCheck, UserX, AlertCircle, Banknote, Pencil
} from 'lucide-react';
import { Student, AttendanceRecord, Group, DifficultyLevel } from '../types';
import * as storage from '../services/storage';
import { useLanguage } from '../LanguageContext';

const StudentsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'GROUPS' | 'LIST' | 'ATTENDANCE' | 'HISTORY'>('GROUPS');
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [showStudentModal, setShowStudentModal] = useState(false);
  
  const [selectedRecordDetails, setSelectedRecordDetails] = useState<AttendanceRecord | null>(null);
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<Student | null>(null);

  // Inicialización robusta para evitar errores de inputs no controlados
  const [studentForm, setStudentForm] = useState({
    firstName: '', lastName: '', age: 0, position: '', groupId: '', emergencyContact: '', active: true, monthlyFee: 25, referredById: ''
  });

  const [groupForm, setGroupForm] = useState({
    name: '', description: '', level: DifficultyLevel.ALL_AGES
  });

  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [attNotes, setAttNotes] = useState('');
  const [attendanceSaved, setAttendanceSaved] = useState(false);

  // Validación de asistencia única por día y grupo
  const alreadyTakenRecord = attendanceRecords.find(
    r => r.groupId === selectedGroupId && r.date === attendanceDate
  );

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [s, g, a] = await Promise.all([
        storage.getStudents(),
        storage.getGroups(),
        storage.getAttendance()
      ]);
      setStudents(s || []);
      setGroups(g || []);
      setAttendanceRecords(a || []);
      
      // Auto-seleccionar primer grupo si no hay uno seleccionado y hay grupos
      if (g && g.length > 0 && !selectedGroupId) {
        // Solo autoseleccionar si estamos cargando por primera vez o si el seleccionado ya no existe
        if (!selectedGroupId || !g.find(gr => gr.id === selectedGroupId)) {
            // No forzamos la selección aquí para no interferir con la navegación, 
            // pero si se borra un grupo, selectedGroupId se limpia abajo en handleDeleteGroup.
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    
    // Si estamos editando, usamos el ID existente. Si es nuevo, generamos uno.
    const newGroup: Group = {
      id: editingGroupId || storage.generateId(),
      name: groupForm.name.trim(),
      description: groupForm.description,
      level: groupForm.level,
      createdAt: editingGroupId ? (groups.find(g => g.id === editingGroupId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
    };

    try {
      await storage.addGroup(newGroup);
      resetGroupForm();
      await loadAllData();
    } catch (error) {
      console.error("Error saving group:", error);
    }
  };

  const handleEditGroup = (group: Group, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar navegar al grupo
    setGroupForm({
      name: group.name,
      description: group.description || '',
      level: group.level || DifficultyLevel.ALL_AGES
    });
    setEditingGroupId(group.id);
    setShowGroupModal(true);
  };

  const handleDeleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar navegar al grupo
    if (confirm(t('common.delete') + '?')) {
      await storage.removeGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId('');
      }
      await loadAllData();
    }
  };

  const resetGroupForm = () => {
    setGroupForm({ name: '', description: '', level: DifficultyLevel.ALL_AGES });
    setEditingGroupId(null);
    setShowGroupModal(false);
  };

  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.firstName || !studentForm.groupId) return;
    
    let referredById = '';
    const code = studentForm.referredById?.trim().toUpperCase();
    if (code) {
      const sponsor = students.find(s => s.referralCode === code);
      if (sponsor) referredById = sponsor.id;
    }

    const newStudent: Student = {
      ...studentForm,
      id: storage.generateId(),
      referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      referredById: referredById,
      active: true
    } as Student;

    await storage.addStudent(newStudent);
    setStudentForm({
      firstName: '', lastName: '', age: 0, position: '', groupId: selectedGroupId, emergencyContact: '', active: true, monthlyFee: 25, referredById: ''
    });
    setShowStudentModal(false);
    await loadAllData();
  };

  const saveAttendance = async () => {
    if (!selectedGroupId || alreadyTakenRecord) return;
    const record: AttendanceRecord = {
      id: storage.generateId(),
      date: attendanceDate,
      groupId: selectedGroupId,
      presentStudentIds: Array.from(presentIds),
      sessionNotes: attNotes
    };
    await storage.saveAttendance(record);
    setAttendanceSaved(true);
    setAttNotes('');
    setPresentIds(new Set());
    setTimeout(() => setAttendanceSaved(false), 3000);
    await loadAllData();
  };

  const toggleAttendance = (studentId: string) => {
    if (alreadyTakenRecord) return;
    const newPresentIds = new Set(presentIds);
    if (newPresentIds.has(studentId)) newPresentIds.delete(studentId);
    else newPresentIds.add(studentId);
    setPresentIds(newPresentIds);
  };

  const filteredStudents = students.filter(s => 
    s.groupId === selectedGroupId && 
    (s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
     s.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Sub Nav */}
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
        {(['GROUPS', 'LIST', 'ATTENDANCE', 'HISTORY'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-max px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-black transition ${activeTab === tab ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {tab === 'GROUPS' && <Layers size={18} />}
            {tab === 'LIST' && <Users size={18} />}
            {tab === 'ATTENDANCE' && <ClipboardCheck size={18} />}
            {tab === 'HISTORY' && <History size={18} />}
            {t(`students.${tab.toLowerCase()}`)}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'GROUPS' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800">{t('groups.title')}</h2>
                <p className="text-slate-500 font-medium">{t('groups.subtitle')}</p>
              </div>
              <button 
                onClick={() => { resetGroupForm(); setShowGroupModal(true); }} 
                className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition shadow-lg shadow-emerald-100"
              >
                <FolderPlus size={18} /> {t('groups.new')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map(group => (
                <div
                  key={group.id}
                  onClick={() => { setSelectedGroupId(group.id); setActiveTab('LIST'); }}
                  className={`p-8 rounded-[2.5rem] border text-left transition-all duration-300 group cursor-pointer relative overflow-hidden ${selectedGroupId === group.id ? 'bg-slate-900 border-slate-900 text-white shadow-2xl' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-sm'}`}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-4 rounded-2xl transition-colors ${selectedGroupId === group.id ? 'bg-emerald-500/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
                      <Users size={24} />
                    </div>
                    
                    {/* Botones de Acción (Editar/Eliminar) */}
                    <div className="flex gap-2 relative z-10">
                        <button 
                            onClick={(e) => handleEditGroup(group, e)}
                            className={`p-2 rounded-xl transition-colors ${selectedGroupId === group.id ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}
                        >
                            <Pencil size={16} />
                        </button>
                        <button 
                            onClick={(e) => handleDeleteGroup(group.id, e)}
                            className={`p-2 rounded-xl transition-colors ${selectedGroupId === group.id ? 'bg-white/10 hover:bg-white/20 text-white hover:text-rose-400' : 'bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600'}`}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mb-2">
                     <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-full ${selectedGroupId === group.id ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {t(`diff.${group.level || DifficultyLevel.ALL_AGES}`)}
                    </span>
                  </div>

                  <h3 className="text-xl font-black mb-2">{group.name}</h3>
                  <p className={`text-sm line-clamp-2 font-medium ${selectedGroupId === group.id ? 'text-slate-400' : 'text-slate-500'}`}>{group.description || "Sin descripción."}</p>
                  
                  <div className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                    <ChevronRight size={14} /> Ver equipo
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div className="col-span-full py-20 text-center text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                  <p className="font-bold">No has creado ningún grupo todavía.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'LIST' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <select 
                  value={selectedGroupId} 
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="bg-white border border-slate-200 px-4 py-3 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="" disabled>-- Seleccionar --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <h2 className="text-2xl font-black text-slate-800">{t('students.list')}</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder={t('groups.search_ph')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm"
                  />
                </div>
                <button onClick={() => setShowStudentModal(true)} className="bg-slate-900 text-white px-5 py-3 rounded-xl font-black flex items-center gap-2">
                  <UserPlus size={18} /> {t('students.new_btn')}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Alumno</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Código Referido</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Cuota</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold">
                          {groups.length === 0 ? "Primero crea un grupo en la pestaña anterior." : "No hay alumnos en este grupo."}
                        </td>
                      </tr>
                    )}
                    {filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">{student.firstName[0]}</div>
                            <div>
                              <div className="font-bold text-slate-800">{student.firstName} {student.lastName}</div>
                              <div className="text-[10px] text-slate-400 font-black uppercase">{student.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5"><span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">{student.referralCode}</span></td>
                        <td className="px-8 py-5 font-bold text-slate-600">{student.monthlyFee}€</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                             <button onClick={() => setSelectedStudentHistory(student)} className="p-2 text-slate-300 hover:text-emerald-600 transition-colors"><Clock size={18} /></button>
                             <button onClick={() => storage.removeStudent(student.id).then(loadAllData)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {activeTab === 'ATTENDANCE' && (
          <div className="space-y-6 max-w-4xl mx-auto">
             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div>
                    <h2 className="text-2xl font-black text-slate-800">Toma de Asistencia</h2>
                    <p className="text-slate-500 text-sm font-medium">Registra el entrenamiento de hoy.</p>
                 </div>
                 <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="px-4 py-3 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-600" />
               </div>

               {alreadyTakenRecord && (
                 <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex items-center gap-4 text-amber-700">
                    <AlertCircle /> 
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest">Lista ya registrada</p>
                      <p className="text-xs font-medium">Ya has pasado lista para este grupo y fecha. Puedes ver los detalles en Historial.</p>
                    </div>
                 </div>
               )}

               <div className={`space-y-4 ${alreadyTakenRecord ? 'opacity-40 pointer-events-none' : ''}`}>
                 {filteredStudents.length === 0 && (
                   <div className="py-12 text-center text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl font-bold">
                      Selecciona un grupo con alumnos para empezar.
                   </div>
                 )}
                 {filteredStudents.map(student => (
                   <div key={student.id} onClick={() => toggleAttendance(student.id)} className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all ${presentIds.has(student.id) ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'}`}>
                     <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center ${presentIds.has(student.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200'}`}>
                          {presentIds.has(student.id) && <CheckCircle size={14} />}
                        </div>
                        <span className="font-bold">{student.firstName} {student.lastName}</span>
                     </div>
                     <span className={`text-[10px] font-black uppercase tracking-widest ${presentIds.has(student.id) ? 'text-emerald-600' : 'text-slate-300'}`}>{presentIds.has(student.id) ? 'Presente' : 'Ausente'}</span>
                   </div>
                 ))}
               </div>

               <div className={`space-y-4 pt-6 border-t border-slate-50 ${alreadyTakenRecord ? 'hidden' : ''}`}>
                 <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Notas de la sesión</label>
                 <textarea 
                    value={attNotes} 
                    onChange={e => setAttNotes(e.target.value)} 
                    placeholder="Objetivos trabajados, lesionados, etc..."
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none min-h-[100px] font-medium"
                 />
                 <button 
                   onClick={saveAttendance} 
                   disabled={alreadyTakenRecord || filteredStudents.length === 0} 
                   className={`w-full py-5 rounded-[1.5rem] font-black text-white transition-all ${attendanceSaved ? 'bg-emerald-500' : 'bg-slate-900 hover:bg-emerald-600 disabled:opacity-20 shadow-xl'}`}
                 >
                   {attendanceSaved ? '¡ASISTENCIA GUARDADA!' : 'GUARDAR ASISTENCIA'}
                 </button>
               </div>
             </div>
          </div>
        )}

        {activeTab === 'HISTORY' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800">{t('students.hist.title')}</h2>
            <div className="grid grid-cols-1 gap-4">
              {attendanceRecords.length === 0 && (
                <div className="py-20 text-center text-slate-400 bg-white rounded-[2rem] border border-dashed border-slate-200">
                  <p className="font-bold">{t('students.hist.empty')}</p>
                </div>
              )}
              {attendanceRecords.slice().reverse().map(record => {
                const group = groups.find(g => g.id === record.groupId);
                return (
                  <div key={record.id} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8 group hover:shadow-lg transition">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <span className="text-[10px] font-black uppercase">{new Date(record.date).toLocaleString('default', { month: 'short' })}</span>
                        <span className="text-xl font-black">{record.date.split('-')[2]}</span>
                      </div>
                      <div>
                        <div className="flex gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded">{group?.name || "Grupo Eliminado"}</span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase rounded">{record.presentStudentIds.length} presentes</span>
                        </div>
                        <h4 className="font-bold text-slate-700 line-clamp-1">{record.sessionNotes || "Sin notas adicionales."}</h4>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedRecordDetails(record)}
                      className="px-6 py-3 bg-slate-50 text-slate-400 rounded-xl font-black text-xs uppercase hover:bg-emerald-50 hover:text-emerald-600 transition tracking-widest">
                      {t('students.hist.details')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal DETALLES ASISTENCIA */}
      {selectedRecordDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl animate-scale-in max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center shrink-0">
               <div>
                 <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Detalle de Sesión</div>
                 <h3 className="text-2xl font-black text-slate-900">{new Date(selectedRecordDetails.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</h3>
               </div>
               <button onClick={() => setSelectedRecordDetails(null)} className="p-3 hover:bg-rose-50 hover:text-rose-500 rounded-full transition"><X size={24} /></button>
            </div>
            <div className="p-8 overflow-y-auto space-y-8">
               <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                  <div className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Notas</div>
                  <p className="text-slate-700 font-medium italic">{selectedRecordDetails.sessionNotes || "Sin notas registradas."}</p>
               </div>
               <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">Alumnos Presentes ({selectedRecordDetails.presentStudentIds.length})</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {students.filter(s => s.groupId === selectedRecordDetails.groupId).map(student => {
                      const isPresent = selectedRecordDetails.presentStudentIds.includes(student.id);
                      return (
                        <div key={student.id} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${isPresent ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'}`}>
                          {isPresent ? <UserCheck size={18} /> : <UserX size={18} />}
                          <span className="font-bold">{student.firstName} {student.lastName}</span>
                        </div>
                      );
                    })}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Group Modal - CREAR O EDITAR */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-scale-in">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900">{editingGroupId ? 'Editar Categoría' : 'Crear Nuevo Grupo / Categoría'}</h3>
              <button onClick={resetGroupForm} className="p-2 hover:bg-rose-50 hover:text-rose-500 rounded-full transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-8 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nombre de la categoría</label>
                <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Ej: Benjamín A, Senior, etc." />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nivel / Rango de edad</label>
                <select className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold" value={groupForm.level} onChange={e => setGroupForm({ ...groupForm, level: e.target.value as DifficultyLevel })}>
                  {Object.values(DifficultyLevel).map(level => (
                    <option key={level} value={level}>{t(`diff.${level}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Observaciones / Horario</label>
                <textarea className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none h-24 font-medium" value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Lunes y Miércoles 17:00 a 18:30..." />
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-emerald-600 transition shadow-xl">{editingGroupId ? 'ACTUALIZAR CATEGORÍA' : 'CREAR CATEGORÍA'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Student Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-scale-in">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900">Nuevo Registro de Alumno</h3>
              <button onClick={() => setShowStudentModal(false)} className="p-2 hover:bg-rose-50 hover:text-rose-500 rounded-full transition"><X size={20} /></button>
            </div>
            <form onSubmit={handleRegisterStudent} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nombre</label>
                  <input required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={studentForm.firstName} onChange={e => setStudentForm({ ...studentForm, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Apellidos</label>
                  <input required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={studentForm.lastName} onChange={e => setStudentForm({ ...studentForm, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cuota Mensual (€)</label>
                  <div className="relative">
                    <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="number" required className="w-full pl-12 p-4 bg-slate-50 border rounded-2xl outline-none font-bold text-emerald-600" value={studentForm.monthlyFee} onChange={e => setStudentForm({ ...studentForm, monthlyFee: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Viene de (Cód. Referido)</label>
                  <input className="w-full p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl outline-none font-black uppercase placeholder-emerald-300" placeholder="Opcional" value={studentForm.referredById} onChange={e => setStudentForm({ ...studentForm, referredById: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Categoría</label>
                <select required className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={studentForm.groupId} onChange={e => setStudentForm({ ...studentForm, groupId: e.target.value })}>
                  <option value="">-- Seleccionar Grupo --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black hover:bg-emerald-600 transition shadow-xl">GUARDAR FICHA</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsView;
