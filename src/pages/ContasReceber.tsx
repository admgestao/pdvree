import { useState, useEffect } from 'react';
import { 
  TrendingUp, Plus, Search, Pencil, Trash2, X, Save, Check, 
  Calendar, User, Tag, CreditCard, Info, Filter, Users, Printer
} from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ValueDisplay } from '@/components/ValueDisplay';
import { toast } from 'sonner';
import { differenceInDays, parseISO, format } from 'date-fns';

interface Conta {
  id: string;
  descricao: string;
  valor: number;
  devedor_id: string; 
  condicao_pagamento: string;
  categoria: string;
  data_vencimento: string;
  status: 'receber' | 'recebido';
  observacao: string;
  criado_em: string;
}

const empty: Partial<Conta> = {
  descricao: '', valor: 0, devedor_id: '', data_vencimento: '',
  categoria: '', observacao: '', status: 'receber', condicao_pagamento: ''
};

export default function ContasReceber() {
  const { user, isAdmin } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Conta | null>(null);
  const [editing, setEditing] = useState<Conta | null>(null);
  const [form, setForm] = useState<Partial<Conta>>(empty);

  // Estados de Filtro
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterDate, setFilterDate] = useState({ start: '', end: '' });

  // Listas de dados
  const [categoriasSalvas, setCategoriasSalvas] = useState<string[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('contas_receber')
      .select('*')
      .order('data_vencimento', { ascending: true });
    
    if (error) {
      console.error('Erro ao carregar contas:', error);
      toast.error('Erro ao carregar registros');
    }
    
    if (data) {
      setContas(data);
      const cats = Array.from(new Set(data.map(c => c.categoria).filter(Boolean)));
      setCategoriasSalvas(cats);
    }
    setLoading(false);
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  const handlePrint = () => {
    window.print();
  };

  function getVisualStatus(c: Conta) {
    if (c.status === 'recebido') return 'opacity-60 bg-emerald-500/5';
    if (!c.data_vencimento) return '';
    const venc = parseISO(c.data_vencimento);
    const diff = differenceInDays(venc, today);
    if (diff < 0) return 'animate-pulse bg-red-500/20 border-red-500 text-red-600 font-bold'; 
    if (diff === 0) return 'animate-pulse bg-yellow-400/30 border-yellow-500 text-yellow-700 font-bold';
    if (diff > 0 && diff <= 3) return 'bg-orange-100 dark:bg-orange-950/30 text-orange-600'; 
    return '';
  }

  const filtered = contas.filter((c) => {
  const searchLower = search.toLowerCase();
  const matchSearch = 
    c.descricao?.toLowerCase().includes(searchLower) || 
    c.devedor_id?.toLowerCase().includes(searchLower) ||
    c.categoria?.toLowerCase().includes(searchLower) ||
    c.condicao_pagamento?.toLowerCase().includes(searchLower);

  const isVencida = c.data_vencimento 
    ? parseISO(c.data_vencimento) < today && c.status === 'receber'
    : false;

  const matchStatus = filterStatus === 'todos' || 
                      (filterStatus === 'vencido' 
                      ? isVencida : c.status === filterStatus);
  const matchCat = !filterCategoria || c.categoria === filterCategoria;
  const matchDate = (!filterDate.start || (c.data_vencimento && c.data_vencimento >= filterDate.start)) &&
                    (!filterDate.end || (c.data_vencimento && c.data_vencimento <= filterDate.end));

  return matchSearch && matchStatus && matchCat && matchDate;
});

const totals = {
  receber: contas
    .filter(c => c.status === 'receber')
    .reduce((s, c) => s + Number(c.valor), 0),
  recebido: contas
    .filter(c => c.status === 'recebido')
    .reduce((s, c) => s + Number(c.valor), 0),
  vencido: contas
    .filter(c => c.status === 'receber' && !!c.data_vencimento && parseISO(c.data_vencimento) < today)
    .reduce((s, c) => s + Number(c.valor), 0)
};


  // ✅ FUNÇÃO CORRIGIDA: Trata strings vazias e remove campos protegidos
  async function handleSave() {
    if (!form.descricao || !form.valor || !form.devedor_id) { 
      toast.error('Descrição, Valor e Devedor são obrigatórios');
      return; 
    }
    
    try {
      // Prepara o payload convertendo valores e tratando campos vazios
      const payload: any = { 
        descricao: form.descricao,
        valor: Number(form.valor),
        devedor_id: form.devedor_id,
        condicao_pagamento: form.condicao_pagamento || null,
        categoria: form.categoria || null,
        observacao: form.observacao || null,
        status: form.status || 'receber'
      };

      // ✅ CORREÇÃO PRINCIPAL: PostgreSQL não aceita string vazia em campos de data
      payload.data_vencimento = form.data_vencimento || null;

      // ✅ Remove campos que não devem ser enviados (controlados pelo sistema)
      // Não inclui 'id' nem 'criado_em' no payload

      let error;

      if (editing && editing.id) {
        // UPDATE: atualiza registro existente
        const { error: updateError } = await supabase
          .from('contas_receber')
          .update(payload)
          .eq('id', editing.id);
        error = updateError;
      } else {
        // INSERT: cria novo registro
        const { error: insertError } = await supabase
          .from('contas_receber')
          .insert([payload]);
        error = insertError;
      }

      if (error) { 
        console.error('Erro Supabase:', error);
        toast.error(`Erro ao salvar: ${error.message}`); 
        return; 
      }
      
      toast.success('Registro salvo com sucesso');
      
      // ✅ Reset completo do estado após sucesso
      setShowForm(false);
      setEditing(null);
      setForm(empty);
      
      // Recarrega os dados
      await load();
      
    } catch (err: any) {
      console.error('Erro inesperado:', err);
      toast.error(`Erro inesperado: ${err?.message || 'Erro desconhecido'}`);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen text-foreground transition-colors print:p-0">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2 uppercase tracking-tighter">
            <TrendingUp className="text-emerald-500" /> Contas a Receber
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Controle de recebíveis e faturamento</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} 
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-xs font-black hover:opacity-90 transition-all flex items-center gap-2 shadow-sm">
            <Printer className="h-4 w-4" /> IMPRIMIR
          </button>
          <button onClick={() => { setEditing(null); setForm(empty); setShowForm(true); }} 
            className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-black hover:opacity-90 transition-all flex items-center gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> NOVO LANÇAMENTO
          </button>
        </div>
      </div>

      {/* Painéis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">A Receber</p>
          <ValueDisplay id="total-receber" value={`R$ ${totals.receber.toFixed(2)}`} className="text-xl font-black" />
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1 text-emerald-500">Total Recebido</p>
          <ValueDisplay id="total-recebido" value={`R$ ${totals.recebido.toFixed(2)}`} className="text-xl font-black text-emerald-500" />
        </div>
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm border-destructive/20">
          <p className="text-[10px] font-bold text-destructive uppercase mb-1">Total Vencido</p>
          <ValueDisplay id="total-vencido" value={`R$ ${totals.vencido.toFixed(2)}`} className="text-xl font-black text-destructive" />
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border p-4 rounded-2xl flex flex-wrap gap-3 shadow-sm print:hidden">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input placeholder="Descrição, devedor, categoria ou condição..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary border-none rounded-xl py-2 pl-10 pr-4 text-xs outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-secondary border-none rounded-xl px-4 py-2 text-xs outline-none font-medium">
          <option value="todos">Status: Todos</option>
          <option value="receber">A Receber</option>
          <option value="recebido">Recebido</option>
          <option value="vencido">Vencidos</option>
        </select>
        <div className="flex gap-2 items-center bg-secondary rounded-xl px-3 py-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <input type="date" value={filterDate.start} onChange={e => setFilterDate({...filterDate, start: e.target.value})} className="bg-transparent border-none text-[10px] outline-none" />
          <span className="text-muted-foreground text-[10px]">até</span>
          <input type="date" value={filterDate.end} onChange={e => setFilterDate({...filterDate, end: e.target.value})} className="bg-transparent border-none text-[10px] outline-none" />
        </div>
      </div>

      {/* Lista / Grid */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm print:border-none print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground uppercase text-[9px] font-black tracking-widest border-b border-border print:bg-transparent">
                <th className="p-4">Vencimento</th>
                <th className="p-4">Descrição / Devedor</th>
                <th className="p-4">Categoria</th>
                <th className="p-4">Cond. Recebimento</th>
                <th className="p-4 text-right">Valor</th>
                <th className="p-4 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className={`group hover:bg-muted/30 transition-colors cursor-pointer ${getVisualStatus(c)}`}>
                  <td className="p-4 font-mono font-bold" onClick={() => setViewing(c)}>
                    {c.data_vencimento ? format(parseISO(c.data_vencimento), 'dd/MM/yyyy') : ''}
                  </td>
                  <td className="p-4" onClick={() => setViewing(c)}>
                    <div className="font-bold uppercase text-foreground">{c.descricao}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                      <Users className="h-3 w-3" /> {c.devedor_id}
                    </div>
                  </td>
                  <td className="p-4" onClick={() => setViewing(c)}>
                    <span className="bg-secondary px-2 py-0.5 rounded text-[10px] uppercase font-black text-muted-foreground print:bg-transparent">{c.categoria || 'Geral'}</span>
                  </td>
                  <td className="p-4 italic" onClick={() => setViewing(c)}>
                    {c.condicao_pagamento || ''}
                  </td>
                  <td className="p-4 text-right font-black text-sm tabular-nums" onClick={() => setViewing(c)}>
                    R$ {Number(c.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-center print:hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-2">
                      {c.status === 'receber' && (
                        <button onClick={async () => {
                          const { error } = await supabase
                            .from('contas_receber')
                            .update({ status: 'recebido' })
                            .eq('id', c.id);
                          
                          if (error) {
                            console.error('Erro ao confirmar recebimento:', error);
                            toast.error('Erro ao confirmar recebimento');
                          } else {
                            toast.success('Recebimento confirmado');
                            load();
                          }
                        }} className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => { setEditing(c); setForm(c); setShowForm(true); }} className="p-2 bg-secondary text-muted-foreground rounded-lg hover:bg-primary hover:text-primary-foreground transition-all">
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

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4 print:hidden">
          <div className="w-full max-w-xl bg-card border border-border rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[95vh] scrollbar-thin">
            <h2 className="text-lg font-black uppercase mb-6 flex items-center gap-2">
              <Plus className="text-primary" /> {editing ? 'Editar Recebível' : 'Novo Contas a Receber'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Descrição</label>
                <input value={form.descricao || ''} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Devedor</label>
                <input placeholder="Digite o nome do devedor..." value={form.devedor_id || ''} onChange={e => setForm({...form, devedor_id: e.target.value})}
                    className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Valor</label>
                <input type="number" value={form.valor || ''} onChange={e => setForm({...form, valor: Number(e.target.value)})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Vencimento</label>
                <input type="date" value={form.data_vencimento || ''} onChange={e => setForm({...form, data_vencimento: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Categoria</label>
                <input list="cats" value={form.categoria || ''} onChange={e => setForm({...form, categoria: e.target.value})} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
                <datalist id="cats">{categoriasSalvas.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Condição de Receb.</label>
                <input value={form.condicao_pagamento || ''} onChange={e => setForm({...form, condicao_pagamento: e.target.value})} placeholder="Ex: Cartão, Pix..." className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1">Observações</label>
                <textarea value={form.observacao || ''} onChange={e => setForm({...form, observacao: e.target.value})} rows={2} className="w-full bg-secondary border border-border rounded-xl py-2 px-4 text-sm outline-none resize-none" />
              </div>
            </div>

            <div className="pt-6 grid grid-cols-2 gap-3">
              <button onClick={() => { 
                setShowForm(false); 
                setEditing(null); 
                setForm(empty); 
              }} className="py-3 rounded-xl bg-muted text-muted-foreground text-xs font-black uppercase hover:bg-muted/80 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="py-3 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 shadow-lg">Salvar Registro</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização Detalhada */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4 print:hidden">
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl p-8 shadow-2xl relative">
            <button onClick={() => setViewing(null)} className="absolute right-6 top-6 text-muted-foreground hover:text-foreground"><X /></button>
            <div className="flex items-center gap-4 mb-8">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Info className="h-7 w-7" /></div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tighter">{viewing.descricao}</h2>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${viewing.status === 'recebido' ? 'border-emerald-500 text-emerald-500' : 'border-primary text-primary'}`}>{viewing.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 border-t border-border pt-6">
              <div><p className="text-[9px] font-black text-muted-foreground uppercase">Valor Esperado</p><p className="font-black text-xl text-foreground">R$ {Number(viewing.valor).toFixed(2)}</p></div>
              <div><p className="text-[9px] font-black text-muted-foreground uppercase">Vencimento</p><p className="font-black text-xl text-foreground">{viewing.data_vencimento ? format(parseISO(viewing.data_vencimento), 'dd/MM/yyyy') : ''}</p></div>
              <div className="col-span-2"><p className="text-[9px] font-black text-muted-foreground uppercase">Devedor (Pagador)</p><p className="font-bold text-foreground text-base">{viewing.devedor_id}</p></div>
              <div><p className="text-[9px] font-black text-muted-foreground uppercase">Condição</p><p className="font-bold text-foreground">{viewing.condicao_pagamento || ''}</p></div>
              <div><p className="text-[9px] font-black text-muted-foreground uppercase">Categoria</p><p className="font-bold text-foreground">{viewing.categoria || 'Geral'}</p></div>
              <div className="col-span-2 bg-muted/50 p-4 rounded-xl"><p className="text-[9px] font-black text-muted-foreground uppercase mb-1">Notas</p><p className="text-xs italic text-muted-foreground font-medium">{viewing.observacao || 'Nenhuma observação.'}</p></div>
            </div>
            <button onClick={() => setViewing(null)} className="w-full mt-8 py-3 rounded-xl bg-secondary text-muted-foreground text-xs font-black uppercase hover:bg-muted transition-colors">Fechar Detalhes</button>
          </div>
        </div>
      )}
    </div>
  );
}
