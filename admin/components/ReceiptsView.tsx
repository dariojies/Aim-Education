import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Trash2, ExternalLink, Calendar, Building2, CreditCard, Banknote, Landmark, X } from 'lucide-react';
import { Receipt } from '../types';
import * as storage from '../services/storage';
import { useLanguage } from '../LanguageContext';

const ReceiptsView: React.FC = () => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  const [formData, setFormData] = useState<Partial<Receipt>>({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    paymentMethod: 'Transferencia',
    company: '',
    invoiceLink: ''
  });

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    const data = await storage.getReceipts();
    setReceipts(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company || !formData.amount || !formData.date || !formData.paymentMethod) return;

    await storage.addReceipt(formData as Receipt);
    setShowForm(false);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: 0,
      paymentMethod: 'Transferencia',
      company: '',
      invoiceLink: ''
    });
    loadReceipts();
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Seguro que deseas eliminar este recibo?')) {
      await storage.removeReceipt(id);
      loadReceipts();
    }
  };

  const filteredReceipts = receipts.filter(r =>
    r.company.toLowerCase().includes(search.toLowerCase()) ||
    r.paymentMethod.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filteredReceipts.reduce((sum, r) => sum + r.amount, 0);

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'Tarjeta': return <CreditCard size={18} className="text-blue-500" />;
      case 'Transferencia': return <Landmark size={18} className="text-emerald-500" />;
      case 'Efectivo': return <Banknote size={18} className="text-emerald-600" />;
      default: return <CreditCard size={18} />;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-2xl text-white shadow-lg"><FileText size={24} /></div>
            Recibos y Facturas
          </h2>
          <p className="text-slate-500 font-medium">Gestiona y registra todos los pagos emitidos.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-xl shadow-slate-900/20"
        >
          <Plus size={20} /> Nuevo Recibo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-slate-100 p-4 rounded-2xl text-slate-500"><FileText size={24} /></div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Recibos</p>
            <p className="text-3xl font-black text-slate-900">{filteredReceipts.length}</p>
          </div>
        </div>
        <div className="bg-emerald-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-600/20 flex items-center gap-4 md:col-span-2">
          <div className="bg-emerald-500/50 p-4 rounded-2xl"><Banknote size={24} /></div>
          <div>
            <p className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Importe Total Registrado</p>
            <p className="text-3xl font-black tracking-tighter">{totalAmount.toFixed(2)} €</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-xl font-black text-slate-800">Historial de Pagos</h3>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por empresa o método..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Empresa / Beneficiario</th>
                <th className="px-6 py-4">Método de Pago</th>
                <th className="px-6 py-4">Importe</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReceipts.map(receipt => (
                <tr key={receipt.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-500 flex items-center gap-2">
                    <Calendar size={14} /> {new Date(receipt.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-900 flex items-center gap-2">
                    <Building2 size={16} className="text-slate-400" /> {receipt.company}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">
                    <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-slate-200 w-fit">
                      {getPaymentIcon(receipt.paymentMethod)}
                      {receipt.paymentMethod}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-black text-slate-900 text-base">
                    {receipt.amount.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 flex items-center justify-end gap-2">
                    {receipt.invoiceLink && (
                      <a href={receipt.invoiceLink} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Ver Factura">
                        <ExternalLink size={18} />
                      </a>
                    )}
                    <button onClick={() => handleDelete(receipt.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                    No se han encontrado recibos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal del Formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900">Registrar Nuevo Recibo</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 bg-white rounded-full p-2 border border-slate-200 shadow-sm"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha del Recibo</label>
                  <input type="date" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Importe (€)</label>
                  <input type="number" step="0.01" min="0" required value={formData.amount || ''} onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-emerald-600 outline-none focus:border-emerald-500" placeholder="0.00" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa / Beneficiario</label>
                <input type="text" required value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500" placeholder="Ej. Material Deportivo S.L." />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método de Pago</label>
                <select required value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500">
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Tarjeta">Tarjeta de Crédito/Débito</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">Enlace a Factura/Recibo <span className="text-slate-300 normal-case tracking-normal">(Opcional)</span></label>
                <input type="url" value={formData.invoiceLink} onChange={(e) => setFormData({ ...formData, invoiceLink: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-500" placeholder="https://..." />
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-3.5 rounded-xl font-black text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20 transition-colors">Guardar Recibo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptsView;
