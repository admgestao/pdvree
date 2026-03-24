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
  credito: number;
  limite_compra: number;
  limite_usado: number;
  observacoes?: string;
}

export default function GestaoOperacionalTrocas() {
  const { user } = useAuth();
  // UI States
  const [showCadastro, setShowCadastro] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState<any | null>(null);
  const [abaInterna, setAbaInterna] = useState<'grid' | 'dash'>('grid');
  
  // Estados de Cadastro (Fluxo Duplo)
  const [itensEntrada, setItensEntrada] = useState<ItemTroca[]>([]);
  const [itensSaida, setItensSaida] = useState<ItemTroca[]>([]);
  const [buscaProdEntrada, setBuscaProdEntrada] = useState('');
  const [buscaProdSaida, setBuscaProdSaida] = useState('');
  const [produtosSugestao, setProdutosSugestao] = useState<ProdutoSearch[]>([]);
  const [activeSearch, setActiveSearch] = useState<'entrada' | 'saida' | null>(null);
  
  const [clientes, setClientes] = useState<Pessoa[]>([]);
  const [clienteObj, setClienteObj] = useState<Pessoa | null>(null);
  const [clienteManual, setClienteManual] = useState('');
  
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [vendedorId, setVendedorId] = useState(() => {
    return localStorage.getItem('@pdv:vendedor_id') || '';
  });
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [gerarCredito, setGerarCredito] = useState(false);
  
  const [motivo, setMotivo] = useState('');

  // Estados de Dados e Filtros
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    const { data: users } = await supabase.from('usuarios').select('id, nome_usuario');
    if (users) setVendedores(users);
    const { data: formas } = await supabase.from('formas_pagamento').select('id, nome').eq('ativo', true);
    if (formas) setFormasPagamento(formas);
    const { data: clientesData } = await supabase.from('pessoas').select('*').eq('categoria', 'cliente');
    if (clientesData) setClientes(clientesData);
  }

  async function loadDados() {
    setLoading(true);
    const { data } = await supabase
      .from('movimentacoes_estoque')
      .select('*')
      .order('data_registro', { ascending: false });
    if (data) setHistorico(data);
    setLoading(false);
  }

  function selectCliente(id: string) {
    const c = clientes.find(x => x.id === id);
    if (c) {
      setClienteObj(c); 
      setClienteManual('');
    } else {
      setClienteObj(null);
    }
  }

  const handleVendedorChange = (id: string) => {
    setVendedorId(id);
    localStorage.setItem('@pdv:vendedor_id', id);
  };

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
  const searchProducts = useCallback(async (term: string, type: 'entrada' | 'saida') => {
    const query = term.trim();
    if (type === 'entrada') setBuscaProdEntrada(term);
    else setBuscaProdSaida(term);
    
    setActiveSearch(type);

    if (query.length < 2) { 
      setProdutosSugestao([]); 
      return; 
    }
    
    try {
      const { data: pData } = await supabase.from('produtos').select('*')
        .or(`nome.ilike.%${query}%,codigo.ilike.%${query}%,categoria.ilike.%${query}%`)
        .limit(10);
      
      const { data: lData } = await supabase.from('produto_lotes')
        .select('*, produtos(*)')
        .ilike('codigo_barras', `%${query}%`)
        .limit(5);

      let combined: ProdutoSearch[] = (pData || []).map(p => ({
        id: p.id, nome: p.nome, codigo: p.codigo || '',
        preco_venda: Number(p.preco_venda) || 0,
        estoque_atual: Number(p.estoque_atual) || 0,
        categoria: p.categoria || ''
      }));

      if (lData) {
        lData.forEach(lote => {
          if (lote.produtos && !combined.find(p => p.id === lote.produtos.id && p.lote_id === lote.id)) {
            combined.push({
              id: lote.produtos.id,
              nome: lote.produtos.nome,
              codigo: lote.produtos.codigo || '',
              preco_venda: Number(lote.produtos.preco_venda) || 0,
              estoque_atual: Number(lote.produtos.estoque_atual) || 0,
              categoria: lote.produtos.categoria || '',
              lote_id: lote.id,
              lote_codigo: lote.codigo_barras
            });
          }
        });
      }

      setProdutosSugestao(combined);
    } catch (error) { 
      toast.error("Erro ao buscar produtos"); 
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { 
      if(activeSearch === 'entrada' && buscaProdEntrada.trim() !== '') searchProducts(buscaProdEntrada, 'entrada');
      if(activeSearch === 'saida' && buscaProdSaida.trim() !== '') searchProducts(buscaProdSaida, 'saida');
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaProdEntrada, buscaProdSaida, searchProducts]);

  const adicionarItemEntrada = (p: ProdutoSearch) => {
    const novo: ItemTroca = {
      id_temp: crypto.randomUUID(),
      produto_id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      valor_unitario: p.preco_venda,
      quantidade: 1,
      lote_id: p.lote_id,
      lote_codigo: p.lote_codigo,
      condicao: 'retorno_estoque' // Default
    };
    setItensEntrada([...itensEntrada, novo]);
    setBuscaProdEntrada('');
    setProdutosSugestao([]);
    setActiveSearch(null);
  };

  const adicionarItemSaida = (p: ProdutoSearch) => {
    if (p.estoque_atual <= 0) {
      toast.error('Produto sem estoque disponível para saída.');
      return;
    }
    const novo: ItemTroca = {
      id_temp: crypto.randomUUID(),
      produto_id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      valor_unitario: p.preco_venda,
      quantidade: 1,
      lote_id: p.lote_id,
      lote_codigo: p.lote_codigo,
      estoque_atual: p.estoque_atual
    };
    setItensSaida([...itensSaida, novo]);
    setBuscaProdSaida('');
    setProdutosSugestao([]);
    setActiveSearch(null);
  };

  const updateQtd = (id_temp: string, delta: number, list: 'entrada' | 'saida') => {
    if (list === 'entrada') {
      setItensEntrada(prev => prev.map(i => {
        if (i.id_temp !== id_temp) return i;
        const nQtd = i.quantidade + delta;
        return nQtd > 0 ? { ...i, quantidade: nQtd } : i;
      }));
    } else {
      setItensSaida(prev => prev.map(i => {
        if (i.id_temp !== id_temp) return i;
        const nQtd = i.quantidade + delta;
        if (nQtd > 0 && i.estoque_atual && nQtd > i.estoque_atual) {
          toast.error('Estoque insuficiente!');
          return i;
        }
        return nQtd > 0 ? { ...i, quantidade: nQtd } : i;
      }));
    }
  };

  async function excluirRegistro(id_operacao: string) {
    if (!confirm("Deseja excluir este registro de movimentação? A exclusão não reverterá vendas ou créditos automaticamente.")) return;
    const { error } = await supabase.from('movimentacoes_estoque').delete().eq('id_operacao', id_operacao);
    if (!error) {
      toast.success("Registro removido");
      loadDados();
    }
  }

  // --- CÁLCULOS TOTAIS ---
  const totalEntrada = itensEntrada.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0);
  const totalSaida = itensSaida.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0);
  const diferenca = totalSaida - totalEntrada;

  async function salvarRegistro() {
    if (itensEntrada.length === 0 && itensSaida.length === 0) return toast.error("Adicione itens à operação");
    if (!vendedorId) return toast.error("Selecione o Vendedor(a)!");
    
    // Validações Financeiras
    if (diferenca > 0 && !formaPagamentoId) {
      return toast.error("Selecione a Forma de Pagamento para a diferença do valor.");
    }
    if (diferenca < 0 && gerarCredito && !clienteObj) {
      return toast.error("Para gerar crédito, é necessário selecionar um cliente cadastrado.");
    }

    setSaving(true);
    const operacao_id = crypto.randomUUID();
    const vendedorNomeDisplay = vendedores.find(v => v.id === vendedorId)?.nome_usuario || 'Sistema';
    const isTroca = itensEntrada.length > 0 && itensSaida.length > 0;
    const isDevolucao = itensEntrada.length > 0 && itensSaida.length === 0;

    try {
      // 1. Processar Entradas (Devoluções) - Tabela movimentacoes_estoque e Estoque
      for (const item of itensEntrada) {
        // Criar registro na movimentação
        await supabase.from('movimentacoes_estoque').insert({
          id_operacao: operacao_id,
          is_troca: isTroca,
          is_devolucao: isDevolucao,
          is_estorno: false,
          cliente_nome: clienteObj?.nome || clienteManual || 'Consumidor Final',
          vendedor_nome: vendedorNomeDisplay,
          produto_nome: item.nome,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          condicao_produto: item.condicao || 'retorno_estoque',
          motivo: motivo || 'Troca/Devolução via Sistema'
        });

        // Atualizar Estoque SE for retorno_estoque
        if (item.condicao === 'retorno_estoque' && item.produto_id) {
          const { data: prodData } = await supabase.from('produtos').select('estoque_atual').eq('id', item.produto_id).single();
          if (prodData) {
            await supabase.from('produtos').update({ estoque_atual: Number(prodData.estoque_atual) + item.quantidade }).eq('id', item.produto_id);
          }
          if (item.lote_id) {
            const { data: loteData } = await supabase.from('produto_lotes').select('quantidade_atual').eq('id', item.lote_id).single();
            if (loteData) {
              const novaQtd = Number(loteData.quantidade_atual) + item.quantidade;
              await supabase.from('produto_lotes').update({ 
                quantidade_atual: novaQtd, 
                quantidade: novaQtd, 
                status: 'ativo' 
              }).eq('id', item.lote_id);
            }
          }
        }
      }

      // 2. Processar Saídas (Novos Produtos)
      if (itensSaida.length > 0) {
        for (const item of itensSaida) {
          if(!item.produto_id) continue;
          const { data: prodData } = await supabase.from('produtos').select('estoque_atual').eq('id', item.produto_id).single();
          if (prodData) {
            await supabase.from('produtos').update({ estoque_atual: Number(prodData.estoque_atual) - item.quantidade }).eq('id', item.produto_id);
          }
          if (item.lote_id) {
            const { data: loteData } = await supabase.from('produto_lotes').select('quantidade_atual').eq('id', item.lote_id).single();
            if (loteData) {
              const novaQtd = Number(loteData.quantidade_atual) - item.quantidade;
              await supabase.from('produto_lotes').update({ 
                quantidade_atual: novaQtd, 
                quantidade: novaQtd, 
                status: novaQtd <= 0 ? 'esgotado' : 'ativo' 
              }).eq('id', item.lote_id);
            }
          }
        }

        if (diferenca > 0) {
          const { data: vendaNova, error: vendaErr } = await supabase.from('vendas').insert({
            cliente_id: clienteObj?.id || null,
            cliente_nome_manual: clienteObj ? null : clienteManual,
            usuario_id: user?.id || 'Operador',
            vendedor_nome: vendedorNomeDisplay,
            subtotal: totalSaida,
            desconto: totalEntrada,
            custo_adicional: 0,
            custo_no_lucro: false,
            total: diferenca,
            forma_pagamento_id: formaPagamentoId,
            troco: 0,
            observacao: `Venda gerada por diferença de Troca. Ref OP: ${operacao_id}. ${motivo}`,
          }).select('id').single();

          if (vendaErr) throw vendaErr;

          const itensParaSalvar = itensSaida.map(item => ({
            venda_id: vendaNova.id,
            produto_id: item.produto_id,
            produto_nome: item.nome,
            quantidade: item.quantidade,
            preco: item.valor_unitario,
            desconto_item: 0,
            desconto_tipo_item: 'fixed',
            total: item.quantidade * item.valor_unitario
          }));
          await supabase.from('vendas_itens').insert(itensParaSalvar);

          const formaNome = formasPagamento.find(f => f.id === formaPagamentoId)?.nome.toLowerCase() || '';
          if (formaNome.includes('dinheiro')) {
            await supabase.from('caixa_movimentos').insert({
              usuario_id: user?.name || user?.id || 'Sistema',
              tipo: 'entrada',
              valor: diferenca,
              descricao: `Recebimento de diferença de troca (Venda).`
            });
          }
        }
      }

      // 3. Gerar Crédito
      if (diferenca < 0 && gerarCredito && clienteObj) {
        const valorCredito = Math.abs(diferenca);
        await supabase.from('pessoas').update({ 
          credito: Number(clienteObj.credito || 0) + valorCredito 
        }).eq('id', clienteObj.id);
        toast.success(`Crédito de ${formatarMoeda(valorCredito)} adicionado ao cliente.`);
      }

      toast.success("Operação concluída com sucesso!");
      setShowCadastro(false);
      setItensEntrada([]);
      setItensSaida([]);
      setClienteManual('');
      setClienteObj(null);
      setMotivo('');
      setGerarCredito(false);
      setFormaPagamentoId('');
      loadDados();

    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar registro");
    } finally {
      setSaving(false);
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
            
            <select className="bg-background border border-border px-3 py-2 rounded-lg text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/30 text-foreground" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos os Tipos</option>
              <option value="is_troca">Trocas</option>
              <option value="is_devolucao">Devoluções</option>
              <option value="is_estorno">Estornos</option>
            </select>

            <select className="bg-background border border-border px-3 py-2 rounded-lg text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/30 text-foreground" value={filtroCondicao} onChange={e => setFiltroCondicao(e.target.value)}>
              <option value="todos">Status: Todos</option>
              <option value="perda">Avaria</option>
              <option value="retorno_estoque">Estoque</option>
            </select>

            <div className="flex gap-2">
              <input type="date" className="bg-background border border-border px-2 py-2 rounded-lg text-[10px] font-bold text-foreground" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} />
              <input type="date" className="bg-background border border-border px-2 py-2 rounded-lg text-[10px] font-bold text-foreground" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} />
            </div>

            <button onClick={() => setOrdemCrescente(!ordemCrescente)} className="p-2 bg-muted text-muted-foreground rounded-lg hover:bg-border transition-colors">
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
                        <div className="font-bold text-foreground">{new Date(reg.data_registro).toLocaleDateString()}</div>
                        <div className="opacity-50 text-[9px] uppercase text-muted-foreground">{reg.vendedor_nome}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {reg.is_troca && <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[8px] font-black">T</span>}
                          {reg.is_devolucao && <span className="px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[8px] font-black">D</span>}
                          {reg.is_estorno && <span className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black">E</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-black uppercase text-foreground">{reg.nomes_produtos.length > 1 ? "Mais de um produto" : reg.produto_nome}</div>
                        <div className="text-[9px] text-muted-foreground italic font-bold uppercase">{reg.cliente_nome}</div>
                      </td>
                      <td className="px-5 py-3 text-center font-bold text-foreground">
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

      {/* MODAL GIGANTE DE LANÇAMENTO DA TROCA/DEVOLUÇÃO */}
      {showCadastro && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full h-full max-w-7xl max-h-[96vh] bg-card border border-border rounded-3xl flex flex-col shadow-2xl">
            
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20 rounded-t-3xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl">
                  <ArrowRightLeft className="text-primary h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase text-foreground">Operação de Troca / Devolução</h2>
                  <p className="text-[11px] text-muted-foreground font-bold tracking-widest uppercase">Terminal de resolução de divergências</p>
                </div>
              </div>
              <button onClick={() => setShowCadastro(false)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"><X size={24}/></button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row p-4 gap-4">
              <div className="flex-[4] flex flex-col gap-4 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-secondary/30 border border-border rounded-2xl shrink-0">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                      <UserCircle className="h-4 w-4" /> Vendedor(a) *
                    </label>
                    <select 
                      value={vendedorId} 
                      onChange={(e) => handleVendedorChange(e.target.value)} 
                      className={`w-full h-11 px-3 rounded-xl border text-sm font-bold transition-all outline-none bg-background border-border text-foreground ${!vendedorId ? 'border-yellow-500/50' : ''}`}
                    >
                      <option value="" className="bg-background text-foreground">-- SELECIONE --</option>
                      {vendedores.map(v => (
                        <option key={v.id} value={v.id} className="bg-background text-foreground">{v.nome_usuario.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <User className="h-4 w-4" /> Buscar Cliente
                    </label>
                    <select 
                      value={clienteObj?.id || ''} 
                      onChange={(e) => selectCliente(e.target.value)} 
                      className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-bold text-foreground outline-none"
                    >
                      <option value="" className="bg-background text-foreground">-- Consumidor Final / Avulso --</option>
                      {clientes.map(c => <option key={c.id} value={c.id} className="bg-background text-foreground">{c.nome}</option>)}
                    </select>
                  </div>

                  {clienteObj && (
                    <div className="col-span-1 md:col-span-2 p-3 bg-background border border-border rounded-xl animate-in fade-in">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground">Status do Cliente</span>
                        {clienteObj.observacoes && <span className="text-[10px] text-yellow-600 font-bold bg-yellow-500/10 px-2 py-0.5 rounded animate-pulse">Atenção: {clienteObj.observacoes}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-2 rounded bg-secondary/50 border border-border">
                          <p className="text-[10px] uppercase text-muted-foreground font-bold">Crédito Disponível</p>
                          <p className="font-mono text-green-600 font-black text-sm">{formatarMoeda(clienteObj.credito)}</p>
                        </div>
                        <div className="p-2 rounded bg-secondary/50 border border-border">
                          <p className="text-[10px] uppercase text-muted-foreground font-bold">Limite de Compra</p>
                          <p className="font-mono text-primary font-black text-sm">{formatarMoeda(clienteObj.limite_compra)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!clienteObj && (
                    <div className="col-span-1 md:col-span-2">
                      <input type="text" value={clienteManual} onChange={(e) => setClienteManual(e.target.value)} placeholder="Ou digite o nome do cliente manualmente (Sem vínculo de crédito)..." className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-medium text-foreground outline-none" />
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col bg-card border-2 border-red-500/20 rounded-2xl overflow-hidden min-h-[200px]">
                  <div className="p-4 bg-red-500/10 border-b border-red-500/20 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowDownCircle className="text-red-500 h-5 w-5" />
                      <h3 className="font-black text-red-500 uppercase text-sm">Entrada (Produtos Devolvidos)</h3>
                    </div>
                  </div>
                  <div className="p-4 shrink-0 border-b border-border bg-muted/10">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input className="w-full pl-10 h-11 bg-background border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30 text-foreground" placeholder="Bipar ou buscar produto devolvido..." value={buscaProdEntrada} onChange={(e) => searchProducts(e.target.value, 'entrada')} />
                      
                      {activeSearch === 'entrada' && produtosSugestao.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-auto max-h-64">
                          {produtosSugestao.map((p, idx) => (
                            <button key={idx} onClick={() => adicionarItemEntrada(p)} className="w-full flex justify-between px-4 py-3 text-left hover:bg-primary/5 border-b border-border last:border-0 font-bold text-xs uppercase text-foreground transition-colors">
                              <span>{p.nome} {p.lote_codigo && <span className="text-[10px] text-muted-foreground ml-1">(Lote: {p.lote_codigo})</span>}</span>
                              <span className="text-primary font-mono">{formatarMoeda(p.preco_venda)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5 scrollbar-thin scrollbar-thumb-border">
                    {itensEntrada.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 italic py-10">
                        <ArrowDownCircle size={40} className="mb-2" />
                        <p className="text-[10px] font-bold uppercase">Nenhum produto para entrada</p>
                      </div>
                    ) : (
                      itensEntrada.map((item) => (
                        <div key={item.id_temp} className="flex items-center justify-between p-3 bg-background border border-border rounded-xl group animate-in slide-in-from-left-2">
                          <div className="flex-1">
                            <p className="text-[11px] font-black uppercase text-foreground">{item.nome}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[9px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.codigo}</span>
                              <select 
                                value={item.condicao} 
                                onChange={(e) => setItensEntrada(prev => prev.map(i => i.id_temp === item.id_temp ? { ...i, condicao: e.target.value as any } : i))}
                                className="text-[9px] font-black uppercase bg-background border-none text-primary cursor-pointer outline-none"
                              >
                                <option value="retorno_estoque" className="bg-background text-foreground">✓ Retornar ao Estoque</option>
                                <option value="perda" className="bg-background text-foreground">⚠ Avaria / Perda</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center bg-muted/50 rounded-lg p-1 border border-border">
                              <button onClick={() => updateQtd(item.id_temp, -1, 'entrada')} className="p-1 hover:bg-background rounded transition-colors"><ArrowLeft size={12}/></button>
                              <span className="w-8 text-center font-mono font-black text-xs text-foreground">{item.quantidade}</span>
                              <button onClick={() => updateQtd(item.id_temp, 1, 'entrada')} className="p-1 hover:bg-background rounded transition-colors"><ArrowRight size={12}/></button>
                            </div>
                            <div className="text-right min-w-[80px]">
                              <p className="text-xs font-black text-foreground font-mono">{formatarMoeda(item.quantidade * item.valor_unitario)}</p>
                            </div>
                            <button onClick={() => setItensEntrada(prev => prev.filter(i => i.id_temp !== item.id_temp))} className="p-2 text-muted-foreground hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-[3] flex flex-col gap-4 overflow-hidden">
                <div className="flex-1 flex flex-col bg-card border-2 border-emerald-500/20 rounded-2xl overflow-hidden min-h-[200px]">
                  <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="text-emerald-500 h-5 w-5" />
                      <h3 className="font-black text-emerald-500 uppercase text-sm">Saída (Novos Produtos)</h3>
                    </div>
                  </div>
                  <div className="p-4 shrink-0 border-b border-border bg-muted/10">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input className="w-full pl-10 h-11 bg-background border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 text-foreground" placeholder="Buscar novo produto..." value={buscaProdSaida} onChange={(e) => searchProducts(e.target.value, 'saida')} />
                      
                      {activeSearch === 'saida' && produtosSugestao.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-auto max-h-64">
                          {produtosSugestao.map((p, idx) => (
                            <button key={idx} onClick={() => adicionarItemSaida(p)} className="w-full flex justify-between px-4 py-3 text-left hover:bg-primary/5 border-b border-border last:border-0 font-bold text-xs uppercase text-foreground transition-colors">
                              <div className="flex flex-col">
                                <span>{p.nome}</span>
                                <span className="text-[9px] text-muted-foreground font-mono">ESTOQUE: {p.estoque_atual}</span>
                              </div>
                              <span className="text-primary font-mono">{formatarMoeda(p.preco_venda)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5 scrollbar-thin scrollbar-thumb-border">
                    {itensSaida.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-40 italic py-10">
                        <Plus size={40} className="mb-2" />
                        <p className="text-[10px] font-bold uppercase">Nenhum produto para saída</p>
                      </div>
                    ) : (
                      itensSaida.map((item) => (
                        <div key={item.id_temp} className="flex flex-col p-3 bg-background border border-border rounded-xl animate-in slide-in-from-right-2">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-[11px] font-black uppercase text-foreground">{item.nome}</p>
                            <button onClick={() => setItensSaida(prev => prev.filter(i => i.id_temp !== item.id_temp))} className="text-muted-foreground hover:text-red-500"><X size={14}/></button>
                          </div>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center bg-muted/50 rounded-lg p-1 border border-border">
                              <button onClick={() => updateQtd(item.id_temp, -1, 'saida')} className="p-1 hover:bg-background rounded transition-colors"><ArrowLeft size={10}/></button>
                              <span className="w-8 text-center font-mono font-black text-[11px] text-foreground">{item.quantidade}</span>
                              <button onClick={() => updateQtd(item.id_temp, 1, 'saida')} className="p-1 hover:bg-background rounded transition-colors"><ArrowRight size={10}/></button>
                            </div>
                            <p className="text-xs font-black text-emerald-600 font-mono">{formatarMoeda(item.quantidade * item.valor_unitario)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3 shrink-0">
                  <div className="flex justify-between text-[10px] font-black uppercase text-muted-foreground">
                    <span>Total Entradas (Crédito)</span>
                    <span className="font-mono">{formatarMoeda(totalEntrada)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase text-muted-foreground">
                    <span>Total Saídas (Débito)</span>
                    <span className="font-mono">{formatarMoeda(totalSaida)}</span>
                  </div>
                  <div className="pt-2 border-t border-primary/20 flex justify-between items-center">
                    <span className="text-[11px] font-black uppercase text-primary">Saldo da Operação</span>
                    <span className={`text-xl font-black font-mono ${diferenca >= 0 ? 'text-emerald-500' : 'text-blue-500'}`}>
                      {formatarMoeda(diferenca)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border">
                  {diferenca > 0 && (
                    <div className="space-y-1.5 animate-in fade-in">
                      <label className="text-[10px] font-black uppercase text-foreground flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5" /> Forma de Pagamento (Diferença)
                      </label>
                      <select 
                        value={formaPagamentoId} 
                        onChange={(e) => setFormaPagamentoId(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-border bg-background text-[11px] font-bold text-foreground outline-none"
                      >
                        <option value="" className="bg-background text-foreground">-- Selecione --</option>
                        {formasPagamento.map(f => <option key={f.id} value={f.id} className="bg-background text-foreground">{f.nome.toUpperCase()}</option>)}
                      </select>
                    </div>
                  )}

                  {diferenca < 0 && clienteObj && (
                    <div className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl animate-in fade-in">
                      <input type="checkbox" id="checkCredito" checked={gerarCredito} onChange={e => setGerarCredito(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                      <label htmlFor="checkCredito" className="text-[10px] font-black uppercase text-blue-600 cursor-pointer">Transformar saldo de {formatarMoeda(Math.abs(diferenca))} em crédito para o cliente?</label>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-foreground">Observações / Motivo</label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva brevemente o motivo desta troca ou devolução..." className="w-full h-16 p-3 rounded-xl border border-border bg-background text-[11px] font-medium text-foreground outline-none resize-none" />
                  </div>

                  <button 
                    onClick={salvarRegistro}
                    disabled={saving}
                    className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <RefreshCcw className="animate-spin" size={18}/> : <Save size={18}/>}
                    {saving ? 'Processando...' : 'Finalizar Movimentação'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALHES (VIEW ONLY) */}
      {showDetalhes && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Eye className="text-primary h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase text-foreground">Detalhes da Operação</h3>
                  <p className="text-[9px] font-black text-muted-foreground uppercase opacity-60">ID: {showDetalhes.id_operacao}</p>
                </div>
              </div>
              <button onClick={() => setShowDetalhes(null)} className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-colors"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Cliente / Vínculo</p>
                  <p className="text-xs font-black uppercase text-foreground">{showDetalhes.cliente_nome}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black uppercase text-muted-foreground mb-1">Operador Responsável</p>
                  <p className="text-xs font-black uppercase text-foreground">{showDetalhes.vendedor_nome}</p>
                </div>
              </div>

              <div className="bg-muted/30 rounded-2xl border border-border overflow-hidden">
                <div className="p-3 bg-muted/50 border-b border-border">
                   <p className="text-[8px] font-black uppercase text-muted-foreground">Produtos Movimentados</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-[10px]">
                    <tbody className="divide-y divide-border">
                      {showDetalhes.itens_originais.map((it: any, i: number) => (
                        <tr key={i} className="hover:bg-primary/5 transition-colors">
                          <td className="px-4 py-3 font-bold uppercase text-foreground">{it.produto_nome}</td>
                          <td className="px-4 py-3 text-center font-mono font-black text-foreground">{it.quantidade} un.</td>
                          <td className="px-4 py-3 text-right font-mono font-black text-primary">{formatarMoeda(Number(it.valor_total))}</td>
                          <td className="px-4 py-3 text-center">
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

      {/* FOOTER DA TELA */}
      <footer className="pt-4 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-muted-foreground/40 print:hidden">
        <p className="text-[9px] font-bold uppercase tracking-widest italic">Sistema de Gestão - Logística Reversa v2.0</p>
        <div className="flex gap-4 items-center">
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
              <span className="text-[8px] font-black uppercase tracking-tighter">Troca Ativa</span>
           </div>
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[8px] font-black uppercase tracking-tighter">Devolução Concluída</span>
           </div>
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <span className="text-[8px] font-black uppercase tracking-tighter">Avaria Registrada</span>
           </div>
        </div>
      </footer>
    </div>
  );
}