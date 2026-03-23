import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  RefreshCcw, Search, Plus, Trash2, Save, 
  X, Check, LayoutDashboard, List, Printer, 
  Edit3, Calculator, Database, TrendingUp, 
  Package, AlertCircle, ArrowDownCircle, Eye, ChevronDown, Filter,
  ArrowRightLeft, ArrowRight, ArrowLeft, CreditCard, UserCircle, User, DollarSign
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// --- INTERFACES ---
interface ItemTroca {
  id_temp: string;
  produto_id?: string;
  nome: string;
  codigo?: string;
  quantidade: number;
  valor_unitario: number;
  lote_id?: string;
  lote_codigo?: string;
  condicao?: 'retorno_estoque' | 'perda'; // Usado para entrada
  estoque_atual?: number;
}

interface ProdutoSearch {
  id: string;
  nome: string;
  codigo: string;
  preco_venda: number;
  estoque_atual: number;
  categoria: string;
  lote_id?: string;
  lote_codigo?: string;
}

interface Pessoa {
  id: string;
  nome: string;
  credito?: number;
}

interface MovimentacaoAgrupada {
  id_operacao: string;
  criado_em: string;
  cliente_nome: string;
  vendedor_nome: string;
  is_troca: boolean;
  is_devolucao: boolean;
  is_estorno: boolean;
  valor_total_agrupado: number;
  itens: any[];
  motivo?: string;
}

