
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, MousePointer, BarChart2, Rss, FileText, Globe, Send, X, ChevronLeft, ChevronDown, TrendingUp, Newspaper, ExternalLink, Copy, Check } from 'lucide-react';
import { Post } from '../types';

type Mode = 'list' | 'editor' | 'stats';

const CATEGORIES: Record<string, string> = {
  general: 'General',
  club: 'Noticias del Club',
  taekwondo: 'Taekwondo',
  ballet: 'Ballet',
  ingles: 'Inglés',
  robotica: 'Robótica',
  competicion: 'Competición',
  shelfie: 'Shelfie',
};

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
};

const emptyForm = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  cover_image_url: '',
  category: 'general',
  status: 'draft' as 'draft' | 'published',
};

interface StatsData {
  totalViews: number;
  totalClicks: number;
  publishedPosts: number;
  draftPosts: number;
  topPost: { title: string; slug: string; view_count: number } | null;
  recentViews: { date: string; count: number }[];
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const NewsView: React.FC = () => {
  const [mode, setMode] = useState<Mode>('list');
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showFeeds, setShowFeeds] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState<string | null>(null);

  useEffect(() => { fetchPosts(); }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/posts');
      if (!res.ok) throw new Error('Error cargando entradas');
      setPosts(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/posts/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const openEditor = (post?: Post) => {
    if (post) {
      setEditingPost(post);
      setForm({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || '',
        content: post.content,
        cover_image_url: post.cover_image_url || '',
        category: post.category,
        status: post.status,
      });
    } else {
      setEditingPost(null);
      setForm(emptyForm);
    }
    setError(null);
    setMode('editor');
  };

  const handleTitleChange = (title: string) => {
    setForm(f => ({
      ...f,
      title,
      slug: editingPost ? f.slug : slugify(title),
    }));
  };

  const handleSave = async (targetStatus?: 'draft' | 'published') => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('El título y el contenido son obligatorios.');
      return;
    }
    setSaveLoading(true);
    setError(null);
    const body = { ...form, status: targetStatus ?? form.status };
    try {
      const url = editingPost ? `/api/admin/posts/${editingPost.id}` : '/api/admin/posts';
      const method = editingPost ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar.');
      await fetchPosts();
      setMode('list');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
      setPosts(ps => ps.filter(p => p.id !== id));
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openStats = () => {
    fetchStats();
    setMode('stats');
  };

  const RSS_FEEDS = [
    { path: '/feed.xml',            label: 'Anuncios generales', note: 'General + Club — todos los suscriptores' },
    { path: '/feed/taekwondo.xml',  label: 'Taekwondo',          note: 'Solo categoría Taekwondo' },
    { path: '/feed/ballet.xml',     label: 'Ballet',             note: 'Solo categoría Ballet' },
    { path: '/feed/ingles.xml',     label: 'Inglés',             note: 'Solo categoría Inglés' },
    { path: '/feed/robotica.xml',   label: 'Robótica',           note: 'Solo categoría Robótica' },
    { path: '/feed/competicion.xml',label: 'Competición',        note: 'Solo categoría Competición' },
    { path: '/feed/shelfie.xml',    label: 'Shelfie',            note: 'Solo categoría Shelfie' },
    { path: '/feed/todo.xml',       label: 'Todo',               note: 'Todas las categorías' },
  ];

  const copyFeed = (path: string) => {
    const url = window.location.origin + path;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedFeed(path);
      setTimeout(() => setCopiedFeed(null), 2000);
    });
  };

  const filtered = posts.filter(p =>
    filter === 'all' ? true : p.status === filter
  );

