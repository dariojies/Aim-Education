import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Users } from 'lucide-react';
import { Student } from '../types';
import * as storage from '../services/storage';

const AccessManagementView: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const s = await storage.getStudents();
      setStudents(s || []);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRankChange = async (studentId: string, newRank: string) => {
    // Optimistic UI update
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, accessRank: newRank } : s));
    await storage.setAccessRank(studentId, newRank);
  };

  // Only filter by search term, show all users regardless of group
  const filteredStudents = students.filter(s =>
    s.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ShieldCheck className="text-emerald-600" /> Gestión de Accesos
          </h2>
          <p className="text-slate-500 font-medium">Administra los permisos de los usuarios en la plataforma</p>
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuario o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm w-full md:w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Email</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Es Dev/SuperAdmin</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Rango (aim_education_access)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold">
                  Cargando usuarios...
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold">
                  No hay usuarios que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filteredStudents.map(student => (
                <tr key={student.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black">
                        {student.firstName?.[0] || <Users size={16} />}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{student.firstName} {student.lastName}</div>
                        <div className="text-[10px] text-slate-400 font-black uppercase">{student.position || 'Usuario'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 font-bold text-slate-600">
                    {student.email || <span className="italic text-slate-400">Sin email</span>}
                  </td>
                  <td className="px-8 py-5">
                    {student.isSuperAdmin ? (
                      <span className="font-black text-[10px] uppercase bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
                        SÍ
                      </span>
                    ) : (
                      <span className="font-bold text-[10px] uppercase text-slate-400">
                        NO
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <select
                      value={student.accessRank || ''}
                      onChange={(e) => handleRankChange(student.id, e.target.value)}
                      className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                    >
                      <option value="">-- Sin Acceso --</option>
                      <option value="student">Alumno</option>
                      <option value="instructor">Instructor</option>
                      <option value="club_owner">Admin/Propietario</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccessManagementView;
