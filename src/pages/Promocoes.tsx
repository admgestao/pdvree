import { useState, useEffect } from 'react';
import { Tag, Plus, Pencil, Trash2, X, Save, Search } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Promocao {
  id: string;
  produto_id: string;
  preco_promocional: number;
  data_inicio: string;
  data_fim: string;
}

interface ProdutoSimple {
  id: string;
  nome: string;
  preco_venda: number;
}

const empty: Partial<Promocao> = {
  produto_id: '', preco_promocional: 0,
  data_inicio: '', data_fim: '',
};

export default function Promocoes() {
  const { user, isAdmin } = useAuth();
  const [promocoes, setPromocoes] = useState<(Promocao & { produto_nome?: string; preco_venda?: number })[]>([]);
  const [produtos, setProdutos] = useState<ProdutoSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Promocao | null>(null);
  const [form, setForm] = useState<Partial<Promocao> & { produto_nome?: string; preco_venda?: number }>(empty);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); loadProdutos(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('promocoes').select('*, produtos:produto_id(nome, preco_venda)').order('data_fim', { ascending: false });
    const mapped = (data || []).map((p: any) => ({
      ...p,
      produto_nome: p.produtos?.nome || '',
      preco_venda: p.produtos?.preco_venda || 0,
    }));
    setPromocoes(mapped);
    setLoading(false);
  }

  async function loadProdutos() {
    const { data } = await supabase.from('produtos').select('id, nome, preco_venda').order('nome');
    setProdutos(data || []);
  }

  function selectProduto(produtoId: string) {
    const p = produtos.find(x => x.id === produtoId);
    if (p) {
      setForm({ ...form, produto_id: p.id, produto_nome: p.nome, preco_venda: Number(p.preco_venda) });
    }
  }

  async function handleSave() {
    if (!form.produto_id) { toast.error('Selecione um produto'); return; }
    if (!form.preco_promocional) { toast.error('Informe o preço promocional'); return; }
    const payload = {
      produto_id: form.produto_id,
      preco_promocional: Number(form.preco_promocional) || 0,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
    };
    if (editing) {
      await supabase.from('promocoes').update(payload).eq('id', editing.id);
      toast.success('Promoção atualizada');
    } else {
      const { error } = await supabase.from('promocoes').insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Promoção criada');
    }
    await logAction(user?.name || '', editing ? 'editar_promocao' : 'cadastrar_promocao', form.produto_nome || '');
    setShowForm(false);
    load();
  }

  async function handleDelete(p: Promocao) {
    if (!isAdmin) { toast.error('Apenas administradores podem excluir.'); return; }
    if (!confirm('Excluir promoção?')) return;
    await supabase.from('promocoes').delete().eq('id', p.id);
    toast.success('Promoção excluída');
    load();
  }

  const today = new Date().toISOString().split('T')[0];
  const filtered = promocoes.filter(p => p.produto_nome?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Promoções</h1>
        <button onClick={() => { setEditing(null); setForm({ ...empty }); setShowForm(true); }} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Nova Promoção
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por produto..."
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-card animate-pulse border border-border" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isActive = (!p.data_inicio || p.data_inicio <= today) && (!p.data_fim || p.data_fim >= today);
            return (
              <div key={p.id} className={`rounded-xl border bg-card p-4 space-y-2 ${isActive ? 'border-primary glow-primary' : 'border-border opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {isActive ? 'Ativa' : 'Inativa'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(p); setForm({ ...p }); setShowForm(true); }} className="p-1 rounded hover:bg-accent text-muted-foreground"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => handleDelete(p)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">{p.produto_nome}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground line-through font-mono">R$ {Number(p.preco_venda).toFixed(2).replace('.', ',')}</span>
                  <span className="text-sm font-bold text-primary font-mono">R$ {Number(p.preco_promocional).toFixed(2).replace('.', ',')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.data_inicio ? new Date(p.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} até {p.data_fim ? new Date(p.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground text-sm py-8">Nenhuma promoção encontrada</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? 'Editar Promoção' : 'Nova Promoção'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Produto</label>
                <select value={form.produto_id || ''} onChange={(e) => selectProduto(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm">
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Valor Original (R$)</label>
                <input type="number" step="0.01" value={form.preco_venda || ''} readOnly
                  className="w-full h-9 px-3 rounded-lg border border-input bg-muted text-muted-foreground text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Preço Promocional (R$)</label>
                <input type="number" step="0.01" min={0} value={form.preco_promocional || ''} onChange={(e) => setForm({ ...form, preco_promocional: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Início</label>
                  <input type="date" value={form.data_inicio || ''} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
                  <input type="date" value={form.data_fim || ''} onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition">Cancelar</button>
              <button onClick={handleSave} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition"><Save className="h-3.5 w-3.5" /> Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