  // ─── STATS VIEW ─────────────────────────────────────────────────────────────
  if (mode === 'stats') {
    const maxViews = stats?.recentViews.length
      ? Math.max(...stats.recentViews.map(d => Number(d.count)), 1)
      : 1;

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <button onClick={() => setMode('list')} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Estadísticas del Foro</h3>
        </div>

        {!stats ? (
          <p className="text-slate-400 text-center py-12">Cargando estadísticas...</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Visitas totales', value: stats.totalViews, icon: <Eye size={20} />, color: 'emerald' },
                { label: 'Clicks RSS/Lista', value: stats.totalClicks, icon: <MousePointer size={20} />, color: 'blue' },
                { label: 'Publicadas', value: stats.publishedPosts, icon: <Globe size={20} />, color: 'green' },
                { label: 'Borradores', value: stats.draftPosts, icon: <FileText size={20} />, color: 'amber' },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <div className={`w-10 h-10 rounded-xl bg-${card.color}-50 text-${card.color}-600 flex items-center justify-center mb-3`}>
                    {card.icon}
                  </div>
                  <p className="text-2xl font-black text-slate-900">{card.value.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Top post */}
            {stats.topPost && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} className="text-emerald-600" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Entrada más vista</span>
                </div>
                <p className="font-black text-slate-900 text-lg">{stats.topPost.title}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-sm text-slate-400">{stats.topPost.view_count} visitas</span>
                  <a href={`/noticias/${stats.topPost.slug}`} target="_blank" rel="noreferrer"
                    className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                    Ver <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}

            {/* Recent views chart */}
            {stats.recentViews.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart2 size={16} className="text-emerald-600" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Visitas últimos 14 días</span>
                </div>
                <div className="space-y-3">
                  {stats.recentViews.map(day => (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-24 shrink-0">
                        {new Date(day.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div
                          className="bg-emerald-500 rounded-full h-2 transition-all"
                          style={{ width: `${(Number(day.count) / maxViews) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-black text-slate-600 w-6 text-right">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RSS info */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Rss size={20} className="text-orange-600" />
                </div>
                <div>
                  <p className="font-black text-slate-900 text-sm">Feeds RSS activos</p>
                  <p className="text-slate-500 text-xs mt-1">Los suscriptores reciben actualizaciones automáticamente por categoría. Comparte los enlaces correspondientes.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { path: '/feed.xml', label: 'Anuncios generales' },
                  { path: '/feed/taekwondo.xml', label: 'Taekwondo' },
                  { path: '/feed/ballet.xml', label: 'Ballet' },
                  { path: '/feed/ingles.xml', label: 'Inglés' },
                  { path: '/feed/robotica.xml', label: 'Robótica' },
                  { path: '/feed/competicion.xml', label: 'Competición' },
                  { path: '/feed/shelfie.xml', label: 'Shelfie' },
                  { path: '/feed/todo.xml', label: 'Todo' },
                ].map(({ path, label }) => (
                  <a key={path} href={path} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-orange-200 rounded-full text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors">
                    {label} <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── EDITOR VIEW ─────────────────────────────────────────────────────────────
  if (mode === 'editor') {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setMode('list')} className="p-2 hover:bg-slate-100 rounded-xl transition">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">
            {editingPost ? 'Editar entrada' : 'Nueva entrada'}
          </h3>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-700 font-bold flex items-start gap-2">
            <X size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Título *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Ej: Resultados del campeonato regional de Taekwondo"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
            />
          </div>

          {/* Slug + Category in row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Slug (URL)</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
              />
              <p className="text-xs text-slate-400">/noticias/<span className="text-emerald-600">{form.slug || '...'}</span></p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Categoría</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cover image URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-600 uppercase tracking-wider">URL de imagen de portada</label>
            <input
              type="url"
              value={form.cover_image_url}
              onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
            />
          </div>

          {/* Excerpt */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Resumen (para RSS y listados)</label>
            <textarea
              value={form.excerpt}
              onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
              rows={2}
              placeholder="Breve descripción de la noticia..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-600 uppercase tracking-wider">Contenido *</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={14}
              placeholder="Escribe aquí el contenido completo de la noticia..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
            />
            <p className="text-xs text-slate-400">Formato: <code className="bg-slate-100 px-1 rounded">**negrita**</code> · <code className="bg-slate-100 px-1 rounded">*cursiva*</code> · <code className="bg-slate-100 px-1 rounded"># Título</code> · <code className="bg-slate-100 px-1 rounded">## Subtítulo</code></p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={() => handleSave('published')}
              disabled={saveLoading}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Globe size={16} /> Publicar
            </button>
            <button
              onClick={() => handleSave('draft')}
              disabled={saveLoading}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-700 text-white rounded-xl font-black text-sm transition disabled:opacity-50"
            >
              <FileText size={16} /> Guardar borrador
            </button>
            <button
              onClick={() => setMode('list')}
              className="px-5 py-3 text-slate-500 hover:text-slate-900 rounded-xl font-bold text-sm transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── LIST VIEW ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {(['all', 'published', 'draft'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400'}`}
            >
              {f === 'all' ? 'Todas' : f === 'published' ? 'Publicadas' : 'Borradores'}
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${filter === f ? 'bg-white/20' : 'bg-slate-100'}`}>
                {f === 'all' ? posts.length : posts.filter(p => p.status === f).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {/* RSS feeds dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFeeds(v => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black border transition ${showFeeds ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100'}`}
            >
              <Rss size={14} /> Feeds RSS <ChevronDown size={12} className={`transition-transform duration-200 ${showFeeds ? 'rotate-180' : ''}`} />
            </button>
            {showFeeds && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFeeds(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-100 shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Rss size={14} className="text-orange-500" />
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Feeds RSS disponibles</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {RSS_FEEDS.map(feed => (
                      <div key={feed.path} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 group">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900">{feed.label}</p>
                          <p className="text-[11px] text-slate-400 truncate">{feed.path}</p>
                          <p className="text-[11px] text-slate-400">{feed.note}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-3 shrink-0">
                          <button
                            onClick={() => copyFeed(feed.path)}
                            title="Copiar URL"
                            className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-300 hover:text-orange-500 transition"
                          >
                            {copiedFeed === feed.path ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                          </button>
                          <a href={feed.path} target="_blank" rel="noreferrer"
                            title="Abrir XML"
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-300 hover:text-emerald-500 transition">
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={openStats}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-black hover:bg-slate-200 transition">
            <BarChart2 size={14} /> Estadísticas
          </button>
          <button onClick={() => openEditor()}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black transition shadow-lg shadow-emerald-500/20">
            <Plus size={16} /> Nueva entrada
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">Cargando entradas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
          <Newspaper size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold">
            {filter === 'all' ? 'Aún no hay entradas. ¡Crea la primera!' : `No hay entradas con estado "${filter}".`}
          </p>
          {filter === 'all' && (
            <button onClick={() => openEditor()} className="mt-4 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black hover:bg-emerald-500 transition">
              Crear entrada
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {filtered.map(post => (
              <div key={post.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition group">
                {/* Cover thumbnail */}
                <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500">
                  {post.cover_image_url && (
                    <img src={post.cover_image_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_BADGE[post.status]}`}>
                      {post.status === 'published' ? 'PUBLICADA' : 'BORRADOR'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {CATEGORIES[post.category] || post.category}
                    </span>
                  </div>
                  <p className="font-black text-slate-900 text-sm truncate">{post.title}</p>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Eye size={11} /> {post.view_count}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <MousePointer size={11} /> {post.click_count}
                    </span>
                    {post.views_last_7d !== undefined && Number(post.views_last_7d) > 0 && (
                      <span className="text-xs text-emerald-600 font-bold">+{post.views_last_7d} esta semana</span>
                    )}
                    <span className="text-xs text-slate-300">
                      {new Date(post.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  {post.status === 'published' && (
                    <a href={`/noticias/${post.slug}`} target="_blank" rel="noreferrer"
                      className="p-2 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-xl transition" title="Ver publicada">
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button onClick={() => openEditor(post)}
                    className="p-2 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition" title="Editar">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => setDeleteConfirm(post.id)}
                    className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
            <h4 className="font-black text-slate-900 text-lg mb-2">¿Eliminar esta entrada?</h4>
            <p className="text-slate-500 text-sm mb-6">Esta acción no se puede deshacer. Los datos de visitas también se eliminarán.</p>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-sm transition">
                Sí, eliminar
              </button>
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-sm transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsView;
