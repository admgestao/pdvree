import { useState, useEffect } from 'react';
import { Users, Plus, Search, Pencil, Trash2, X, Save } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Pessoa {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  cpf_cnpj: string;
  categoria: string;
  endereco: string;
  observacoes: string;
  credito: number;
  limite_compra: number;
  limite_usado: number;
  criado_em: string;
}

const emptyPessoa: Partial<Pessoa> = {
  nome: '', telefone: '', email: '', cpf_cnpj: '', categoria: 'cliente',
  endereco: '', observacoes: '', credito: 0, limite_compra: 0, limite_usado: 0,
};

function formatCpfCnpj(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length <= 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4').replace(/[-.]$/, '');
  return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5').replace(/[-./]$/, '');
}

function formatTelefone(v: string) {
  const n = v.replace(/\D/g, '');
  if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/[-() ]$/, '');
  return n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/[-() ]$/, '');
}

export default function Pessoas() {
  const { user, isAdmin } = useAuth();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pessoa | null>(null);
  const [form, setForm] = useState<Partial<Pessoa>>(emptyPessoa);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('pessoas').select('*').order('nome');
    setPessoas(data || []);
    setLoading(false);
  }

  const filtered = pessoas.filter((p) => {
    const matchSearch = p.nome?.toLowerCase().includes(search.toLowerCase()) ||
                        p.cpf_cnpj?.includes(search) || p.email?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'todos' || p.categoria === filterCat;
    return matchSearch && matchCat;
  });

  function openNew() { setEditing(null); setForm({ ...emptyPessoa }); setShowForm(true); }
  function openEdit(p: Pessoa) {
    if (!isAdmin) { toast.error('Apenas administradores podem editar.'); return; }
    setEditing(p); setForm({ ...p }); setShowForm(true);
  }

  async function handleDelete(p: Pessoa) {
    if (!isAdmin) { toast.error('Apenas administradores podem excluir.'); return; }
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    await supabase.from('pessoas').delete().eq('id', p.id);
    await logAction(user?.name || '', 'excluir_pessoa', p.nome);
    toast.success('Registro excluído');
    load();
  }

  async function handleSave() {
    if (!form.nome) { toast.error('Nome é obrigatório'); return; }
    const payload = {
      nome: form.nome, telefone: form.telefone || '', email: form.email || '',
      cpf_cnpj: form.cpf_cnpj || '', categoria: form.categoria || 'cliente',
      endereco: form.endereco || '', observacoes: form.observacoes || '',
      credito: Number(form.credito) || 0, limite_compra: Number(form.limite_compra) || 0,
      limite_usado: Number(form.limite_usado) || 0,
    };

    if (editing) {
      const { error } = await supabase.from('pessoas').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      await logAction(user?.name || '', 'editar_pessoa', form.nome || '');
      toast.success('Atualizado com sucesso');
    } else {
      const { error } = await supabase.from('pessoas').insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
      await logAction(user?.name || '', 'cadastrar_pessoa', form.nome || '');
      toast.success('Cadastrado com sucesso');
    }
    setShowForm(false);
    load();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Cadastro de Pessoas</h1>
        <button onClick={openNew} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Nova Pessoa
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ ou email..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-secondary text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="h-10 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm">
          <option value="todos">Todos</option>
          <option value="cliente">Clientes</option>
          <option value="fornecedor">Fornecedores</option>
          <option value="outro">Outros</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-card animate-pulse border border-border" />)}</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 text-muted-foreground font-medium">Nome</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Telefone</th>
                  <th className="text-left p-3 text-muted-foreground font-medium hidden lg:table-cell">CPF/CNPJ</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Categoria</th>
                  <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Crédito</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="p-3 text-foreground font-medium">{p.nome}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{p.telefone}</td>
                    <td className="p-3 text-muted-foreground font-mono hidden lg:table-cell">{p.cpf_cnpj}</td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.categoria === 'cliente' ? 'bg-primary/10 text-primary' : p.categoria === 'fornecedor' ? 'bg-chart-2/20 text-chart-2' : 'bg-muted text-muted-foreground'}`}>{p.categoria}</span></td>
                    <td className="p-3 text-right font-mono text-primary hidden md:table-cell">R$ {Number(p.credito).toFixed(2).replace('.', ',')}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nome *</label>
                <input value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                <input value={form.telefone || ''} onChange={(e) => setForm({ ...form, telefone: formatTelefone(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">CPF/CNPJ</label>
                <input value={form.cpf_cnpj || ''} onChange={(e) => setForm({ ...form, cpf_cnpj: formatCpfCnpj(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                <select value={form.categoria || 'cliente'} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm">
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Endereço</label>
                <input value={form.endereco || ''} onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Crédito (R$)</label>
                <input type="number" step="0.01" min={0} value={form.credito || ''} onChange={(e) => setForm({ ...form, credito: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Limite de Compra (R$)</label>
                <input type="number" step="0.01" min={0} value={form.limite_compra || ''} onChange={(e) => setForm({ ...form, limite_compra: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Observações</label>
                <textarea value={form.observacoes || ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition">Cancelar</button>
              <button onClick={handleSave} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition">
                <Save className="h-3.5 w-3.5" /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
