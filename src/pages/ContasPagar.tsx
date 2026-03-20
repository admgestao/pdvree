import { useState, useEffect } from 'react';
import { 
  TrendingDown, Plus, Search, Pencil, Check, 
  Calendar, User, Info, X, Printer
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ValueDisplay } from '@/components/ValueDisplay';
import { toast } from 'sonner';
import { differenceInDays, parseISO, format } from 'date-fns';

interface Conta {
  id: string;
  descricao: string;
  valor: number;
  credor_id: string;
  condicao_pagamento: string;
  categoria: string;
  data_vencimento: string;
  status: 'pagar' | 'pago';
  observacao: string;
  criado_em: string;
}

const empty: Partial<Conta> = {
  descricao: '', valor: 0, credor_id: '', data_vencimento: '',
  categoria: '', observacao: '', status: 'pagar', condicao_pagamento: ''
};

export default function ContasPagar() {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Conta | null>(null);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [form, setForm] = useState<Partial<Conta>>(empty);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterDate, setFilterDate] = useState({ start: '', end: '' });

  const [categoriasSalvas, setCategoriasSalvas] = useState<string[]>([]);
  const [fornecedores, setFornecedores] = useState<{id: string, nome: string}[]>([]);

  useEffect(() => { load(); loadFornecedores(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('contas_pagar')
      .select('*')
      .order('data_vencimento', { ascending: true });
    
    if (data) {
      setContas(data);
      const cats = Array.from(new Set(data.map(c => c.categoria).filter(Boolean)));
      setCategoriasSalvas(cats);
    }
    setLoading(false);
  }

  async function loadFornecedores() {
    const { data } = await supabase.from('pessoas').select('id, nome').eq('tipo', 'fornecedor');
    setFornecedores(data || []);
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  const handlePrint = () => {
    window.print();
  };

  const filtered = contas.filter((c) => {
    const vencimento = c.data_vencimento ? parseISO(c.data_vencimento) : null;
    
    // Lógica de busca expandida: Descrição, Credor, Categoria e Condição de Pagamento
    const searchLower = search.toLowerCase();
    const matchSearch = 
      c.descricao?.toLowerCase().includes(searchLower) || 
      c.credor_id?.toLowerCase().includes(searchLower) ||
      c.categoria?.toLowerCase().includes(searchLower) ||
      c.condicao_pagamento?.toLowerCase().includes(searchLower);
    
    const isVencida = vencimento && vencimento < today && c.status === 'pagar';
    const matchStatus = filterStatus === 'todos' || 
                        (filterStatus === 'vencido' ? isVencida : c.status === filterStatus);
    
    const matchCat = !filterCategoria || c.categoria === filterCategoria;
    
    const matchDate = (!filterDate.start || (c.data_vencimento >= filterDate.start)) &&
                      (!filterDate.end || (c.data_vencimento <= filterDate.end));

    return matchSearch && matchStatus && matchCat && matchDate;
  });

  const totalPagar = contas.filter(c => c.status === 'pagar').reduce((s, c) => s + Number(c.valor), 0);
  const totalPago = contas.filter(c => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0);
  const totalVencido = contas.filter(c => c.status === 'pagar' && c.data_vencimento && parseISO(c.data_vencimento) < today)
                               .reduce((s, c) => s + Number(c.valor), 0);

  function getVisualStatus(c: Conta) {
    if (c.status === 'pago') return 'opacity-60 bg-emerald-500/5';
    if (!c.data_vencimento) return '';
    
    const venc = parseISO(c.data_vencimento);
    const diff = differenceInDays(venc, today);

    if (diff < 0) return 'animate-pulse bg-red-500/20 border-red-500 text-red-600 font-bold'; 
    if (diff === 0) return 'animate-pulse bg-yellow-400/30 border-yellow-500 text-yellow-700 font-bold'; 
    if (diff > 0 && diff <= 3) return 'bg-orange-100 dark:bg-orange-950/30 text-orange-600'; 
    
    return '';
  }

  async function handleSave() {
    if (!form.descricao || !form.valor) { toast.error('Preencha descrição e valor'); return; }
    const payload = { ...form, valor: Number(form.valor) };
    const { error } = editing 
      ? await supabase.from('contas_pagar').update(payload).eq('id', editing.id)
      : await supabase.from('contas_pagar').insert([payload]);

    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success(editing ? 'Atualizado' : 'Cadastrado');
    setShowForm(false);
    load();
  }

  async function markAsPaid(id: string) {
    await supabase.from('contas_pagar').update({ status: 'pago' }).eq('id', id);
    toast.success('Pagamento registrado');
    load();
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen text-foreground transition-colors print:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingDown className="text-destructive h-6 w-6" /> Contas a Pagar
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Gestão de obrigações</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} 
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-sm">
            <Printer className="h-4 w-4" /> IMPRIMIR
          </button>
          <button onClick={() => { setEditing(null); setForm(empty); setShowForm(true); }} 
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> NOVO TÍTULO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">A Pagar</p>
          <ValueDisplay id="total-pagar" value={`R$ ${totalPagar.toFixed(2)}`} className="text-xl font-bold" />
        </div>
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Total Pago</p>
          <ValueDisplay id="total-pago" value={`R$ ${totalPago.toFixed(2)}`} className="text-xl font-bold text-emerald-500" />
        </div>
        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm border-destructive/20">
          <p className="text-[10px] font-bold text-destructive uppercase mb-1">Total Vencido</p>
          <ValueDisplay id="total-vencido" value={`R$ ${totalVencido.toFixed(2)}`} className="text-xl font-bold text-destructive" />
        </div>
      </div>

      <div className="bg-card border border-border p-4 rounded-2xl space-y-4 shadow-sm print:hidden">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input placeholder="Descrição, credor, categoria ou condição..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border-none rounded-xl py-2 pl-10 pr-4 text-xs outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-secondary border-none rounded-xl px-4 py-2 text-xs outline-none">
            <option value="todos">Status</option>
            <option value="pagar">A Pagar</option>
            <option value="pago">Pago</option>
            <option value="vencido">Vencidos</option>
          </select>
          <div className="flex gap-2 items-center bg-secondary rounded-xl px-3 py-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="date" value={filterDate.start} onChange={e => setFilterDate({...filterDate, start: e.target.value})} className="bg-transparent border-none text-[10px] outline-none" />
            <span className="text-muted-foreground text-[10px]">até</span>
            <input type="date" value={filterDate.end} onChange={e => setFilterDate({...filterDate, end: e.target.value})} className="bg-transparent border-none text-[10px] outline-none" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm print:border-none print:shadow-none">
        <div className="overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground uppercase text-[9px] font-bold tracking-widest border-b border-border print:bg-transparent">
                <th className="p-4">Vencimento</th>
                <th className="p-4">Descrição / Credor</th>
                <th className="p-4">Categoria</th>
                <th className="p-4">Cond. Pagamento</th>
                <th className="p-4 text-right">Valor</th>
                <th className="p-4 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className={`group hover:bg-muted/30 transition-colors cursor-pointer ${getVisualStatus(c)}`}>
                  <td className="p-4 font-mono font-bold" onClick={() => setViewing(c)}>
                    {c.data_vencimento ? format(parseISO(c.data_vencimento), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="p-4" onClick={() => setViewing(c)}>
                    <div className="font-bold uppercase">{c.descricao}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" /> {c.credor_id || 'Manual'}
                    </div>
                  </td>
                  <td className="p-4" onClick={() => setViewing(c)}>
                    <span className="bg-secondary px-2 py-1 rounded text-[10px] uppercase font-bold print:bg-transparent">{c.categoria || 'Geral'}</span>
                  </td>
                  <td className="p-4 italic" onClick={() => setViewing(c)}>
                    {c.condicao_pagamento || '—'}
                  </td>
                  <td className="p-4 text-right font-bold text-sm tabular-nums" onClick={() => setViewing(c)}>
                    R$ {Number(c.valor).toFixed(2)}
                  </td>
                  <td className="p-4 text-center print:hidden">
                    <div className="flex items-center justify-center gap-2">
                      {c.status === 'pagar' && (
                        <button onClick={(e) => { e.stopPropagation(); markAsPaid(c.id); }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setEditing(c); setForm(c); setShowForm(true); }} className="p-2 bg-secondary text-muted-foreground rounded-lg hover:bg-primary hover:text-primary-foreground transition-all">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 print:hidden">
          <div className="w-full max-w-xl bg-card border border-border rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] 
            scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40">
            <h2 className="text-lg font-bold uppercase mb-6 flex items-center gap-2">
              <Plus className="text-primary" /> {editing ? 'Editar Conta' : 'Novo Lançamento'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Descrição</label>
                <input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Valor</label>
                <input type="number" value={form.valor || ''} onChange={e => setForm({...form, valor: Number(e.target.value)})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vencimento</label>
                <input type="date" value={form.data_vencimento} onChange={e => setForm({...form, data_vencimento: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Credor</label>
                <input list="fornecedores-list" value={form.credor_id} onChange={e => setForm({...form, credor_id: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
                <datalist id="fornecedores-list">{fornecedores.map(f => <option key={f.id} value={f.nome} />)}</datalist>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Categoria</label>
                <input list="categorias-list" value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
                <datalist id="categorias-list">{categoriasSalvas.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Condição de Pagamento</label>
                <input value={form.condicao_pagamento} onChange={e => setForm({...form, condicao_pagamento: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Observações</label>
                <textarea value={form.observacao} onChange={e => setForm({...form, observacao: e.target.value})} rows={3} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none resize-none" />
              </div>
            </div>
            <div className="pt-6 grid grid-cols-2 gap-3">
              <button onClick={() => setShowForm(false)} className="py-3 rounded-xl bg-muted text-muted-foreground text-xs font-bold uppercase hover:bg-muted/80">Cancelar</button>
              <button onClick={handleSave} className="py-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase hover:opacity-90">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 print:hidden">
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl p-8 shadow-2xl relative">
            <button onClick={() => setViewing(null)} className="absolute right-6 top-6 text-muted-foreground hover:text-foreground"><X /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><Info /></div>
              <div>
                <h2 className="text-xl font-bold uppercase">{viewing.descricao}</h2>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{viewing.status === 'pago' ? 'Liquidado' : 'Pendente'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6">
              <div><p className="text-[9px] font-bold text-muted-foreground uppercase">Valor</p><p className="font-bold text-lg">R$ {Number(viewing.valor).toFixed(2)}</p></div>
              <div><p className="text-[9px] font-bold text-muted-foreground uppercase">Vencimento</p><p className="font-bold text-lg">{viewing.data_vencimento ? format(parseISO(viewing.data_vencimento), 'dd/MM/yyyy') : '—'}</p></div>
              <div className="col-span-2"><p className="text-[9px] font-bold text-muted-foreground uppercase">Credor</p><p className="font-semibold">{viewing.credor_id || '—'}</p></div>
              <div><p className="text-[9px] font-bold text-muted-foreground uppercase">Cond. Pagamento</p><p className="font-semibold">{viewing.condicao_pagamento || '—'}</p></div>
              <div><p className="text-[9px] font-bold text-muted-foreground uppercase">Categoria</p><p className="font-semibold">{viewing.categoria || '—'}</p></div>
              <div className="col-span-2 bg-muted/50 p-4 rounded-xl mt-2"><p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Observação</p><p className="text-sm italic text-muted-foreground">{viewing.observacao || 'Sem observações.'}</p></div>
            </div>
            <button onClick={() => setViewing(null)} className="w-full mt-8 py-3 rounded-xl bg-secondary text-muted-foreground text-xs font-bold uppercase">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}