export default function Trocas() {
  const { user } = useAuth();
  
  // Estados de UI
  const [abaAtiva, setAbaAtiva] = useState<'nova' | 'historico'>('nova');
  const [loading, setLoading] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState<MovimentacaoAgrupada | null>(null);

  // Estados Nova Movimentação
  const [tipoMovimentacao, setTipoMovimentacao] = useState<'troca' | 'devolucao' | 'estorno'>('troca');
  const [clienteNome, setClienteNome] = useState('');
  const [motivoGeral, setMotivoGeral] = useState('');
  const [itensEntrada, setItensEntrada] = useState<ItemTroca[]>([]);
  const [itensSaida, setItensSaida] = useState<ItemTroca[]>([]);

  // Busca de Produtos
  const [buscaProd, setBuscaProd] = useState('');
  const [resultadosProd, setResultadosProd] = useState<ProdutoSearch[]>([]);
  const [showResultados, setShowResultados] = useState(false);

  // Histórico
  const [historico, setHistorico] = useState<MovimentacaoAgrupada[]>([]);
  const [filtroHistorico, setFiltroHistorico] = useState('');

  // --- CARREGAMENTO ---
  useEffect(() => {
    if (abaAtiva === 'historico') carregarHistorico();
  }, [abaAtiva]);

  const carregarHistorico = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Agrupar por id_operacao
      const grupos: Record<string, MovimentacaoAgrupada> = {};
      data.forEach((row) => {
        if (!grupos[row.id_operacao]) {
          grupos[row.id_operacao] = {
            id_operacao: row.id_operacao,
            criado_em: row.criado_em,
            cliente_nome: row.cliente_nome,
            vendedor_nome: row.vendedor_nome,
            is_troca: row.is_troca,
            is_devolucao: row.is_devolucao,
            is_estorno: row.is_estorno,
            valor_total_agrupado: 0,
            motivo: row.motivo,
            itens: []
          };
        }
        const valorItem = Number(row.quantidade) * Number(row.valor_unitario);
        grupos[row.id_operacao].valor_total_agrupado += valorItem;
        grupos[row.id_operacao].itens.push(row);
      });

      setHistorico(Object.values(grupos));
    } catch (err: any) {
      toast.error("Erro ao carregar histórico: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- BUSCA DE PRODUTOS ---
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (buscaProd.length < 2) {
        setResultadosProd([]);
        setShowResultados(false);
        return;
      }
      
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, codigo, preco_venda, estoque_atual, categoria')
        .or(`nome.ilike.%${buscaProd}%,codigo.ilike.%${buscaProd}%`)
        .limit(5);
      
      setResultadosProd(data || []);
      setShowResultados(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaProd]);

  const adicionarItem = (p: ProdutoSearch, tipo: 'entrada' | 'saida') => {
    const novo: ItemTroca = {
      id_temp: crypto.randomUUID(),
      produto_id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      quantidade: 1,
      valor_unitario: p.preco_venda,
      condicao: tipo === 'entrada' ? 'retorno_estoque' : undefined,
      estoque_atual: p.estoque_atual
    };

    if (tipo === 'entrada') setItensEntrada([...itensEntrada, novo]);
    else setItensSaida([...itensSaida, novo]);
    
    setBuscaProd('');
    setShowResultados(false);
    toast.success(`${p.nome} adicionado.`);
  };

  const removerItem = (id: string, tipo: 'entrada' | 'saida') => {
    if (tipo === 'entrada') setItensEntrada(itensEntrada.filter(i => i.id_temp !== id));
    else setItensSaida(itensSaida.filter(i => i.id_temp !== id));
  };

  const atualizarItem = (id: string, tipo: 'entrada' | 'saida', field: keyof ItemTroca, value: any) => {
    const setter = tipo === 'entrada' ? setItensEntrada : setItensSaida;
    const lista = tipo === 'entrada' ? itensEntrada : itensSaida;
    
    setter(lista.map(it => it.id_temp === id ? { ...it, [field]: value } : it));
  };

  // --- CÁLCULOS ---
  const totalEntrada = useMemo(() => itensEntrada.reduce((acc, it) => acc + (it.quantidade * it.valor_unitario), 0), [itensEntrada]);
  const totalSaida = useMemo(() => itensSaida.reduce((acc, it) => acc + (it.quantidade * it.valor_unitario), 0), [itensSaida]);
  const saldoDiferenca = totalEntrada - totalSaida;

  // --- SALVAR ---
  const salvarMovimentacao = async () => {
    if (!clienteNome) { toast.error("Informe o nome do cliente."); return; }
    if (itensEntrada.length === 0 && itensSaida.length === 0) { toast.error("Adicione ao menos um item."); return; }
    
    setLoading(true);
    const idOperacao = crypto.randomUUID();
    const rows: any[] = [];

    // Processar Entradas (Produtos que o cliente devolveu/entregou)
    itensEntrada.forEach(it => {
      rows.push({
        id_operacao: idOperacao,
        cliente_nome: clienteNome,
        vendedor_nome: user?.name || 'Sistema',
        produto_nome: it.nome,
        quantidade: it.quantidade, // Valor positivo (entrada)
        valor_unitario: it.valor_unitario,
        condicao_produto: it.condicao,
        motivo: motivoGeral,
        is_troca: tipoMovimentacao === 'troca',
        is_devolucao: tipoMovimentacao === 'devolucao',
        is_estorno: tipoMovimentacao === 'estorno'
      });
    });

    // Processar Saídas (Produtos que o cliente está levando)
    itensSaida.forEach(it => {
      rows.push({
        id_operacao: idOperacao,
        cliente_nome: clienteNome,
        vendedor_nome: user?.name || 'Sistema',
        produto_nome: it.nome,
        quantidade: -it.quantidade, // Valor negativo (saída)
        valor_unitario: it.valor_unitario,
        condicao_produto: 'venda',
        motivo: motivoGeral,
        is_troca: tipoMovimentacao === 'troca',
        is_devolucao: tipoMovimentacao === 'devolucao',
        is_estorno: tipoMovimentacao === 'estorno'
      });
    });

    try {
      // 1. Inserir Log de Movimentação
      const { error: errorLog } = await supabase.from('movimentacoes_estoque').insert(rows);
      if (errorLog) throw errorLog;

      // 2. Atualizar Estoque Físico
      for (const it of itensEntrada) {
        if (it.condicao === 'retorno_estoque' && it.produto_id) {
           await supabase.rpc('increment_estoque', { row_id: it.produto_id, qtd: it.quantidade });
        }
      }
      for (const it of itensSaida) {
        if (it.produto_id) {
           await supabase.rpc('increment_estoque', { row_id: it.produto_id, qtd: -it.quantidade });
        }
      }

      toast.success("Movimentação registrada com sucesso!");
      limparCampos();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const limparCampos = () => {
    setClienteNome('');
    setMotivoGeral('');
    setItensEntrada([]);
    setItensSaida([]);
    setBuscaProd('');
  };

  const formatarMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const historicoFiltrado = historico.filter(h => 
    h.cliente_nome.toLowerCase().includes(filtroHistorico.toLowerCase()) ||
    h.id_operacao.toLowerCase().includes(filtroHistorico.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 text-foreground [color-scheme:dark]">
      
      {/* HEADER DINÂMICO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-3xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <RefreshCcw className="h-8 w-8 text-primary animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase italic tracking-tighter">Trocas & Devoluções</h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Gestão de movimentações e estornos</p>
          </div>
        </div>

        <div className="flex bg-muted/50 p-1 rounded-xl border border-border">
          <button 
            onClick={() => setAbaAtiva('nova')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${abaAtiva === 'nova' ? 'bg-card text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Plus className="h-4 w-4" /> Nova Operação
          </button>
          <button 
            onClick={() => setAbaAtiva('historico')}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${abaAtiva === 'historico' ? 'bg-card text-primary shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="h-4 w-4" /> Histórico
          </button>
        </div>
      </div>

      {abaAtiva === 'nova' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* COLUNA ESQUERDA: CONFIG E ITENS */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* CARD 1: IDENTIFICAÇÃO */}
            <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
              <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-2">
                 <UserCircle className="h-4 w-4 text-primary" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Dados da Operação</span>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Nome do Cliente / Origem</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input 
                      value={clienteNome}
                      onChange={e => setClienteNome(e.target.value)}
                      placeholder="EX: CONSUMIDOR FINAL"
                      className="w-full h-12 pl-10 pr-4 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Tipo de Movimentação</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['troca', 'devolucao', 'estorno'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTipoMovimentacao(t as any)}
                        className={`h-12 rounded-xl border text-[10px] font-black uppercase transition-all ${tipoMovimentacao === t ? 'bg-primary border-primary text-primary-foreground' : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Motivo / Observações</label>
                  <textarea 
                    value={motivoGeral}
                    onChange={e => setMotivoGeral(e.target.value)}
                    placeholder="Descreva o motivo da troca ou defeito..."
                    rows={2}
                    className="w-full p-4 bg-muted/30 border border-border rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20 resize-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* CARD 2: BUSCA E LISTA DE ENTRADA */}
            <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
              <div className="p-4 border-b border-border bg-emerald-500/5 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Entrada (O que o cliente devolveu)</span>
                 </div>
                 <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input 
                      value={buscaProd}
                      onChange={e => setBuscaProd(e.target.value)}
                      placeholder="Adicionar produto..."
                      className="w-full h-8 pl-8 pr-4 bg-background border border-border rounded-lg text-[10px] font-bold uppercase outline-none focus:border-primary"
                    />
                    {showResultados && resultadosProd.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                        {resultadosProd.map(p => (
                          <button 
                            key={p.id}
                            onClick={() => adicionarItem(p, 'entrada')}
                            className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                          >
                            <div>
                              <p className="text-[10px] font-black uppercase">{p.nome}</p>
                              <p className="text-[8px] text-muted-foreground">CÓD: {p.codigo} | ESTOQUE: {p.estoque_atual}</p>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-primary">{formatarMoeda(p.preco_venda)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                 </div>
              </div>

              <div className="p-0 overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground">Produto</th>
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-center">Quantidade</th>
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-right">Unitário</th>
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-right">Total</th>
                      <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-center">Destino</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itensEntrada.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Package className="h-8 w-8 opacity-20" />
                            <p className="text-[10px] font-black uppercase italic tracking-widest">Nenhum item de entrada adicionado</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      itensEntrada.map(it => (
                        <tr key={it.id_temp} className="hover:bg-muted/10 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="text-[10px] font-black uppercase">{it.nome}</p>
                            <p className="text-[8px] font-mono text-muted-foreground">{it.codigo}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number" 
                                value={it.quantidade}
                                onChange={e => atualizarItem(it.id_temp, 'entrada', 'quantidade', Number(e.target.value))}
                                className="w-16 h-8 text-center bg-muted/30 border border-border rounded-lg text-[10px] font-bold outline-none focus:border-primary"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-[10px] font-mono font-bold">{formatarMoeda(it.valor_unitario)}</td>
                          <td className="px-6 py-4 text-right text-[10px] font-mono font-black text-emerald-500">{formatarMoeda(it.quantidade * it.valor_unitario)}</td>
                          <td className="px-6 py-4">
                            <select 
                              value={it.condicao}
                              onChange={e => atualizarItem(it.id_temp, 'entrada', 'condicao', e.target.value)}
                              className="w-full h-8 bg-muted/30 border border-border rounded-lg text-[9px] font-black uppercase px-2 outline-none appearance-none"
                            >
                              <option value="retorno_estoque" className="bg-card">Retorno ao Estoque</option>
                              <option value="perda" className="bg-card">Avaria / Perda</option>
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => removerItem(it.id_temp, 'entrada')} className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CARD 3: LISTA DE SAÍDA (QUANDO TROCA) */}
            {tipoMovimentacao === 'troca' && (
              <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm animate-in zoom-in-95">
                <div className="p-4 border-b border-border bg-blue-500/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Saída (O que o cliente está levando)</span>
                  </div>
                  <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <input 
                        value={buscaProd}
                        onChange={e => setBuscaProd(e.target.value)}
                        placeholder="Adicionar produto..."
                        className="w-full h-8 pl-8 pr-4 bg-background border border-border rounded-lg text-[10px] font-bold uppercase outline-none focus:border-primary"
                      />
                  </div>
                </div>
                <div className="p-0 overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground">Produto</th>
                        <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-center">Quantidade</th>
                        <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-right">Unitário</th>
                        <th className="px-6 py-3 text-[9px] font-black uppercase text-muted-foreground text-right">Total</th>
                        <th className="px-6 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {itensSaida.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center">
                            <p className="text-[10px] font-black uppercase italic text-muted-foreground opacity-40">Nenhum item de saída selecionado</p>
                          </td>
                        </tr>
                      ) : (
                        itensSaida.map(it => (
                          <tr key={it.id_temp} className="hover:bg-muted/10 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-black uppercase">{it.nome}</p>
                              <p className="text-[8px] font-mono text-muted-foreground">{it.codigo}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center">
                                <input 
                                  type="number" 
                                  value={it.quantidade}
                                  onChange={e => atualizarItem(it.id_temp, 'saida', 'quantidade', Number(e.target.value))}
                                  className="w-16 h-8 text-center bg-muted/30 border border-border rounded-lg text-[10px] font-bold outline-none"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-[10px] font-mono font-bold">{formatarMoeda(it.valor_unitario)}</td>
                            <td className="px-6 py-4 text-right text-[10px] font-mono font-black text-blue-500">{formatarMoeda(it.quantidade * it.valor_unitario)}</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => removerItem(it.id_temp, 'saida')} className="p-2 text-muted-foreground hover:text-red-500 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: RESUMO E AÇÕES */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm sticky top-8">
              <div className="p-4 border-b border-border bg-muted/20 flex items-center gap-2">
                 <Calculator className="h-4 w-4 text-primary" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Resumo Financeiro</span>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                  <span className="text-[10px] font-black uppercase text-emerald-600">Total Entradas (+)</span>
                  <span className="text-sm font-mono font-black text-emerald-600">{formatarMoeda(totalEntrada)}</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                  <span className="text-[10px] font-black uppercase text-blue-600">Total Saídas (-)</span>
                  <span className="text-sm font-mono font-black text-blue-600">{formatarMoeda(totalSaida)}</span>
                </div>

                <div className={`p-6 rounded-2xl border ${saldoDiferenca >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-red-500/5 border-red-500/20'} transition-colors`}>
                   <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Saldo Final (Consolidação)</p>
                   <div className="flex items-baseline gap-2">
                      <p className={`text-3xl font-black font-mono ${saldoDiferenca >= 0 ? 'text-primary' : 'text-red-500'}`}>{formatarMoeda(saldoDiferenca)}</p>
                      <span className="text-[10px] font-bold uppercase opacity-50">{saldoDiferenca >= 0 ? 'A Devolver' : 'A Cobrar'}</span>
                   </div>
                </div>

                <div className="pt-4 space-y-3">
                   <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border">
                      <div className="p-2 bg-card rounded-lg border border-border">
                         <CreditCard className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                         <p className="text-[8px] font-black uppercase text-muted-foreground">Forma de Estorno / Crédito</p>
                         <p className="text-[10px] font-bold uppercase">Crédito em Conta / Vale Troca</p>
                      </div>
                   </div>

                   <button 
                    onClick={salvarMovimentacao}
                    disabled={loading}
                    className="w-full h-16 bg-primary text-primary-foreground rounded-2xl font-black uppercase italic tracking-tighter text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50"
                   >
                     {loading ? <RefreshCcw className="h-6 w-6 animate-spin" /> : (
                       <>
                        <Save className="h-6 w-6" /> Finalizar Operação
                       </>
                     )}
                   </button>
                   
                   <button 
                    onClick={limparCampos}
                    className="w-full h-12 bg-transparent text-muted-foreground hover:text-red-500 rounded-xl font-black uppercase text-[10px] transition-all"
                   >
                     Descartar Alterações
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* --- ABA HISTÓRICO --- */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* FILTROS HISTÓRICO */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-3 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  value={filtroHistorico}
                  onChange={e => setFiltroHistorico(e.target.value)}
                  placeholder="Buscar por cliente ou ID da operação..."
                  className="w-full h-14 pl-12 pr-4 bg-card border border-border rounded-2xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button className="h-14 bg-muted/50 border border-border rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase hover:bg-muted transition-colors">
                <Filter className="h-4 w-4" /> Filtrar Data
              </button>
           </div>

           {/* LISTA HISTÓRICO */}
           <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-sm">
              <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground">ID / Data</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground">Cliente / Vendedor</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground">Tipo</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground">Itens</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground text-right">Valor Consolidado</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                       <tr><td colSpan={6} className="p-12 text-center animate-pulse font-black uppercase text-xs opacity-30">Carregando Histórico...</td></tr>
                    ) : historicoFiltrado.length === 0 ? (
                      <tr><td colSpan={6} className="p-12 text-center font-black uppercase text-xs opacity-30 italic">Nenhum registro encontrado.</td></tr>
                    ) : (
                      historicoFiltrado.map(h => (
                        <tr key={h.id_operacao} className="hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-[10px] font-black font-mono text-primary">{h.id_operacao.split('-')[0]}</p>
                            <p className="text-[8px] text-muted-foreground font-bold">{new Date(h.criado_em).toLocaleString('pt-BR')}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[10px] font-black uppercase">{h.cliente_nome}</p>
                            <div className="flex items-center gap-1 opacity-50">
                               <User className="h-2 w-2" />
                               <span className="text-[8px] font-bold uppercase">{h.vendedor_nome}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex gap-1">
                                {h.is_troca && <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full text-[8px] font-black uppercase border border-blue-500/20">Troca</span>}
                                {h.is_devolucao && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full text-[8px] font-black uppercase border border-emerald-500/20">Devolução</span>}
                                {h.is_estorno && <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded-full text-[8px] font-black uppercase border border-red-500/20">Estorno</span>}
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <p className="text-[10px] font-bold text-muted-foreground uppercase">{h.itens.length} {h.itens.length === 1 ? 'Produto' : 'Produtos'}</p>
                          </td>
                          <td className="px-6 py-4 text-right text-xs font-mono font-black">
                             {formatarMoeda(h.valor_total_agrupado)}
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2">
                                <button onClick={() => setShowDetalhes(h)} className="p-2 bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg transition-all border border-border">
                                   <Eye className="h-4 w-4" />
                                </button>
                                <button className="p-2 bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg transition-all border border-border">
                                   <Printer className="h-4 w-4" />
                                </button>
                             </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {/* --- MODAL DETALHES --- */}
      {showDetalhes && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-4xl bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="p-8 border-b border-border bg-muted/20 flex justify-between items-start">
              <div className="space-y-1">
                 <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-primary text-primary-foreground rounded-full text-[10px] font-black uppercase italic tracking-tighter">Operação #{showDetalhes.id_operacao.split('-')[0]}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{new Date(showDetalhes.criado_em).toLocaleString('pt-BR')}</span>
                 </div>
                 <h2 className="text-3xl font-black uppercase italic tracking-tighter text-foreground">{showDetalhes.cliente_nome}</h2>
                 <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <UserCircle className="h-3 w-3" /> Vendedor: {showDetalhes.vendedor_nome}
                 </p>
              </div>
              <button onClick={() => setShowDetalhes(null)} className="p-3 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-2xl transition-all border border-border">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-muted">
              {/* LISTA DOS ITENS NA MOVIMENTAÇÃO */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                   <Package className="h-3 w-3" /> Detalhamento dos Produtos
                </h3>
                <div className="bg-muted/10 rounded-3xl border border-border overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border">
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground">Movimento</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground">Produto</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground text-center">Qtd</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground text-right">V. Unitário</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground text-right">V. Total</th>
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-muted-foreground text-center">Destino</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {showDetalhes.itens.map((it: any) => (
                        <tr key={it.id} className="hover:bg-muted/5 transition-colors">
                          <td className="px-6 py-4">
                             {Number(it.quantidade) > 0 ? (
                               <span className="flex items-center gap-1 text-[8px] font-black uppercase text-emerald-500">
                                  <ArrowDownCircle className="h-2 w-2" /> Entrada
                               </span>
                             ) : (
                               <span className="flex items-center gap-1 text-[8px] font-black uppercase text-blue-500">
                                  <ArrowRightCircle className="h-2 w-2" /> Saída
                               </span>
                             )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-[10px] font-black uppercase">{it.produto_nome}</p>
                          </td>
                          <td className="px-6 py-4 text-center text-[10px] font-bold font-mono">{Math.abs(it.quantidade)}</td>
                          <td className="px-6 py-4 text-right text-[10px] font-mono">{formatarMoeda(it.valor_unitario)}</td>
                          <td className="px-6 py-4 text-right text-[10px] font-mono font-black">{formatarMoeda(Math.abs(it.quantidade) * Number(it.valor_unitario))}</td>
                          <td className="px-6 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${it.condicao_produto === 'perda' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}>
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
                <p className="text-[10px] font-black uppercase text-muted-foreground">Total Consolidado da Movimentação</p>
                <p className="text-3xl font-black text-primary font-mono">{formatarMoeda(showDetalhes.valor_total_agrupado)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icone auxiliar não importado no topo
function ArrowRightCircle(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right-circle"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="m12 16 4-4-4-4"/></svg>
  )
}