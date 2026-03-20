import { useState, useEffect } from 'react';
import { CreditCard, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Forma {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function FormasPagamento() {
  const { user, isAdmin } = useAuth();
  const [formas, setFormas] = useState<Forma[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Forma | null>(null);
  const [nome, setNome] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('formas_pagamento').select('*').order('nome');
    setFormas(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return; }
    if (editing) {
      await supabase.from('formas_pagamento').update({ nome: nome.trim() }).eq('id', editing.id);
      toast.success('Forma atualizada');
    } else {
      const { error } = await supabase.from('formas_pagamento').insert({ nome: nome.trim(), ativo: true });
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Forma cadastrada');
    }
    await logAction(user?.name || '', 'cadastrar_forma_pagamento', nome);
    setShowForm(false);
    setNome('');
    load();
  }

  async function handleDelete(f: Forma) {
    if (!isAdmin) { toast.error('Apenas administradores podem excluir.'); return; }
    if (!confirm(`Excluir "${f.nome}"?`)) return;
    await supabase.from('formas_pagamento').delete().eq('id', f.id);
    toast.success('Excluído');
    load();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Formas de Pagamento</h1>
        <button onClick={() => { setEditing(null); setNome(''); setShowForm(true); }} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition">
          <Plus className="h-4 w-4" /> Nova Forma
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-card animate-pulse border border-border" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {formas.map((f) => (
            <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{f.nome}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(f); setNome(f.nome); setShowForm(true); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(f)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {formas.length === 0 && <p className="col-span-full text-center text-muted-foreground text-sm py-8">Nenhuma forma cadastrada</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{editing ? 'Editar' : 'Nova Forma de Pagamento'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PIX, Dinheiro, Cartão..."
                className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="h-9 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition">Cancelar</button>
              <button onClick={handleSave} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
