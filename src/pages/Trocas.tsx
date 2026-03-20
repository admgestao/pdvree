import { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCcw, Search, Plus, Trash2, Save, 
  X, Check, LayoutDashboard, List, Printer, 
  Edit3, Calculator, Database, TrendingUp, 
  Package, AlertCircle, ArrowDownCircle, Eye, ChevronDown, Filter
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- INTERFACES ---
interface ItemOperacao {
  id_temp: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  is_manual: boolean;
}

export default function GestaoOperacionalTrocas() {
  const { user } = useAuth();
  
  // UI States
  const [showCadastro, setShowCadastro] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState<any | null>(null);
  const [abaInterna, setAbaInterna] = useState<'grid' | 'dash'>('grid');
  
  // Estados de Cadastro
  const [tiposSelecionados, setTiposSelecionados] = useState<string[]>(['is_troca']);
  const [condicaoGeral, setCondicaoGeral] = useState<'retorno_estoque' | 'perda'>('retorno_estoque');
  const [itens, setItens] = useState<ItemOperacao[]>([]);
  const [buscaProd, setBuscaProd] = useState('');
  const [produtosSugestao, setProdutosSugestao] = useState<any[]>([]);
  
  const [clienteNome, setClienteNome] = useState('');
  const [clientesSugestao, setClientesSugestao] = useState<any[]>([]);
  
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState('');
  
  const [motivo, setMotivo] = useState('');

  // Estados de Dados e Filtros
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroCondicao, setFiltroCondicao] = useState('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [ordemCrescente, setOrdemCrescente] = useState(false);

  const formatarMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => { 
    loadDados(); 
    loadAuxiliares();
  }, []);

  async function loadAuxiliares() {
    const { data: users } = await supabase.from('usuarios').select('nome_usuario');
    if (users) setVendedores(users);
  }

  async function loadDados() {
    setLoading(true);
    const { data, error } = await supabase
      .from('movimentacoes_estoque')
      .select('*')
      .order('data_registro', { ascending: false });
    
    if (data) setHistorico(data);
    setLoading(false);
  }

  // --- LOGICA DE AGRUPAMENTO DO GRID ---
  const gridAgrupado = useMemo(() => {
    const grupos: Record<string, any> = {};

    historico.forEach(reg => {
      const key = reg.id_operacao || reg.id;
      if (!grupos[key]) {
        grupos[key] = {
          ...reg,
          itens_originais: [reg],
          valor_total_agrupado: Number(reg.valor_total),
          perca_total: reg.condicao_produto === 'perda' || reg.is_estorno ? Number(reg.valor_total) : 0,
          nomes_produtos: [reg.produto_nome]
        };
      } else {
        grupos[key].itens_originais.push(reg);
        grupos[key].valor_total_agrupado += Number(reg.valor_total);
        grupos[key].perca_total += (reg.condicao_produto === 'perda' || reg.is_estorno) ? Number(reg.valor_total) : 0;
        if (!grupos[key].nomes_produtos.includes(reg.produto_nome)) {
          grupos[key].nomes_produtos.push(reg.produto_nome);
        }
      }
    });

    let lista = Object.values(grupos);

    // Filtros
    lista = lista.filter((g: any) => {
      const matchTexto = (g.produto_nome || '').toLowerCase().includes(filtroTexto.toLowerCase()) || 
                         (g.cliente_nome || '').toLowerCase().includes(filtroTexto.toLowerCase()) ||
                         (g.vendedor_nome || '').toLowerCase().includes(filtroTexto.toLowerCase());
      
      const matchTipo = filtroTipo === 'todos' ? true : g[filtroTipo as keyof any] === true;
      const matchCondicao = filtroCondicao === 'todos' ? true : g.condicao_produto === filtroCondicao;
      
      const dataReg = new Date(g.data_registro).getTime();
      const matchData = (!filtroDataInicio || dataReg >= new Date(filtroDataInicio).getTime()) &&
                        (!filtroDataFim || dataReg <= new Date(filtroDataFim).getTime());

      return matchTexto && matchTipo && matchCondicao && matchData;
    });

    lista.sort((a, b) => ordemCrescente 
      ? a.valor_total_agrupado - b.valor_total_agrupado 
      : b.valor_total_agrupado - a.valor_total_agrupado
    );

    return lista;
  }, [historico, filtroTexto, filtroTipo, filtroCondicao, filtroDataInicio, filtroDataFim, ordemCrescente]);

  const somasHeader = useMemo(() => {
    return gridAgrupado.reduce((acc, curr) => ({
      total: acc.total + curr.valor_total_agrupado,
      perca: acc.perca + curr.perca_total
    }), { total: 0, perca: 0 });
  }, [gridAgrupado]);

  // --- DASHBOARD LOGIC ---
  const stats = useMemo(() => {
    const totalTrocas = historico.filter(h => h.is_troca).reduce((acc, curr) => acc + Number(curr.valor_total), 0);
    const totalDevolucao = historico.filter(h => h.is_devolucao).reduce((acc, curr) => acc + Number(curr.valor_total), 0);
    const totalEstornos = historico.filter(h => h.is_estorno).reduce((acc, curr) => acc + Number(curr.valor_total), 0);
    const totalPerdas = historico.filter(h => h.condicao_produto === 'perda').reduce((acc, curr) => acc + Number(curr.valor_total), 0);
    
    const ranking: Record<string, number> = {};
    historico.filter(h => h.is_troca).forEach(h => {
      ranking[h.produto_nome] = (ranking[h.produto_nome] || 0) + h.quantidade;
    });
    const topProdutos = Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { totalTrocas, totalDevolucao, totalEstornos, totalPerdas, topProdutos };
  }, [historico]);

  // --- ACTIONS ---
  async function buscarProdutos(term: string) {
    setBuscaProd(term);
    if (term.length < 2) { setProdutosSugestao([]); return; }
    const { data } = await supabase.from('produtos').select('nome, preco_venda, codigo').or(`nome.ilike.%${term}%,codigo.ilike.%${term}%`).limit(5);
    setProdutosSugestao(data || []);
  }

  async function buscarClientes(term: string) {
    setClienteNome(term);
    if (term.length < 2) { setClientesSugestao([]); return; }
    const { data } = await supabase.from('pessoas').select('nome').ilike('nome', `%${term}%`).limit(5);
    setClientesSugestao(data || []);
  }

  const adicionarItem = (p?: any) => {
    const novo: ItemOperacao = {
      id_temp: Math.random().toString(36).substr(2, 9),
      nome: p?.nome || '',
      valor_unitario: p?.preco_venda || 0,
      quantidade: 1,
      is_manual: !p
    };
    setItens([...itens, novo]);
    setBuscaProd('');
    setProdutosSugestao([]);
  };

  async function excluirRegistro(id_operacao: string) {
    if (!confirm("Deseja excluir este registro?")) return;
    const { error } = await supabase.from('movimentacoes_estoque').delete().eq('id_operacao', id_operacao);
    if (!error) {
      toast.success("Registro removido");
      loadDados();
    }
  }

  async function salvarRegistro() {
    if (itens.length === 0) return toast.error("Adicione itens");
    if (tiposSelecionados.length === 0) return toast.error("Selecione o tipo da operação");
    setLoading(true);
    const operacao_id = crypto.randomUUID();
    
    try {
      const payload = itens.map(item => ({
        id_operacao: operacao_id,
        is_troca: tiposSelecionados.includes('is_troca'),
        is_devolucao: tiposSelecionados.includes('is_devolucao'),
        is_estorno: tiposSelecionados.includes('is_estorno'),
        cliente_nome: clienteNome || 'Consumidor Final',
        vendedor_nome: vendedorSelecionado || user?.name || 'Sistema',
        produto_nome: item.nome,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        condicao_produto: condicaoGeral,
        motivo: motivo
      }));

      const { error } = await supabase.from('movimentacoes_estoque').insert(payload);
      if (error) throw error;

      toast.success("Operação concluída!");
      setShowCadastro(false);
      setItens([]);
      setClienteNome('');
      setMotivo('');
      loadDados();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4 text-foreground antialiased">
      
      {/* HEADER COMPACTO */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-card border border-border p-4 rounded-2xl gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
            <RefreshCcw className="text-primary h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black uppercase tracking-tight italic">Trocas e Devoluções</h1>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest opacity-60 italic">Gestão de Logística Reversa</p>
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={() => window.print()} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-xl font-bold text-[10px] uppercase hover:bg-border transition-all">
            <Printer size={14} /> Imprimir Relatório
          </button>
          <button onClick={() => setShowCadastro(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl font-black text-[10px] uppercase shadow-md hover:scale-[1.02] active:scale-95 transition-all">
            <Plus size={16} /> Novo Registro
          </button>
        </div>
      </header>

      {/* NAV E SOMATÓRIOS */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 print:hidden">
        <div className="flex p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
          <button onClick={() => setAbaInterna('grid')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${abaInterna === 'grid' ? 'bg-background text-primary border border-border/50' : 'text-muted-foreground'}`}>
            <List size={12} className="inline mr-1" /> Histórico
          </button>
          <button onClick={() => setAbaInterna('dash')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${abaInterna === 'dash' ? 'bg-background text-primary border border-border/50' : 'text-muted-foreground'}`}>
            <LayoutDashboard size={12} className="inline mr-1" /> Dashboard
          </button>
        </div>

        {abaInterna === 'grid' && (
          <div className="flex gap-4 bg-primary/5 border border-primary/10 p-3 rounded-2xl">
            <div className="text-right">
              <p className="text-[8px] font-black uppercase text-muted-foreground">Soma Filtrada</p>
              <p className="text-sm font-black text-primary font-mono">{formatarMoeda(somasHeader.total)}</p>
            </div>
            <div className="text-right border-l border-primary/10 pl-4">
              <p className="text-[8px] font-black uppercase text-red-500">Total Percas</p>
              <p className="text-sm font-black text-red-500 font-mono">{formatarMoeda(somasHeader.perca)}</p>
            </div>
          </div>
        )}
      </div>

      {/* DASHBOARD */}
      {abaInterna === 'dash' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-card border border-border p-5 rounded-2xl">
            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Total em Trocas</p>
            <h2 className="text-2xl font-black text-blue-500 font-mono">{formatarMoeda(stats.totalTrocas)}</h2>
          </div>
          <div className="bg-card border border-border p-5 rounded-2xl">
            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Total Devolvido</p>
            <h2 className="text-2xl font-black text-emerald-500 font-mono">{formatarMoeda(stats.totalDevolucao)}</h2>
          </div>
          <div className="bg-card border border-border p-5 rounded-2xl">
            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Total Estornos</p>
            <h2 className="text-2xl font-black text-amber-500 font-mono">{formatarMoeda(stats.totalEstornos)}</h2>
          </div>
          <div className="bg-card border border-border p-5 rounded-2xl">
            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Total em Percas</p>
            <h2 className="text-2xl font-black text-red-500 font-mono">{formatarMoeda(stats.totalPerdas)}</h2>
          </div>
          <div className="md:col-span-4 bg-card border border-border p-5 rounded-2xl">
            <p className="text-[10px] font-black text-muted-foreground uppercase mb-4">Ranking de Produtos Mais Trocados</p>
            <div className="space-y-2">
              {stats.topProdutos.map(([nome, qtd], idx) => (
                <div key={idx} className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                  <span className="text-[10px] font-bold uppercase">{nome}</span>
                  <span className="text-[10px] font-black text-primary">{qtd} un.</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FILTROS E GRID */}
      {abaInterna === 'grid' && (
        <div className="space-y-4">
          <div className="bg-card border border-border p-4 rounded-2xl flex flex-wrap gap-3 items-center print:hidden">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/30" placeholder="Pesquisar..." value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} />
            </div>
            
            <select className="bg-background border border-border px-3 py-2 rounded-lg text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/30" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option className="bg-card text-foreground" value="todos">Todos os Tipos</option>
              <option className="bg-card text-foreground" value="is_troca">Trocas</option>
              <option className="bg-card text-foreground" value="is_devolucao">Devoluções</option>
              <option className="bg-card text-foreground" value="is_estorno">Estornos</option>
            </select>

            <select className="bg-background border border-border px-3 py-2 rounded-lg text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/30" value={filtroCondicao} onChange={e => setFiltroCondicao(e.target.value)}>
              <option className="bg-card text-foreground" value="todos">Status: Todos</option>
              <option className="bg-card text-foreground" value="perda">Avaria</option>
              <option className="bg-card text-foreground" value="retorno_estoque">Estoque</option>
            </select>

            <div className="flex gap-2">
              <input type="date" className="bg-background border border-border px-2 py-2 rounded-lg text-[10px] font-bold" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} />
              <input type="date" className="bg-background border border-border px-2 py-2 rounded-lg text-[10px] font-bold" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} />
            </div>

            <button onClick={() => setOrdemCrescente(!ordemCrescente)} className="p-2 bg-muted rounded-lg hover:bg-border transition-colors">
              <Filter size={14} className={ordemCrescente ? 'rotate-180' : ''} />
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden animate-in fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="bg-muted/50 font-black uppercase text-muted-foreground tracking-widest border-b border-border">
                  <tr>
                    <th className="px-5 py-3">Data/Operador</th>
                    <th className="px-5 py-3">Tipo</th>
                    <th className="px-5 py-3">Produto/Cliente</th>
                    <th className="px-5 py-3 text-center">Qtd</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Perca/Estorno</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gridAgrupado.map((reg: any) => (
                    <tr key={reg.id_operacao || reg.id} className="hover:bg-primary/[0.02] transition-colors group">
                      <td className="px-5 py-3 font-mono">
                        <div className="font-bold">{new Date(reg.data_registro).toLocaleDateString()}</div>
                        <div className="opacity-50 text-[9px] uppercase">{reg.vendedor_nome}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {reg.is_troca && <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[8px] font-black">T</span>}
                          {reg.is_devolucao && <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8px] font-black">D</span>}
                          {reg.is_estorno && <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black">E</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-black uppercase">{reg.nomes_produtos.length > 1 ? "Mais de um produto" : reg.produto_nome}</div>
                        <div className="text-[9px] text-muted-foreground italic font-bold uppercase">{reg.cliente_nome}</div>
                      </td>
                      <td className="px-5 py-3 text-center font-bold">
                        {reg.itens_originais.reduce((a: any, c: any) => a + c.quantidade, 0)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-black text-primary">
                        {formatarMoeda(reg.valor_total_agrupado)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-red-500">
                        {formatarMoeda(reg.perca_total)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${reg.condicao_produto === 'perda' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'}`}>
                          {reg.condicao_produto === 'perda' ? 'Avaria' : 'Estoque'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setShowDetalhes(reg)} className="p-1.5 text-primary hover:bg-primary/10 rounded-md">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => excluirRegistro(reg.id_operacao)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER DE CADASTRO */}
      {showCadastro && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowCadastro(false)} />
          <div className="relative w-full max-w-2xl h-full bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right">
            
            <div className="p-6 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Edit3 className="text-primary h-5 w-5" />
                <h2 className="text-md font-black uppercase italic tracking-tighter">Lançamento Operacional</h2>
              </div>
              <button onClick={() => setShowCadastro(false)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TIPOS */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'is_troca', label: 'Troca' },
                  { id: 'is_devolucao', label: 'Devolução' },
                  { id: 'is_estorno', label: 'Estorno' }
                ].map((t) => (
                  <button 
                    key={t.id} onClick={() => setTiposSelecionados(prev => prev.includes(t.id) ? prev.filter(i => i !== t.id) : [...prev, t.id])} 
                    className={`py-3 rounded-xl text-[10px] font-black uppercase border-2 transition-all ${tiposSelecionados.includes(t.id) ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'bg-muted/30 border-border text-muted-foreground'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* VENDEDOR, CLIENTE E CONDIÇÃO (TEMA APLICADO) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Vendedor</label>
                  <select 
                    className="w-full p-3 bg-muted/30 border-2 border-border rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary/40 text-foreground transition-all appearance-none"
                    value={vendedorSelecionado} 
                    onChange={(e) => setVendedorSelecionado(e.target.value)}
                  >
                    <option className="bg-card text-foreground" value="">Selecione</option>
                    {vendedores.map(v => (
                      <option className="bg-card text-foreground" key={v.nome_usuario} value={v.nome_usuario}>{v.nome_usuario}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 relative">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Cliente</label>
                  <input className="w-full p-3 bg-muted/30 border-2 border-border rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary/40 text-foreground" placeholder="Nome..." value={clienteNome} onChange={(e) => buscarClientes(e.target.value)} />
                  {clientesSugestao.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl">
                      {clientesSugestao.map(c => (
                        <button key={c.nome} onClick={() => { setClienteNome(c.nome); setClientesSugestao([]); }} className="w-full px-4 py-2 text-left hover:bg-primary/10 font-bold text-[10px] uppercase border-b last:border-0 border-border text-foreground">
                          {c.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Destino</label>
                  <select 
                    className="w-full p-3 bg-muted/30 border-2 border-border rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary/40 text-primary font-black transition-all appearance-none" 
                    value={condicaoGeral} 
                    onChange={(e: any) => setCondicaoGeral(e.target.value)}
                  >
                    <option className="bg-card text-foreground" value="retorno_estoque">Estoque</option>
                    <option className="bg-card text-foreground" value="perda">Avaria / Perca</option>
                  </select>
                </div>
              </div>

              {/* BUSCA PRODUTO */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input className="w-full pl-10 h-11 bg-muted/30 border-2 border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground" placeholder="Buscar produto..." value={buscaProd} onChange={(e) => buscarProdutos(e.target.value)} />
                  {produtosSugestao.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                      {produtosSugestao.map(p => (
                        <button key={p.codigo} onClick={() => adicionarItem(p)} className="w-full px-4 py-3 text-left hover:bg-primary/10 border-b border-border last:border-0 font-black text-[10px] uppercase text-foreground">
                          {p.nome} <span className="text-primary ml-2">{formatarMoeda(p.preco_venda)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => adicionarItem()} className="px-4 bg-muted border-2 border-border rounded-xl text-[10px] font-black uppercase hover:border-primary/40 transition-all flex items-center gap-1 text-foreground">
                  <Plus size={14} /> Manual
                </button>
              </div>

              {/* LISTA DE ITENS */}
              <div className="space-y-2">
                {itens.map((item) => (
                  <div key={item.id_temp} className="p-3 bg-muted/20 rounded-xl border-l-4 border-l-primary border border-border">
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-6">
                        <input className="w-full bg-transparent border-none p-0 text-[10px] font-black uppercase outline-none text-foreground" value={item.nome} onChange={(e) => setItens(itens.map(i => i.id_temp === item.id_temp ? {...i, nome: e.target.value} : i))} placeholder="Nome..." />
                      </div>
                      <div className="col-span-2">
                        <input type="number" className="w-full h-8 bg-background border border-border rounded-lg text-center font-bold text-[10px] text-foreground" value={item.quantidade} onChange={(e) => setItens(itens.map(i => i.id_temp === item.id_temp ? {...i, quantidade: Number(e.target.value)} : i))} />
                      </div>
                      <div className="col-span-3">
                        <div className="relative">
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] opacity-40 font-black text-foreground">R$</span>
                          <input type="number" className="w-full h-8 bg-background border border-border rounded-lg text-right pr-2 pl-4 font-mono font-bold text-[10px] text-primary" value={item.valor_unitario} onChange={(e) => setItens(itens.map(i => i.id_temp === item.id_temp ? {...i, valor_unitario: Number(e.target.value)} : i))} />
                        </div>
                      </div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => setItens(itens.filter(i => i.id_temp !== item.id_temp))} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"><Trash2 size={14}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <textarea className="w-full p-4 bg-muted/30 border-2 border-border rounded-xl text-[10px] h-20 resize-none outline-none focus:border-primary/40 font-bold uppercase text-foreground" placeholder="Motivo da operação..." value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>

            <div className="p-6 border-t border-border bg-muted/5 flex justify-between items-center">
              <div>
                <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Total Geral</p>
                <h3 className="text-2xl font-black font-mono text-primary">{formatarMoeda(itens.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0))}</h3>
              </div>
              <button onClick={salvarRegistro} disabled={loading} className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-black uppercase text-[10px] shadow-lg disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-all">
                {loading ? <RefreshCcw className="animate-spin" /> : 'Finalizar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES */}
      {showDetalhes && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md" onClick={() => setShowDetalhes(null)} />
          <div className="relative w-full max-w-3xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
              <div>
                <h2 className="text-sm font-black uppercase italic">Detalhes da Operação</h2>
                <p className="text-[9px] opacity-60 font-mono">{showDetalhes.id_operacao}</p>
              </div>
              <button onClick={() => setShowDetalhes(null)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted/50 rounded-2xl border border-border">
                  <p className="text-[8px] font-black uppercase opacity-50">Cliente</p>
                  <p className="text-[10px] font-black uppercase text-foreground">{showDetalhes.cliente_nome}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-2xl border border-border">
                  <p className="text-[8px] font-black uppercase opacity-50">Vendedor</p>
                  <p className="text-[10px] font-black uppercase text-foreground">{showDetalhes.vendedor_nome}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-2xl border border-border">
                  <p className="text-[8px] font-black uppercase opacity-50">Data</p>
                  <p className="text-[10px] font-black text-foreground">{new Date(showDetalhes.data_registro).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase opacity-50 ml-1">Itens</p>
                <div className="border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead className="bg-muted/50 font-black uppercase border-b border-border">
                      <tr>
                        <th className="px-4 py-2">Produto</th>
                        <th className="px-4 py-2 text-center">Qtd</th>
                        <th className="px-4 py-2 text-right">Unitário</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-center">Condição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {showDetalhes.itens_originais.map((it: any, i: number) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-bold uppercase text-foreground">{it.produto_nome}</td>
                          <td className="px-4 py-2 text-center text-foreground">{it.quantidade}</td>
                          <td className="px-4 py-2 text-right font-mono text-foreground">{formatarMoeda(Number(it.valor_unitario))}</td>
                          <td className="px-4 py-2 text-right font-mono font-black text-primary">{formatarMoeda(Number(it.valor_total))}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${it.condicao_produto === 'perda' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
                              {it.condicao_produto === 'perda' ? 'Avaria' : 'Estoque'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <p className="text-[8px] font-black uppercase text-primary mb-1">Observações</p>
                <p className="text-[10px] italic font-medium uppercase leading-relaxed text-muted-foreground">{showDetalhes.motivo || "Sem observações."}</p>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end bg-muted/10">
              <div className="text-right">
                <p className="text-[10px] font-black uppercase opacity-50">Total Consolidado</p>
                <p className="text-3xl font-black text-primary font-mono">{formatarMoeda(showDetalhes.valor_total_agrupado)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}