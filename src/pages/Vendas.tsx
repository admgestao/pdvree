import { useState, useEffect } from 'react';
import { 
  Search, X, Eye, Printer, List, Package, Briefcase, TrendingUp, 
  DollarSign, PieChart, FileText, Zap, Pencil, Ban, AlertTriangle,
  CheckCircle, ShoppingCart, User, Percent, CreditCard, Check,
  Plus, Minus, Trash2, UserCircle, Tag, PlusCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ValueDisplay } from '@/components/ValueDisplay';
import { useVisibility } from '@/contexts/VisibilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface Venda {
  id: string;
  cliente_id: string;
  usuario_id: string;
  subtotal: number;
  desconto: number;
  custo_adicional: number;
  desc_custo_adicional?: string;
  custo_no_lucro?: boolean;
  total: number;
  total_custo?: number;
  lucro_liquido?: number;
  forma_pagamento_id: string;
  troco: number;
  observacao: string;
  criado_em: string;
  cliente_nome?: string;
  forma_nome?: string;
  formas_resumo?: string;
  vendedor_nome?: string;
  status?: 'normal' | 'editada' | 'cancelada';
  editado_em?: string;
  editado_por?: string;
  cancelado_em?: string;
  cancelado_por?: string;
  motivo_cancelamento?: string;
}

interface VendaItem {
  id: string;
  venda_id: string;
  produto_id?: string;
  produto_nome: string;
  quantidade: number;
  preco: number;
  desconto_item?: number;
  desconto_tipo_item?: string;
  total: number;
  criado_em?: string;
  vendedor_nome?: string;
  codigo_produto?: string;
  lote_observacao?: string;
  lote_codigo?: string;
  produtos?: {
    preco_custo: number; 
  };
}

interface CartItem {
  cartItemId: string;
  id: string;
  nome: string;
  codigo: string;
  marca?: string;
  price: number;
  preco_custo: number;
  quantity: number;
  stock: number;
  discount: number;
  discountType: 'percent' | 'fixed';
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

interface FormaPagamento {
  id: string;
  nome: string;
}

interface PagamentoSplit {
  splitId: string;
  forma_pagamento_id: string;
  valor: number;
}

export default function Vendas() {
  const { toggleGlobal } = useVisibility();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'vendas' | 'itens' | 'admin'>('vendas');
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [todosItens, setTodosItens] = useState<VendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [filtroData, setFiltroData] = useState('hoje');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<VendaItem[]>([]);
  const [dadosEmpresa, setDadosEmpresa] = useState<any>(null);
  const [printSelection, setPrintSelection] = useState<{venda: Venda, itens: VendaItem[], tipo: 'comum' | 'admin'} | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [vendaParaCancelar, setVendaParaCancelar] = useState<Venda | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);

  // ✅ NOVO — Estados para exclusão permanente (Master)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [vendaParaDeletar, setVendaParaDeletar] = useState<Venda | null>(null);
  const [deletando, setDeletando] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [vendaParaEditar, setVendaParaEditar] = useState<Venda | null>(null);
  const [editando, setEditando] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteObj, setClienteObj] = useState<Pessoa | null>(null);
  const [clienteManual, setClienteManual] = useState('');
  const [observacao, setObservacao] = useState('');
  const [custoAdicional, setCustoAdicional] = useState(0);
  const [descCusto, setDescCusto] = useState('');
  const [custoNoLucro, setCustoNoLucro] = useState(false);
  const [descontoGeral, setDescontoGeral] = useState(0);
  const [descontoGeralTipo, setDescontoGeralTipo] = useState<'percent' | 'fixed'>('percent');
  const [clientes, setClientes] = useState<Pessoa[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [vendedores, setVendedores] = useState<{id: string; nome_usuario: string}[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [pagamentos, setPagamentos] = useState<PagamentoSplit[]>([]);
  const [showFinalizeEdit, setShowFinalizeEdit] = useState(false);

  // ─── Funções utilitárias ─────────────────────────────────────────────────────
  const fCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatDateTime = (dateString?: string) => dateString ? new Date(dateString).toLocaleString('pt-BR') : '-';
  
  const formatDateToISO = (date: Date) => {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const getPeriodoStr = () => {
    const labels: Record<string, string> = {
      hoje: 'Hoje', ontem: 'Ontem', semana: 'Esta Semana', 
      mes: 'Este Mês', todos: 'Todo o Período'
    };
    if (filtroData !== 'personalizado' && filtroData !== 'todos') {
      const label = labels[filtroData] || filtroData;
      if (startDate && endDate) {
        const inicio = formatDate(startDate + 'T00:00:00');
        const fim = formatDate(endDate + 'T00:00:00');
        return inicio === fim ? `${label} (${inicio})` : `${label} (${inicio} até ${fim})`;
      }
      return label;
    }
    if (filtroData === 'todos') return 'Todo o Período';
    const inicio = startDate ? formatDate(startDate + 'T00:00:00') : 'início';
    const fim = endDate ? formatDate(endDate + 'T00:00:00') : 'hoje';
    return `Personalizado: ${inicio} até ${fim}`;
  };

  // ─── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (filtroData === 'personalizado') return;

    const hoje = new Date();
    let inicio = '';
    let fim = '';

    switch (filtroData) {
      case 'hoje':
        inicio = formatDateToISO(hoje);
        fim = formatDateToISO(hoje);
        break;
      case 'ontem':
        const ontem = new Date(hoje);
        ontem.setDate(hoje.getDate() - 1);
        inicio = formatDateToISO(ontem);
        fim = formatDateToISO(ontem);
        break;
      case 'semana':
        const diaSemana = hoje.getDay();
        const diasParaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - diasParaSegunda);
        inicio = formatDateToISO(inicioSemana);
        fim = formatDateToISO(hoje);
        break;
      case 'mes':
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        inicio = formatDateToISO(inicioMes);
        fim = formatDateToISO(fimMes);
        break;
      default:
        inicio = '';
        fim = '';
        break;
    }

    setStartDate(inicio);
    setEndDate(fim);
  }, [filtroData]);

  useEffect(() => {
    load();
  }, [startDate, endDate]);

  // ─── Carregamento de dados ────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    try {
      const { data: emp } = await supabase.from('empresa').select('*').limit(1).single();
      setDadosEmpresa(emp);

      let queryVendas = supabase.from('vendas').select('*').order('criado_em', { ascending: false });
      if (startDate) queryVendas = queryVendas.gte('criado_em', startDate);
      if (endDate) queryVendas = queryVendas.lte('criado_em', endDate + 'T23:59:59');
      const { data: vendasData } = await queryVendas;
      
      if (!vendasData || vendasData.length === 0) {
        setVendas([]);
        setTodosItens([]);
        setLoading(false);
        return;
      }

      const idsVendas = vendasData.map((v: any) => v.id);
      const [resClientes, resFormas, resItens, resPagamentos] = await Promise.all([
        supabase.from('pessoas').select('id, nome'),
        supabase.from('formas_pagamento').select('id, nome'),
        supabase.from('vendas_itens').select('*').in('venda_id', idsVendas),
        supabase.from('vendas_pagamentos').select('*').in('venda_id', idsVendas)
      ]);
      
      const itensData = resItens.data || [];
      const pagamentosData = resPagamentos.data || [];
      const formasData = resFormas.data || [];
      const produtoIds = [...new Set(itensData.map(i => i.produto_id).filter(Boolean))];

      let produtosData: any[] = [];
      let lotesData: any[] = [];
      if (produtoIds.length > 0) {
        const [resProdutos, resLotes] = await Promise.all([
          supabase.from('produtos').select('id, custo, codigo').in('id', produtoIds),
          supabase.from('produto_lotes').select('produto_id, codigo_barras, custo, observacao').in('produto_id', produtoIds)
        ]);
        produtosData = resProdutos.data || [];
        lotesData = resLotes.data || [];
      }

      const mappedItens = itensData.map(item => {
        let custoUn = 0;
        let codigoProduto = '';
        let loteObservacao = '';

        if (item.lote_codigo) {
          const lote = lotesData.find((l: any) => l.produto_id === item.produto_id && l.codigo_barras === item.lote_codigo);
          if (lote) {
            custoUn = Number(lote.custo || 0);
            codigoProduto = lote.codigo_barras || '';
            loteObservacao = lote.observacao || '';
          }
        } else {
          const loteMatch = item.produto_nome?.match(/\(Lote:\s*(.*?)\)/);
          if (loteMatch && loteMatch[1]) {
            const codigoLote = loteMatch[1].trim();
            const lote = lotesData.find((l: any) => l.produto_id === item.produto_id && l.codigo_barras === codigoLote);
            
            if (lote && lote.custo !== undefined && lote.custo !== null) {
              custoUn = Number(lote.custo);
              codigoProduto = lote.codigo_barras || '';
              loteObservacao = lote.observacao || '';
            } else {
              const prod = produtosData.find(p => p.id === item.produto_id);
              custoUn = prod && prod.custo !== undefined ? Number(prod.custo) : 0;
              codigoProduto = prod?.codigo || '';
            }
          } else {
            const prod = produtosData.find(p => p.id === item.produto_id);
            custoUn = prod && prod.custo !== undefined ? Number(prod.custo) : 0;
            codigoProduto = prod?.codigo || '';
            if (item.produto_id) {
              const lotesDoItem = lotesData.filter(l => l.produto_id === item.produto_id);
              if (lotesDoItem.length > 0) {
                loteObservacao = lotesDoItem[0].observacao || '';
              }
            }
          }
        }

        const vendaPai = vendasData.find((v: any) => v.id === item.venda_id);
        return { 
          ...item, 
          criado_em: vendaPai?.criado_em,
          vendedor_nome: vendaPai?.vendedor_nome,
          produtos: { preco_custo: custoUn },
          codigo_produto: codigoProduto,
          lote_observacao: loteObservacao
        };
      });

      const mappedVendas = vendasData.map((v: any) => {
        const itensDestaVenda = mappedItens.filter(i => i.venda_id === v.id);
        const totalCustoCalculado = itensDestaVenda.reduce((acc, curr) => acc + (curr.produtos.preco_custo * curr.quantidade), 0);
        const valorCustoAdicional = Number(v.custo_adicional) || 0;
        const lucroCalculado = Number(v.total) - totalCustoCalculado - (v.custo_no_lucro ? 0 : valorCustoAdicional);

        const pagamentosDaVenda = pagamentosData.filter((p: any) => p.venda_id === v.id);
        let formas_resumo = '';
        if (pagamentosDaVenda.length > 0) {
          const nomes = pagamentosDaVenda
            .map((pg: any) => {
              const f = formasData.find(ff => ff.id === pg.forma_pagamento_id);
              return f?.nome?.toUpperCase() || 'DESCONHECIDO';
            })
            .filter(Boolean);
          const unicos = Array.from(new Set(nomes));
          formas_resumo = unicos.join(' + ');
        } else {
          const formaPrincipal = formasData.find(f => f.id === v.forma_pagamento_id);
          formas_resumo = formaPrincipal?.nome?.toUpperCase() || 'NÃO INFORMADO';
        }

        return {
          ...v,
          cliente_nome: resClientes.data?.find(c => c.id === v.cliente_id)?.nome || 'Consumidor final',
          forma_nome: formasData.find(f => f.id === v.forma_pagamento_id)?.nome || 'Não informado',
          formas_resumo,
          total_custo: totalCustoCalculado,
          lucro_liquido: lucroCalculado
        };
      });

      setVendas(mappedVendas);
      setTodosItens(mappedItens);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDadosPDV() {
    const [resFormas, resClientes, resVendedores] = await Promise.all([
      supabase.from('formas_pagamento').select('id, nome').eq('ativo', true),
      supabase.from('pessoas').select('*').eq('categoria', 'cliente'),
      supabase.from('usuarios').select('id, nome_usuario')
    ]);
    setFormas(resFormas.data || []);
    setClientes(resClientes.data || []);
    setVendedores(resVendedores.data || []);
  }

  // ─── Funções de ação ──────────────────────────────────────────────────────────
  async function openDetail(v: Venda) {
    setSelectedVenda(v);
    const itens = todosItens.filter(i => i.venda_id === v.id);
    setItensDetalhe(itens);
  }

  async function handleCancelarVenda() {
    if (!vendaParaCancelar || !motivoCancelamento.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }

    setCancelando(true);
    try {
      const itens = todosItens.filter(i => i.venda_id === vendaParaCancelar.id);

      for (const item of itens) {
        if (!item.produto_id) continue;

        const { data: prod } = await supabase
          .from('produtos')
          .select('*')
          .eq('id', item.produto_id)
          .single();

        if (prod) {
          const novoEstoque = Number(prod.estoque_atual) + item.quantidade;
          const custo = Number(prod.custo) || 0;
          const precoVenda = Number(prod.preco_venda) || 0;
          const lucroProduto = precoVenda - custo;

          await supabase
            .from('produtos')
            .update({
              estoque_atual: novoEstoque,
              valor_estoque: custo * novoEstoque,
              lucro_estoque: lucroProduto * novoEstoque
            })
            .eq('id', item.produto_id);
        }

        const { data: todosLotesDoProduto } = await supabase
          .from('produto_lotes')
          .select('*')
          .eq('produto_id', item.produto_id);

        if (item.lote_codigo) {
          const { data: lotes } = await supabase
            .from('produto_lotes')
            .select('id, quantidade_atual, quantidade, quantidade_inicial, criado_em')
            .eq('produto_id', item.produto_id)
            .eq('codigo_barras', item.lote_codigo)
            .order('criado_em', { ascending: true });

          if (lotes && lotes.length > 0) {
            let qtdRestante = item.quantidade;
            for (const lote of lotes) {
              if (qtdRestante <= 0) break;
              const saldoAtual = Number(lote.quantidade_atual ?? lote.quantidade ?? 0);
              const inicial = Number(lote.quantidade_inicial ?? lote.quantidade ?? 0);
              const espacoDisponivel = inicial - saldoAtual;
              const qtdDevolver = Math.min(qtdRestante, espacoDisponivel > 0 ? espacoDisponivel : qtdRestante);
              if (qtdDevolver > 0) {
                const novaQtd = saldoAtual + qtdDevolver;
                await supabase
                  .from('produto_lotes')
                  .update({ quantidade_atual: novaQtd, quantidade: novaQtd, status: 'ativo' })
                  .eq('id', lote.id);
                qtdRestante -= qtdDevolver;
              }
            }
          } else {
            if (todosLotesDoProduto && todosLotesDoProduto.length > 0) {
              const loteRecente = [...todosLotesDoProduto].sort((a, b) =>
                new Date(b.criado_em || '2000-01-01').getTime() - new Date(a.criado_em || '2000-01-01').getTime()
              )[0];
              const saldoAtual = Number(loteRecente.quantidade_atual ?? loteRecente.quantidade ?? 0);
              await supabase
                .from('produto_lotes')
                .update({ quantidade_atual: saldoAtual + item.quantidade, quantidade: saldoAtual + item.quantidade, status: 'ativo' })
                .eq('id', loteRecente.id);
            }
          }
        } else {
          if (todosLotesDoProduto && todosLotesDoProduto.length > 0) {
            const loteRecente = [...todosLotesDoProduto].sort((a, b) =>
              new Date(b.criado_em || '2000-01-01').getTime() - new Date(a.criado_em || '2000-01-01').getTime()
            )[0];
            const saldoAtual = Number(loteRecente.quantidade_atual ?? loteRecente.quantidade ?? 0);
            await supabase
              .from('produto_lotes')
              .update({ quantidade_atual: saldoAtual + item.quantidade, quantidade: saldoAtual + item.quantidade, status: 'ativo' })
              .eq('id', loteRecente.id);
          }
        }
      }

      const { error } = await supabase
        .from('vendas')
        .update({
          status: 'cancelada',
          cancelado_em: new Date().toISOString(),
          cancelado_por: user?.name || user?.email || 'Sistema',
          motivo_cancelamento: motivoCancelamento.trim()
        })
        .eq('id', vendaParaCancelar.id);

      if (error) throw error;

      toast.success('Venda cancelada com sucesso. Estoque e lotes restaurados.');
      setShowCancelModal(false);
      setVendaParaCancelar(null);
      setMotivoCancelamento('');
      load();
    } catch (error: any) {
      toast.error('Erro ao cancelar venda: ' + error.message);
    } finally {
      setCancelando(false);
    }
  }

  // ✅ NOVO — Função de exclusão permanente (Master)
  async function handleDeletarVenda() {
    if (!vendaParaDeletar) return;

    setDeletando(true);
    try {
      const { error: errItens } = await supabase
        .from('vendas_itens')
        .delete()
        .eq('venda_id', vendaParaDeletar.id);
      if (errItens) throw errItens;

      const { error: errPag } = await supabase
        .from('vendas_pagamentos')
        .delete()
        .eq('venda_id', vendaParaDeletar.id);
      if (errPag) throw errPag;

      const { error: errVenda } = await supabase
        .from('vendas')
        .delete()
        .eq('id', vendaParaDeletar.id);
      if (errVenda) throw errVenda;

      toast.success('Venda excluída permanentemente do banco de dados.');
      setShowDeleteModal(false);
      setVendaParaDeletar(null);
      load();
    } catch (error: any) {
      toast.error('Erro ao excluir venda: ' + error.message);
    } finally {
      setDeletando(false);
    }
  }

  async function handleEditarVenda(venda: Venda) {
    if (venda.status === 'cancelada' || venda.status === 'editada') return;
    await loadDadosPDV();
    
    try {
      const itens = todosItens.filter(i => i.venda_id === venda.id);

      const cartItems: CartItem[] = await Promise.all(
        itens.map(async (item) => {
          const { data: prod } = await supabase
            .from('produtos')
            .select('estoque_atual')
            .eq('id', item.produto_id || '')
            .single();

          return {
            cartItemId: crypto.randomUUID(),
            id: item.produto_id || '',
            nome: item.produto_nome,
            codigo: item.codigo_produto || '',
            price: item.preco,
            preco_custo: item.produtos?.preco_custo || 0,
            quantity: item.quantidade,
            stock: (prod?.estoque_atual || 0) + item.quantidade,
            discount: item.desconto_item || 0,
            discountType: (item.desconto_tipo_item as 'percent' | 'fixed') || 'percent',
            lote_codigo: item.lote_codigo
          };
        })
      );

      if (venda.cliente_id) {
        const cliente = clientes.find(c => c.id === venda.cliente_id);
        setClienteObj(cliente || null);
        setClienteManual('');
      } else {
        setClienteObj(null);
        setClienteManual(venda.cliente_nome === 'Consumidor final' ? '' : venda.cliente_nome || '');
      }

      const vendedor = vendedores.find(v => v.nome_usuario === venda.vendedor_nome);
      setVendedorId(vendedor?.id || '');

      setCart(cartItems);
      setObservacao(venda.observacao || '');
      setCustoAdicional(venda.custo_adicional || 0);
      setDescCusto(venda.desc_custo_adicional || '');
      setCustoNoLucro(venda.custo_no_lucro || false);
      setDescontoGeral(venda.desconto || 0);
      setDescontoGeralTipo('fixed');

      const { data: pagamentosVenda } = await supabase
        .from('vendas_pagamentos')
        .select('*')
        .eq('venda_id', venda.id);

      if (pagamentosVenda && pagamentosVenda.length > 0) {
        setPagamentos(pagamentosVenda.map(p => ({
          splitId: crypto.randomUUID(),
          forma_pagamento_id: p.forma_pagamento_id,
          valor: p.valor
        })));
      } else {
        setPagamentos([{
          splitId: crypto.randomUUID(),
          forma_pagamento_id: venda.forma_pagamento_id,
          valor: venda.total
        }]);
      }

      setVendaParaEditar(venda);
      setShowEditModal(true);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dados para edição.');
    }
  }

  // ─── Funções do Carrinho / Edição ─────────────────────────────────────────────
  const getItemTotal = (item: CartItem) => {
    const base = item.price * item.quantity;
    if (item.discount <= 0) return base;
    if (item.discountType === 'percent') return base * (1 - item.discount / 100);
    return Math.max(0, base - item.discount);
  };

  const subtotalSemDesconto = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItensComDescontoIndividual = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
  const totalCustoItens = cart.reduce((sum, item) => sum + (item.preco_custo * item.quantity), 0);
  const descontoGeralVal = descontoGeralTipo === 'percent' ? totalItensComDescontoIndividual * (descontoGeral / 100) : descontoGeral;
  const totalBruto = Math.max(0, totalItensComDescontoIndividual - descontoGeralVal + (Number(custoAdicional) || 0));
  const total = totalBruto;
  const lucroLiquido = (totalItensComDescontoIndividual - descontoGeralVal) - totalCustoItens + (custoNoLucro ? Number(custoAdicional) : 0);
  
  const totalPagamentos = pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const restantePagamento = total - totalPagamentos;

  const updateQty = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.cartItemId !== cartItemId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return null as any;
      if (newQty > i.stock) { toast.error('Estoque insuficiente'); return i; }
      return { ...i, quantity: newQty };
    }).filter(Boolean));
  };

  const updateItemDiscount = (cartItemId: string, value: number, type: 'percent' | 'fixed') => {
    setCart(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, discount: value, discountType: type } : i));
  };

  const removeItem = (cartItemId: string) => {
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));
  };

  const addSplit = () => {
    setPagamentos(prev => [...prev, {
      splitId: crypto.randomUUID(),
      forma_pagamento_id: '',
      valor: Math.max(0, restantePagamento)
    }]);
  };

  const removeSplit = (splitId: string) => {
    setPagamentos(prev => prev.filter(p => p.splitId !== splitId));
  };

  const updateSplit = (splitId: string, field: keyof Omit<PagamentoSplit, 'splitId'>, value: any) => {
    setPagamentos(prev => prev.map(p => p.splitId === splitId ? { ...p, [field]: value } : p));
  };

  async function salvarEdicao() {
    if (!vendaParaEditar) return;
    if (cart.length === 0) { toast.error('Carrinho vazio'); return; }
    if (pagamentos.some(p => !p.forma_pagamento_id)) {
      toast.error('Preencha todas as formas de pagamento');
      return;
    }
    if (totalPagamentos < total - 0.01) {
      toast.error(`Falta ${fCurrency(restantePagamento)} para cobrir o total`);
      return;
    }
    if (!vendedorId) { toast.error('Selecione o vendedor'); return; }

    setEditando(true);
    try {
      const selectedVendedor = vendedores.find(v => v.id === vendedorId);
      const formaPrincipalId = pagamentos.length > 0 ? pagamentos[0].forma_pagamento_id : null;
      const operador = user?.name || user?.email || 'Sistema';

      const itensOriginais = todosItens.filter(i => i.venda_id === vendaParaEditar.id);
      for (const item of itensOriginais) {
        if (!item.produto_id) continue;
        const { data: prod } = await supabase.from('produtos').select('estoque_atual').eq('id', item.produto_id).single();
        if (prod) {
          await supabase.from('produtos').update({ estoque_atual: prod.estoque_atual + item.quantidade }).eq('id', item.produto_id);
        }

        if (item.lote_codigo) {
          const { data: lote } = await supabase.from('produto_lotes').select('id, quantidade_atual, quantidade').eq('produto_id', item.produto_id).eq('codigo_barras', item.lote_codigo).single();
          if (lote) {
            const novaQtd = Number(lote.quantidade_atual || lote.quantidade || 0) + item.quantidade;
            await supabase.from('produto_lotes').update({ quantidade_atual: novaQtd, quantidade: novaQtd, status: novaQtd > 0 ? 'ativo' : 'esgotado' }).eq('id', lote.id);
          }
        }
      }

      await supabase.from('vendas_itens').delete().eq('venda_id', vendaParaEditar.id);
      await supabase.from('vendas_pagamentos').delete().eq('venda_id', vendaParaEditar.id);

      const { error: vendaErr } = await supabase
        .from('vendas')
        .update({
          cliente_id: clienteObj?.id || null,
          cliente_nome_manual: clienteObj ? null : clienteManual,
          vendedor_nome: selectedVendedor?.nome_usuario || 'Não Informado',
          subtotal: subtotalSemDesconto,
          desconto: descontoGeralVal,
          custo_adicional: Number(custoAdicional) || 0,
          desc_custo_adicional: descCusto,
          custo_no_lucro: custoNoLucro,
          total,
          total_custo: totalCustoItens,
          lucro_liquido: lucroLiquido,
          forma_pagamento_id: formaPrincipalId,
          observacao,
          status: 'editada',
          editado_em: new Date().toISOString(),
          editado_por: operador
        })
        .eq('id', vendaParaEditar.id);

      if (vendaErr) throw vendaErr;

      await supabase.from('vendas_pagamentos').insert(
        pagamentos.map(p => ({ venda_id: vendaParaEditar.id, forma_pagamento_id: p.forma_pagamento_id, valor: Number(p.valor) || 0 }))
      );

      await supabase.from('vendas_itens').insert(
        cart.map(item => ({
          venda_id: vendaParaEditar.id,
          produto_id: item.id,
          produto_nome: item.nome,
          quantidade: item.quantity,
          preco: item.price,
          desconto_item: item.discount,
          desconto_tipo_item: item.discountType,
          total: getItemTotal(item),
          lote_codigo: item.lote_codigo
        }))
      );

      for (const item of cart) {
        const { data: prod } = await supabase.from('produtos').select('estoque_atual').eq('id', item.id).single();
        if (prod) {
          await supabase.from('produtos').update({ estoque_atual: prod.estoque_atual - item.quantity }).eq('id', item.id);
        }

        if (item.lote_codigo) {
          const { data: lote } = await supabase.from('produto_lotes').select('id, quantidade_atual, quantidade').eq('produto_id', item.id).eq('codigo_barras', item.lote_codigo).single();
          if (lote) {
            const novaQtd = Number(lote.quantidade_atual || lote.quantidade || 0) - item.quantity;
            await supabase.from('produto_lotes').update({ quantidade_atual: novaQtd, quantidade: novaQtd, status: novaQtd <= 0 ? 'esgotado' : 'ativo' }).eq('id', lote.id);
          }
        }
      }

      toast.success('Venda editada com sucesso!');
      setShowEditModal(false);
      setShowFinalizeEdit(false);
      setVendaParaEditar(null);
      load();
    } catch (err: any) {
      toast.error('Erro ao editar venda: ' + err.message);
    } finally {
      setEditando(false);
    }
  }

  // ─── Funções de impressão ─────────────────────────────────────────────────────
  function imprimirA4(venda: Venda, itens: VendaItem[]) {
    const win = window.open('', '_blank');
    if (!win) return;

    const cabecalho = dadosEmpresa ? `
      <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
        <h1 style="margin: 0; font-size: 22px; text-transform: uppercase;">${dadosEmpresa.nome_fantasia || dadosEmpresa.razao_social}</h1>
        <p style="margin: 4px 0; font-size: 14px;">${dadosEmpresa.endereco}, ${dadosEmpresa.numero} - ${dadosEmpresa.bairro} - ${dadosEmpresa.cidade}</p>
        <p style="margin: 4px 0; font-size: 14px;">CNPJ: ${dadosEmpresa.cnpj || '---'} | Contato: ${dadosEmpresa.contato}</p>
      </div>
    ` : '';
    win.document.write(`
      <html>
        <head>
          <title>Comprovante A4 - ${venda.id}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
            .info-venda { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #f4f4f4; text-align: left; padding: 12px; border-bottom: 2px solid #ddd; }
            td { padding: 12px; border-bottom: 1px solid #eee; }
            .totais { margin-left: auto; width: 300px; margin-top: 20px; }
            .total-linha { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
            .total-final { font-size: 20px; font-weight: bold; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${cabecalho}
          <h2 style="text-align: center; text-decoration: underline;">COMPROVANTE DE VENDA</h2>
          <div class="info-venda">
            <div>
              <p><b>CLIENTE:</b> ${venda.cliente_nome}</p>
              <p><b>VENDEDOR:</b> ${venda.vendedor_nome || '-'}</p>
            </div>
            <div style="text-align: right;">
              <p><b>DATA:</b> ${formatDate(venda.criado_em)}</p>
              <p><b>PAGAMENTO:</b> ${venda.formas_resumo || venda.forma_nome}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>PRODUTO</th>
                <th>CÓDIGO</th>
                <th>LOTE</th>
                <th style="text-align: center;">QTD</th>
                <th style="text-align: right;">UNITÁRIO</th>
                <th style="text-align: right;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${itens.map(i => `
                <tr>
                  <td>${i.produto_nome}</td>
                  <td style="font-family: monospace; font-size: 12px;">${i.codigo_produto || '-'}</td>
                  <td style="font-size: 12px; color: #555;">${i.lote_observacao || '-'}</td>
                  <td style="text-align: center;">${i.quantidade}</td>
                  <td style="text-align: right;">${formatCurrency(i.preco)}</td>
                  <td style="text-align: right;">${formatCurrency(i.total)}</td>
                </tr>
              `).join('')}
             </tbody>
          </table>
          <div class="totais">
            <div class="total-linha"><span>Subtotal:</span> <span>${formatCurrency(venda.subtotal)}</span></div>
            ${venda.desconto > 0 ? `<div class="total-linha" style="color: red;"><span>Desconto:</span> <span>- ${formatCurrency(venda.desconto)}</span></div>` : ''}
            ${venda.custo_adicional > 0 ? `<div class="total-linha"><span>${venda.desc_custo_adicional || 'Adicional'}:</span> <span>+ ${formatCurrency(venda.custo_adicional)}</span></div>` : ''}
            <div class="total-linha total-final"><span>TOTAL:</span> <span>${formatCurrency(venda.total)}</span></div>
          </div>
          ${venda.observacao ? `<div style="margin-top: 30px; padding: 10px; border: 1px solid #ccc;"><b>Observações:</b><br/>${venda.observacao}</div>` : ''}
          <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #999;">Obrigado pela preferência!</div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  function imprimirTermica(venda: Venda, itens: VendaItem[]) {
    const win = window.open('', '_blank');
    if (!win) return;

    const cabecalho = dadosEmpresa ? `
      <div style="text-align: center; margin-bottom: 10px;">
        <h3 style="margin: 0; font-size: 16px;">${dadosEmpresa.nome_fantasia || dadosEmpresa.razao_social}</h3>
        <p style="margin: 2px 0; font-size: 11px;">${dadosEmpresa.endereco}, ${dadosEmpresa.numero}</p>
        <p style="margin: 2px 0; font-size: 11px;">CNPJ: ${dadosEmpresa.cnpj || '---'}</p>
        <p style="margin: 2px 0; font-size: 11px;">Fone: ${dadosEmpresa.contato}</p>
      </div>
    ` : '';
    win.document.write(`
      <html>
        <head>
          <title>Cupom Térmico</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 280px; padding: 5px; font-size: 12px; }
            .divisoria { border-top: 1px dashed #000; margin: 10px 0; }
            .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .item-detalhe { font-size: 10px; margin-bottom: 8px; }
            .total { font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; }
            @media print { body { width: 100%; padding: 0; } }
          </style>
        </head>
        <body>
          ${cabecalho}
          <div class="divisoria"></div>
          <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">CUPOM NÃO FISCAL</div>
          <p>Data: ${formatDate(venda.criado_em)}</p>
          <p>Cliente: ${venda.cliente_nome}</p>
          <p>Vend: ${venda.vendedor_nome || '-'}</p>
          <div class="divisoria"></div>
          <div style="font-weight: bold; margin-bottom: 5px;">PRODUTOS</div>
          ${itens.map(i => `
            <div class="item">
              <span>${i.produto_nome.substring(0, 20)}</span>
              <span>${formatCurrency(i.total)}</span>
            </div>
            <div class="item-detalhe">${i.quantidade} un x ${formatCurrency(i.preco)}</div>
            ${i.codigo_produto ? `<div class="item-detalhe">Cd: ${i.codigo_produto}${i.lote_observacao ? ` | Lote: ${i.lote_observacao}` : ''}</div>` : ''}
          `).join('')}
          <div class="divisoria"></div>
          <div class="item"><span>Subtotal:</span> <span>${formatCurrency(venda.subtotal)}</span></div>
          ${venda.desconto > 0 ? `<div class="item"><span>Desc:</span> <span>- ${formatCurrency(venda.desconto)}</span></div>` : ''}
          ${venda.custo_adicional > 0 ? `<div class="item"><span>Add:</span> <span>+ ${formatCurrency(venda.custo_adicional)}</span></div>` : ''}
          <div class="total"><span>TOTAL:</span> <span>${formatCurrency(venda.total)}</span></div>
          <div class="divisoria"></div>
          <p style="text-align: center; font-size: 10px;">Pgto: ${venda.formas_resumo || venda.forma_nome}</p>
          <p style="text-align: center; font-size: 10px;">VOLTE SEMPRE!</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  function imprimirVendaAdmin(venda: Venda, itens: VendaItem[]) {
    const win = window.open('', '_blank');
    if (!win) return;
    
    const lucroLiquido = Number(venda.lucro_liquido) || 0;
    const totalCusto = Number(venda.total_custo) || 0;
    const margemGeral = venda.total > 0 ? ((lucroLiquido / venda.total) * 100).toFixed(2) : '0.00';
    
    const corCustoAdd = venda.custo_no_lucro ? '#059669' : '#dc2626';
    const sinalCustoAdd = venda.custo_no_lucro ? '+' : '-';

    const cabecalhoEmpresa = dadosEmpresa ? `
      <div style="border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px;">
        <h1 style="margin: 0; font-size: 20px;">${dadosEmpresa.nome_fantasia || dadosEmpresa.razao_social}</h1>
        <p style="margin: 2px 0; font-size: 12px; color: #666;">${dadosEmpresa.cnpj ? `CNPJ: ${dadosEmpresa.cnpj} | ` : ''}Contato: ${dadosEmpresa.contato}</p>
      </div>
    ` : '';
    win.document.write(`
      <html>
        <head>
          <title>Comprovante Administrativo - Venda</title>
          <style>
            body { font-family: sans-serif; padding:20px; color: #333; } 
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th, td { border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: right; }
            th { text-align: right; background: #f9f9f9; }
            td:first-child, th:first-child { text-align: left; }
            .header-info { margin-bottom: 20px; font-size: 14px; }
            .resumo { margin-top: 20px; width: 100%; max-width: 400px; margin-left: auto; font-size: 14px; }
            .resumo div { display: flex; justify-content: space-between; margin-bottom: 5px; }
            .destaque { font-weight: bold; font-size: 16px; border-top: 2px solid #333; padding-top: 5px; }
          </style>
        </head>
        <body>
          ${cabecalhoEmpresa}
          <h2>Comprovante Administrativo (Interno)</h2>
          <div class="header-info">
            <p><b>Data:</b> ${formatDate(venda.criado_em)}</p>
            <p><b>Vendedor:</b> ${venda.vendedor_nome || '-'}</p>
            <p><b>Cliente:</b> ${venda.cliente_nome}</p>
            <p><b>Pagamento:</b> ${venda.formas_resumo || venda.forma_nome}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código</th>
                <th>Lote</th>
                <th>Qtd</th>
                <th>Venda Un.</th>
                <th>Custo Un.*</th>
                <th>Subtotal</th>
                <th>Lucro Item</th>
              </tr>
             </thead>
            <tbody>
              ${itens.map(i => {
                const custoUn = i.produtos?.preco_custo || 0;
                const vendaUn = i.quantidade > 0 ? i.total / i.quantidade : 0;
                const lucroItem = i.total - (custoUn * i.quantidade);
                return `
                  <tr>
                    <td>${i.produto_nome}</td>
                    <td style="font-family: monospace; text-align: left;">${i.codigo_produto || '-'}</td>
                    <td style="text-align: left; color: #555;">${i.lote_observacao || '-'}</td>
                    <td style="text-align: center;">${i.quantidade}</td>
                    <td>${formatCurrency(vendaUn)}</td>
                    <td style="color: #d97706;">${formatCurrency(custoUn)}</td>
                    <td style="font-weight: bold;">${formatCurrency(i.total)}</td>
                    <td style="color: #059669; font-weight: bold;">${formatCurrency(lucroItem)}</td>
                  </tr>
                `
              }).join('')}
            </tbody>
          </table>
          <p style="font-size: 10px; color: #666;">* O custo unitário reflete o custo base atual do produto/lote cadastrado no sistema.</p>
          <div class="resumo">
            <div><span>Subtotal (Bruto):</span> <span>${formatCurrency(venda.subtotal)}</span></div>
            ${venda.desconto > 0 ? `<div style="color: #dc2626;"><span>Descontos:</span> <span>- ${formatCurrency(venda.desconto)}</span></div>` : ''}
            <div><span>Total Pago pelo Cliente:</span> <span>${formatCurrency(venda.total)}</span></div>
            <br/>
            <div style="color: #d97706;"><span>Custo Total do Estoque:</span> <span>- ${formatCurrency(totalCusto)}</span></div>
            ${venda.custo_adicional > 0 ? `<div style="color: ${corCustoAdd};"><span>Custos Adicionais (${venda.desc_custo_adicional || 'Geral'}):</span> <span>${sinalCustoAdd} ${formatCurrency(venda.custo_adicional)}</span></div>` : ''}
            <div class="destaque" style="color: #059669;"><span>Lucro Líquido:</span> <span>${formatCurrency(lucroLiquido)}</span></div>
            <div><span>Margem de Ganho:</span> <span>${margemGeral}%</span></div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  function imprimirRelatorioGeral() {
    const win = window.open('', '_blank');
    if (!win) return;

    const cabecalhoEmpresa = dadosEmpresa ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
        <div>
          <h1 style="margin: 0; font-size: 22px;">${dadosEmpresa.nome_fantasia || dadosEmpresa.razao_social}</h1>
          <p style="margin: 2px 0; font-size: 12px;">${dadosEmpresa.endereco}, ${dadosEmpresa.numero} - ${dadosEmpresa.cidade}</p>
        </div>
        <div style="text-align: right; font-size: 12px;">
          <p style="margin: 2px 0;">${dadosEmpresa.cnpj ? `CNPJ: ${dadosEmpresa.cnpj}` : ''}</p>
          <p style="margin: 2px 0;">Contato: ${dadosEmpresa.contato}</p>
        </div>
      </div>
    ` : '';

    const periodoStr = getPeriodoStr();
    const filtroStr = search.trim() ? `<p style="margin: 4px 0;"><b>Filtro de busca:</b> "${search.trim()}"</p>` : '';
    const metaDadosStr = `<p style="margin: 4px 0;"><b>Período:</b> ${periodoStr}</p>${filtroStr}`;

    if (activeTab === 'vendas') {
      const vendasPorPagamento: Record<string, typeof filteredVendas> = {};
      filteredVendas.forEach(v => {
        const forma = v.formas_resumo || v.forma_nome || 'NÃO INFORMADO';
        if (!vendasPorPagamento[forma]) vendasPorPagamento[forma] = [];
        vendasPorPagamento[forma].push(v);
      });

      const conteudoTabela = Object.entries(vendasPorPagamento).map(([forma, vendasForma]) => {
        const totalForma = vendasForma.reduce((s, v) => s + (Number(v.total) || 0), 0);
        return `
          <h3 style="margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Forma de Pagamento: ${forma}</h3>
          <table style="width:100%; text-align:left; border-collapse: collapse; margin-top: 10px; font-size: 12px;">
            <tr style="border-bottom: 2px solid #333;">
              <th style="padding: 8px 0;">Data</th>
              <th style="padding: 8px 0;">Vendedor</th>
              <th style="padding: 8px 0;">Cliente</th>
              <th style="padding: 8px 0; text-align:right;">Total</th>
            </tr>
            ${vendasForma.map((v: any) => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">${formatDate(v.criado_em)}</td>
                <td style="padding: 8px 0;">${v.vendedor_nome || '-'}</td>
                <td style="padding: 8px 0;">${v.cliente_nome}</td>
                <td style="padding: 8px 0; text-align:right;">${formatCurrency(v.total)}</td>
              </tr>
            `).join('')}
            <tr>
              <td colspan="3" style="text-align: right; padding: 8px 0; font-weight: bold;">Subtotal ${forma}:</td>
              <td style="text-align: right; padding: 8px 0; font-weight: bold;">${formatCurrency(totalForma)}</td>
            </tr>
          </table>
        `;
      }).join('');

      win.document.write(`
        <html>
          <head>
            <title>Relatório de Vendas por Forma de Pagamento</title>
            <style>body { font-family: sans-serif; padding: 30px; color: #333; }</style>
          </head>
          <body>
            ${cabecalhoEmpresa}
            <h2>Relatório de Vendas por Forma de Pagamento</h2>
            ${metaDadosStr}
            <p style="margin: 4px 0;"><b>Total de vendas exibidas:</b> ${filteredVendas.length}</p>
            <hr/>
            ${filteredVendas.length === 0
              ? '<p style="text-align:center; color:#999; margin-top: 40px;">Nenhuma venda encontrada para os filtros aplicados.</p>'
              : conteudoTabela
            }
            ${filteredVendas.length > 0
              ? `<br/><h3 style="text-align: right; margin-top: 20px; border-top: 2px solid #333; padding-top: 10px;">Total Geral: ${formatCurrency(totalGeral)}</h3>`
              : ''
            }
          </body>
        </html>
      `);

    } else if (activeTab === 'itens') {
      const itensAgrupados: Record<string, typeof filteredItens[0]> = {};
      filteredItens.forEach(i => {
        const chave = `${i.produto_id}_${i.codigo_produto}_${i.lote_observacao}`;
        if (itensAgrupados[chave]) {
          itensAgrupados[chave].quantidade += i.quantidade;
          itensAgrupados[chave].total += i.total;
        } else {
          itensAgrupados[chave] = { ...i };
        }
      });
      const listaAgrupada = Object.values(itensAgrupados);

      win.document.write(`
        <html>
          <head>
            <title>Relatório de Produtos Vendidos</title>
            <style>body { font-family: sans-serif; padding: 30px; color: #333; }</style>
          </head>
          <body>
            ${cabecalhoEmpresa}
            <h2>Relatório de Produtos Vendidos</h2>
            ${metaDadosStr}
            <p style="margin: 4px 0;"><b>Total de itens exibidos:</b> ${filteredItens.length} (${listaAgrupada.length} produtos distintos)</p>
            <hr/>
            ${listaAgrupada.length === 0
              ? '<p style="text-align:center; color:#999; margin-top: 40px;">Nenhum item encontrado para os filtros aplicados.</p>'
              : `
                <table style="width:100%; text-align:left; border-collapse: collapse; margin-top: 15px; font-size: 12px;">
                  <tr style="border-bottom: 2px solid #333;">
                    <th style="padding: 8px 0;">Data</th>
                    <th style="padding: 8px 0;">Produto</th>
                    <th style="padding: 8px 0;">Código</th>
                    <th style="padding: 8px 0;">Lote</th>
                    <th style="padding: 8px 0;">Vendedor</th>
                    <th style="padding: 8px 0; text-align:center;">Qtd</th>
                    <th style="padding: 8px 0; text-align:right;">Total</th>
                  </tr>
                  ${listaAgrupada.map((i: any) => `
                    <tr style="border-bottom: 1px solid #ccc;">
                      <td style="padding: 8px 0;">${formatDate(i.criado_em)}</td>
                      <td style="padding: 8px 0;">${i.produto_nome}</td>
                      <td style="padding: 8px 0; font-family: monospace;">${i.codigo_produto || '-'}</td>
                      <td style="padding: 8px 0; color: #555;">${i.lote_observacao || '-'}</td>
                      <td style="padding: 8px 0;">${i.vendedor_nome || '-'}</td>
                      <td style="padding: 8px 0; text-align:center;">${i.quantidade}</td>
                      <td style="padding: 8px 0; text-align:right;">${formatCurrency(i.total)}</td>
                    </tr>
                  `).join('')}
                </table>
                <br/>
                <h3 style="text-align: right;">Total do Relatório: ${formatCurrency(totalGeral)}</h3>
              `
            }
          </body>
        </html>
      `);
    } else if (activeTab === 'admin') {
      let totalGeralLucroLiq = 0;
      let totalGeralDescontos = 0;
      let totalGeralCustosAdd = 0;
      let totalGeralCustosAddLucro = 0;

      const conteudoTabela = filteredVendas.map((v: any) => {
        const itensVenda = todosItens.filter(i => i.venda_id === v.id);
        totalGeralLucroLiq += Number(v.lucro_liquido) || 0;
        totalGeralDescontos += Number(v.desconto) || 0;
        
        if (v.custo_no_lucro) {
          totalGeralCustosAddLucro += Number(v.custo_adicional) || 0;
        } else {
          totalGeralCustosAdd += Number(v.custo_adicional) || 0;
        }

        let itensHtml = itensVenda.map(i => {
          const custoUn = i.produtos?.preco_custo || 0;
          const custoTot = custoUn * i.quantidade;
          const vendaUn = i.quantidade > 0 ? i.total / i.quantidade : 0;
          const lucroUn = vendaUn - custoUn;
          const lucroTot = i.total - custoTot;

          return `
            <tr>
              <td colspan="2"></td>
              <td style="padding: 4px 0; border-bottom: 1px dashed #eee;">
                ${i.quantidade}x ${i.produto_nome} (Cd: ${i.codigo_produto || '-'} | Lote: ${i.lote_observacao || '-'})
              </td>
              <td style="padding: 4px 0; text-align:right; border-bottom: 1px dashed #eee;">${formatCurrency(custoUn)}</td>
              <td style="padding: 4px 0; text-align:right; border-bottom: 1px dashed #eee;">${formatCurrency(custoTot)}</td>
              <td style="padding: 4px 0; text-align:right; border-bottom: 1px dashed #eee;">${formatCurrency(lucroUn)}</td>
              <td style="padding: 4px 0; text-align:right; border-bottom: 1px dashed #eee;">${formatCurrency(lucroTot)}</td>
            </tr>
          `;
        }).join('');

        return `
          <tr style="background-color: #f9f9f9; border-top: 1px solid #ccc;">
            <td style="padding: 8px 0; font-weight: bold;">${formatDate(v.criado_em)}</td>
            <td style="padding: 8px 0; font-weight: bold;">${v.vendedor_nome || '-'}</td>
            <td colspan="5" style="padding: 8px 0;">
              <span style="font-size: 9px; color: #666;">
                Desc: ${formatCurrency(v.desconto)} | Add: ${formatCurrency(v.custo_adicional)} (${v.custo_no_lucro ? 'No Lucro' : 'Fora do Lucro'}) | Liq. Venda: ${formatCurrency(v.lucro_liquido)}
              </span>
            </td>
          </tr>
          ${itensHtml}
        `;
      }).join('');

      win.document.write(`
        <html>
          <head>
            <title>Relatório Administrativo Geral</title>
            <style>
              body { font-family: sans-serif; padding: 30px; color: #333; font-size: 10px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th { background: #e8e8e8; padding: 8px 6px; font-size: 11px; text-align: right; border-bottom: 2px solid #999; }
              th:first-child, th:nth-child(2), th:nth-child(3) { text-align: left; }
            </style>
          </head>
          <body>
            ${cabecalhoEmpresa}
            <h2>Relatório Administrativo Geral (Interno)</h2>
            ${metaDadosStr}
            <p style="margin: 4px 0;"><b>Total de vendas exibidas:</b> ${filteredVendas.length}</p>
            <hr/>
            ${filteredVendas.length === 0
              ? '<p style="text-align:center; color:#999; margin-top: 40px;">Nenhuma venda encontrada para os filtros aplicados.</p>'
              : `
                <table>
                  <thead>
                    <tr>
                      <th style="text-align:left;">Data</th>
                      <th style="text-align:left;">Vendedor</th>
                      <th style="text-align:left;">Produto / Código / Lote</th>
                      <th>Custo Un.</th>
                      <th>Custo Qtd.</th>
                      <th>Lucro Un.</th>
                      <th>Lucro Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${conteudoTabela}
                  </tbody>
                </table>
                
                <div style="margin-top: 30px; border-top: 3px solid #333; padding-top: 15px;">
                  <table style="width: 100%; max-width: 500px; margin-left: auto; font-size: 14px;">
                    <tr><td><b>Total Descontos:</b></td><td style="text-align:right; color: #dc2626;">- ${formatCurrency(totalGeralDescontos)}</td></tr>
                    <tr><td><b>Custos Add (Não Contab. Lucro):</b></td><td style="text-align:right; color: #dc2626;">- ${formatCurrency(totalGeralCustosAdd)}</td></tr>
                    <tr><td><b>Custos Add (Contab. Lucro):</b></td><td style="text-align:right; color: #059669;">+ ${formatCurrency(totalGeralCustosAddLucro)}</td></tr>
                    <tr style="border-top: 2px solid #333;"><td style="color: #059669;"><b>LUCRO LÍQUIDO TOTAL:</b></td><td style="text-align:right; color: #059669; font-size: 18px; font-weight: bold;">${formatCurrency(totalGeralLucroLiq)}</td></tr>
                    <tr><td><b>Total Receita:</b></td><td style="text-align:right; font-size: 18px; font-weight: bold;">${formatCurrency(totalGeral)}</td></tr>
                  </table>
                </div>
              `
            }
          </body>
        </html>
      `);
    }

    win.document.close();
    win.print();
  }

  // ─── Filtros Bidirecionais e Totais ───────────────────────────────────────────
  const searchLower = search.toLowerCase();

  const filteredVendas = vendas.filter(v => {
    const textMatch = v.cliente_nome?.toLowerCase().includes(searchLower) ||
      (v.formas_resumo || v.forma_nome || '').toLowerCase().includes(searchLower) ||
      v.vendedor_nome?.toLowerCase().includes(searchLower) ||
      v.id.toLowerCase().includes(searchLower);

    if (textMatch) return true;

    const itensVenda = todosItens.filter(i => i.venda_id === v.id);
    return itensVenda.some(i => 
      i.produto_nome?.toLowerCase().includes(searchLower) ||
      i.codigo_produto?.toLowerCase().includes(searchLower) ||
      i.lote_observacao?.toLowerCase().includes(searchLower)
    );
  });

  const vendasAtivasIds = vendas.filter(v => v.status !== 'cancelada').map(v => v.id);

  const filteredItens = todosItens.filter(i => {
    if (!vendasAtivasIds.includes(i.venda_id)) return false;
    
    const textMatch = i.produto_nome?.toLowerCase().includes(searchLower) ||
      i.vendedor_nome?.toLowerCase().includes(searchLower) ||
      i.venda_id.toLowerCase().includes(searchLower) ||
      i.codigo_produto?.toLowerCase().includes(searchLower) ||
      i.lote_observacao?.toLowerCase().includes(searchLower);

    if (textMatch) return true;

    const vendaPai = vendas.find(v => v.id === i.venda_id);
    return vendaPai && (
      vendaPai.cliente_nome?.toLowerCase().includes(searchLower) ||
      (vendaPai.formas_resumo || vendaPai.forma_nome || '').toLowerCase().includes(searchLower)
    );
  });

  const vendasAtivas = filteredVendas.filter(v => v.status !== 'cancelada');

  const totalGeral = activeTab === 'itens' 
    ? filteredItens.reduce((s, i) => s + (Number(i.total) || 0), 0)
    : vendasAtivas.reduce((s, v) => s + (Number(v.total) || 0), 0);

  const adminTotalReceita = vendasAtivas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const adminTotalCusto = vendasAtivas.reduce((s, v) => s + (Number(v.total_custo) || 0), 0);
  const adminTotalLucro = vendasAtivas.reduce((s, v) => s + (Number(v.lucro_liquido) || 0), 0);
  const adminCustosAdd = vendasAtivas.reduce((s, v) => s + (v.custo_no_lucro ? 0 : (Number(v.custo_adicional) || 0)), 0);
  const adminMargemOperacional = adminTotalReceita > 0 ? (adminTotalLucro / adminTotalReceita) * 100 : 0;

  const isAdminTab = activeTab === 'admin';

  // ─── Renderização ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
          <div className="flex bg-secondary p-1 rounded-lg mt-2 w-fit overflow-x-auto">
            <button 
              onClick={() => setActiveTab('vendas')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'vendas' ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-accent'}`}
            >
              VENDAS
            </button>
            <button 
              onClick={() => setActiveTab('itens')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'itens' ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-accent'}`}
            >
              PRODUTOS VENDIDOS
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-accent'}`}
            >
              <Briefcase size={14}/> ADMINISTRATIVO
            </button>
          </div>
        </div>

        {activeTab !== 'admin' && (
          <ValueDisplay
            id="total-geral-hist"
            value={formatCurrency(totalGeral)}
            className="font-bold text-2xl text-primary"
          />
        )}
      </div>

      {activeTab === 'admin' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-4">
          <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-bold uppercase">Total Receita</span>
              <DollarSign className="h-4 w-4" />
            </div>
            <p className="text-2xl font-mono font-bold text-primary">{formatCurrency(adminTotalReceita)}</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-bold uppercase">Custo de Estoque</span>
              <Package className="h-4 w-4" />
            </div>
            <p className="text-2xl font-mono font-bold text-orange-400">{formatCurrency(adminTotalCusto)}</p>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-bold uppercase">Lucro Líquido</span>
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex items-end justify-between">
               <p className="text-2xl font-mono font-bold text-green-500">{formatCurrency(adminTotalLucro)}</p>
               {adminCustosAdd > 0 && <span className="text-[10px] text-muted-foreground mb-1">(-{formatCurrency(adminCustosAdd)} extras)</span>}
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-bold uppercase">Margem Operacional</span>
              <PieChart className="h-4 w-4" />
            </div>
            <p className="text-2xl font-mono font-bold text-blue-400">{adminMargemOperacional.toFixed(2)}%</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, vendedor, pagamento ou produto..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-secondary text-foreground"
          />
        </div>

        <select
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="h-10 px-3 rounded-lg border border-input bg-secondary text-foreground cursor-pointer"
        >
          <option value="todos">Todo o período</option>
          <option value="hoje">Hoje</option>
          <option value="ontem">Ontem</option>
          <option value="semana">Esta Semana</option>
          <option value="mes">Este Mês</option>
          <option value="personalizado">Personalizado</option>
        </select>

        {filtroData === 'personalizado' && (
          <>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="h-10 px-3 rounded-lg border border-input bg-secondary" 
            />
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="h-10 px-3 rounded-lg border border-input bg-secondary" 
            />
          </>
        )}
        
        <button 
          onClick={imprimirRelatorioGeral}
          className="h-10 px-4 ml-auto flex items-center gap-2 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90 transition-all text-sm"
          title="Imprimir Relatório"
        >
          <Printer size={18} />
          <span className="hidden sm:inline">Imprimir Relatório</span>
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="p-3 text-left whitespace-nowrap">Data</th>
                {activeTab === 'vendas' && (
                  <>
                    <th className="p-3 text-left whitespace-nowrap">Vendedor(a)</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-left hidden md:table-cell">Pagamento</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-center">Status</th>
                  </>
                )}
                {activeTab === 'admin' && (
                  <>
                    <th className="p-3 text-left whitespace-nowrap">Vendedor(a)</th>
                    <th className="p-3 text-right">Valor Bruto</th>
                    <th className="p-3 text-right">Custo Estoque</th>
                    <th className="p-3 text-right">Custos Add.</th>
                    <th className="p-3 text-right">Lucro Líquido</th>
                    <th className="p-3 text-center">Margem</th>
                  </>
                )}
                {activeTab === 'itens' && (
                  <>
                    <th className="p-3 text-left min-w-[180px]">Produto</th>
                    <th className="p-3 text-left whitespace-nowrap">Código</th>
                    <th className="p-3 text-left whitespace-nowrap">Lote</th>
                    <th className="p-3 text-left whitespace-nowrap">Vendedor(a)</th>
                    <th className="p-3 text-center">Qtd</th>
                    <th className="p-3 text-right">Unitário</th>
                    <th className="p-3 text-right">Subtotal</th>
                  </>
                )}
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="p-10 text-center animate-pulse">Carregando dados...</td></tr>
              ) : (activeTab === 'itens' ? filteredItens : (activeTab === 'admin' ? vendasAtivas : filteredVendas)).map((item: any) => {
                const itemTotalCusto = Number(item.total_custo) || 0;
                const itemLucroLiquido = Number(item.lucro_liquido) || 0;

                let rowClass = 'border-b border-border hover:bg-accent/30 cursor-pointer transition-colors';
                if (activeTab === 'vendas') {
                  if (item.status === 'cancelada') {
                    rowClass = 'border-b border-red-500/20 bg-red-500/10 hover:bg-red-500/20 cursor-pointer transition-colors';
                  } else if (item.status === 'editada') {
                    rowClass = 'border-b border-yellow-500/20 bg-yellow-500/10 hover:bg-yellow-500/20 cursor-pointer transition-colors';
                  }
                }

                return (
                  <tr 
                    key={item.id} 
                    onClick={() => (activeTab === 'vendas' || activeTab === 'admin') && openDetail(item)}
                    className={rowClass}
                  >
                    <td className="p-3 text-[12px] font-medium opacity-90 whitespace-nowrap">
                      {formatDate(item.criado_em)}
                    </td>

                    {activeTab === 'vendas' && (
                      <>
                        <td className="p-3 font-medium text-muted-foreground">{item.vendedor_nome || '-'}</td>
                        <td className="p-3 font-medium">{item.cliente_nome}</td>
                        <td className="p-3 hidden md:table-cell">{item.formas_resumo || item.forma_nome}</td>
                        <td className={`p-3 text-right font-bold ${item.status === 'cancelada' ? 'line-through text-red-400' : 'text-primary'}`}>
                          {formatCurrency(item.total)}
                        </td>
                        <td className="p-3 text-center">
                          {item.status === 'cancelada' ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full border border-red-500/30">
                                <Ban size={10} /> CANCELADA
                              </span>
                              <span className="text-[9px] text-muted-foreground">{formatDate(item.cancelado_em)}</span>
                            </div>
                          ) : item.status === 'editada' ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded-full border border-yellow-500/30">
                                <Pencil size={10} /> EDITADA
                              </span>
                              <span className="text-[9px] text-muted-foreground">{formatDate(item.editado_em)}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full border border-green-500/20">
                              <CheckCircle size={10} /> NORMAL
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {activeTab === 'admin' && (
                      <>
                        <td className="p-3 font-medium text-muted-foreground">{item.vendedor_nome || '-'}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(item.total)}</td>
                        <td className="p-3 text-right font-mono text-orange-400">{formatCurrency(itemTotalCusto)}</td>
                        <td className={`p-3 text-right font-mono ${item.custo_no_lucro && item.custo_adicional > 0 ? 'text-green-500' : 'text-red-400'}`}>
                          {item.custo_no_lucro && item.custo_adicional > 0 ? '+' : ''}{formatCurrency(item.custo_adicional)}
                        </td>
                        <td className="p-3 text-right font-bold font-mono text-green-500">{formatCurrency(itemLucroLiquido)}</td>
                        <td className="p-3 text-center font-bold">
                          {item.total > 0 ? ((itemLucroLiquido / item.total) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </>
                    )}

                    {activeTab === 'itens' && (
                      <>
                        <td className="p-3 font-medium">{item.produto_nome}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{item.codigo_produto || '-'}</td>
                        <td className="p-3 text-xs text-muted-foreground">{item.lote_observacao || '-'}</td>
                        <td className="p-3 text-muted-foreground">{item.vendedor_nome || '-'}</td>
                        <td className="p-3 text-center">{item.quantidade}</td>
                        <td className="p-3 text-right">{formatCurrency(item.preco)}</td>
                        <td className="p-3 text-right font-bold">{formatCurrency(item.total)}</td>
                      </>
                    )}

                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {(activeTab === 'vendas' || activeTab === 'admin') ? (
                          <>
                            <button onClick={() => openDetail(item)} className="p-1.5 rounded hover:bg-accent" title="Ver detalhes">
                              <Eye size={16}/>
                            </button>
                            <button
                              onClick={() => {
                                const its = todosItens.filter(i => i.venda_id === item.id);
                                if (activeTab === 'admin') {
                                  imprimirVendaAdmin(item, its);
                                } else {
                                  setPrintSelection({ venda: item, itens: its, tipo: 'comum' });
                                }
                              }}
                              className="p-1.5 rounded hover:bg-accent" title="Imprimir"
                            >
                              <Printer size={16}/>
                            </button>
                            
                            {activeTab === 'vendas' && (
                              <button
                                onClick={() => handleEditarVenda(item)}
                                disabled={item.status === 'editada' || item.status === 'cancelada'}
                                className={`p-1.5 rounded transition-all ${
                                  item.status === 'editada' || item.status === 'cancelada'
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'hover:bg-yellow-500/20 text-yellow-600'
                                }`}
                                title={
                                  item.status === 'cancelada' ? 'Venda cancelada - não pode ser editada'
                                  : item.status === 'editada' ? 'Venda já foi editada' : 'Editar venda'
                                }
                              >
                                <Pencil size={16}/>
                              </button>
                            )}

                            {activeTab === 'vendas' && (
                              <button
                                onClick={() => {
                                  setVendaParaCancelar(item);
                                  setMotivoCancelamento('');
                                  setShowCancelModal(true);
                                }}
                                disabled={item.status === 'cancelada'}
                                className={`p-1.5 rounded transition-all ${
                                  item.status === 'cancelada'
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'hover:bg-red-500/20 text-red-500'
                                }`}
                                title={item.status === 'cancelada' ? 'Venda já cancelada' : 'Cancelar venda'}
                              >
                                <Ban size={16}/>
                              </button>
                            )}

                            {/* ✅ NOVO — Botão de exclusão permanente (apenas Planex Master) */}
                            {activeTab === 'vendas' && user?.name === 'Planex Master' && (
                              <button
                                onClick={() => {
                                  setVendaParaDeletar(item);
                                  setShowDeleteModal(true);
                                }}
                                className="p-1.5 rounded transition-all hover:bg-red-900/30 text-red-700"
                                title="Excluir venda permanentemente (Master)"
                              >
                                <Trash2 size={16}/>
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              const v = vendas.find(vend => vend.id === item.venda_id);
                              if(v) openDetail(v);
                            }}
                            className="p-1.5 rounded hover:bg-accent"
                          >
                            <List size={16}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cancelamento */}
      {showCancelModal && vendaParaCancelar && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-card border border-red-500/40 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="p-2 bg-red-500/10 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-lg font-black text-red-500 uppercase">Cancelar Venda</h2>
                <p className="text-xs text-muted-foreground">Esta ação irá restaurar o estoque dos produtos.</p>
              </div>
              <button onClick={() => setShowCancelModal(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-secondary/50 border border-border space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-bold">{vendaParaCancelar.cliente_nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data:</span>
                <span className="font-bold">{formatDate(vendaParaCancelar.criado_em)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-bold text-primary">{formatCurrency(vendaParaCancelar.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendedor:</span>
                <span className="font-bold">{vendaParaCancelar.vendedor_nome || '-'}</span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-black uppercase text-muted-foreground">Itens que terão estoque restaurado:</p>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {todosItens.filter(i => i.venda_id === vendaParaCancelar.id).map(i => (
                  <div key={i.id} className="flex justify-between text-xs p-2 rounded bg-secondary/40 border border-border">
                    <span className="truncate flex-1 mr-2">{i.produto_nome}</span>
                    <span className="font-bold text-primary whitespace-nowrap">+{i.quantidade} un</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-muted-foreground">
                Motivo do Cancelamento <span className="text-red-500">*</span>
              </label>
              <textarea
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="Descreva o motivo do cancelamento..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-input bg-secondary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 h-11 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition">
                Voltar
              </button>
              <button
                onClick={handleCancelarVenda}
                disabled={cancelando || !motivoCancelamento.trim()}
                className="flex-1 h-11 rounded-xl bg-red-600 text-white text-sm font-black hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {cancelando ? <span className="animate-pulse">Cancelando...</span> : <><Ban size={16} /> Confirmar Cancelamento</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ NOVO — Modal de Exclusão Permanente (Master) */}
      {showDeleteModal && vendaParaDeletar && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-card border border-red-900/60 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 space-y-5">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="p-2 bg-red-900/20 rounded-xl">
                <Trash2 className="h-6 w-6 text-red-700" />
              </div>
              <div>
                <h2 className="text-lg font-black text-red-700 uppercase">Excluir Permanentemente</h2>
                <p className="text-xs text-muted-foreground">Esta ação é irreversível. Os dados serão apagados do banco.</p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-red-900/10 border border-red-900/20 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-bold">{vendaParaDeletar.cliente_nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data:</span>
                <span className="font-bold">{formatDate(vendaParaDeletar.criado_em)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total:</span>
                <span className="font-bold text-primary">{formatCurrency(vendaParaDeletar.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendedor:</span>
                <span className="font-bold">{vendaParaDeletar.vendedor_nome || '-'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 font-bold">
              ⚠ Serão removidos permanentemente: a venda, todos os itens e todos os pagamentos vinculados. O estoque NÃO será restaurado.
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 h-11 rounded-xl border border-border text-sm font-bold hover:bg-secondary transition">
                Cancelar
              </button>
              <button
                onClick={handleDeletarVenda}
                disabled={deletando}
                className="flex-1 h-11 rounded-xl bg-red-900 text-white text-sm font-black hover:bg-red-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletando ? <span className="animate-pulse">Excluindo...</span> : <><Trash2 size={16} /> Excluir Definitivo</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {showEditModal && vendaParaEditar && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-5xl max-h-[95vh] bg-card border border-yellow-500/40 rounded-2xl shadow-2xl animate-in zoom-in-95 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border bg-yellow-500/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-xl">
                  <Pencil className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-yellow-600 uppercase">Editar Venda</h2>
                  <p className="text-xs text-muted-foreground">
                    Venda de {formatDate(vendaParaEditar.criado_em)} — {vendaParaEditar.cliente_nome}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
                <div className="p-3 border-b border-border flex items-center gap-2 text-muted-foreground bg-card/50">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase">Itens da Venda</span>
                </div>

                <div className="flex-1 p-3 space-y-2 overflow-y-auto">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20">
                      <ShoppingCart className="h-12 w-12 mb-3" />
                      <p>Carrinho vazio</p>
                    </div>
                  ) : cart.map(item => (
                    <div key={item.cartItemId} className="rounded-lg border bg-card p-3 flex flex-col gap-2 border-border">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.nome}</p>
                          <p className="text-[10px] text-muted-foreground">Estoque: {item.stock} • Unit: {fCurrency(item.price)}</p>
                          {item.lote_codigo && <p className="text-[10px] text-blue-500 font-medium mt-0.5">Lote: {item.lote_codigo}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 border-r border-border pr-3">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Desc.</span>
                            <input
                              type="number"
                              value={item.discount || ''}
                              onChange={(e) => updateItemDiscount(item.cartItemId, Number(e.target.value), item.discountType)}
                              className="w-12 h-7 bg-secondary border border-border rounded text-[11px] px-1 font-mono"
                            />
                            <select
                              value={item.discountType}
                              onChange={(e) => updateItemDiscount(item.cartItemId, item.discount, e.target.value as any)}
                              className="h-7 bg-secondary border border-border rounded text-[10px] px-0.5"
                            >
                              <option value="percent">%</option>
                              <option value="fixed">R$</option>
                            </select>
                          </div>
                          
                          <div className="flex items-center rounded-lg border border-border bg-secondary">
                            <button type="button" onClick={() => updateQty(item.cartItemId, -1)} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-l-lg">
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="h-8 w-8 flex items-center justify-center text-sm font-mono border-x border-border">
                              {item.quantity}
                            </span>
                            <button type="button" onClick={() => updateQty(item.cartItemId, 1)} disabled={item.quantity >= item.stock} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-r-lg">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          
                          <span className="text-sm font-mono font-bold w-24 text-right">
                            {fCurrency(getItemTotal(item))}
                          </span>
                          
                          <button type="button" onClick={() => removeItem(item.cartItemId)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-80 xl:w-96 flex flex-col overflow-y-auto border-t lg:border-t-0 border-border bg-card/30">
                <div className="flex-1 p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
                      <UserCircle className="h-3.5 w-3.5" /> Vendedor(a) *
                    </label>
                    <select
                      value={vendedorId}
                      onChange={(e) => setVendedorId(e.target.value)}
                      className={`w-full h-10 px-3 rounded-lg border text-sm font-bold outline-none ${!vendedorId ? 'border-yellow-500 text-yellow-700' : 'bg-green-500/10 border-green-500 text-green-600'}`}
                    >
                      <option value="">-- SELECIONE O VENDEDOR --</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome_usuario.toUpperCase()}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Cliente
                    </label>
                    <select
                      value={clienteObj?.id || ''}
                      onChange={(e) => {
                        const c = clientes.find(x => x.id === e.target.value);
                        setClienteObj(c || null);
                        if (c) setClienteManual('');
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm"
                    >
                      <option value="">-- Buscar no cadastro --</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    {!clienteObj && (
                      <input
                        type="text" 
                        value={clienteManual}
                        onChange={(e) => setClienteManual(e.target.value)}
                        placeholder="Nome manual..."
                        className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm mt-2"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                      <Percent className="h-3 w-3" /> Desconto Geral
                    </label>
                    <div className="flex gap-2">
                      <input type="number" value={descontoGeral || ''} onChange={(e) => setDescontoGeral(Number(e.target.value))} className="flex-1 h-9 px-3 rounded-lg border border-input bg-secondary text-sm font-mono" />
                      <select value={descontoGeralTipo} onChange={(e) => setDescontoGeralTipo(e.target.value as any)} className="h-9 px-2 rounded-lg border border-input bg-secondary text-sm">
                        <option value="percent">%</option>
                        <option value="fixed">R$</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-border bg-secondary/20 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                        <DollarSign className="h-3 w-3" /> Custo Adicional
                      </label>
                      <input type="number" value={custoAdicional || ''} onChange={(e) => setCustoAdicional(Number(e.target.value))} placeholder="0,00" className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase">Descrição do Custo</label>
                      <input type="text" value={descCusto} onChange={(e) => setDescCusto(e.target.value)} placeholder="Ex: Taxa de Entrega" className="w-full h-8 px-3 rounded-lg border border-input bg-secondary/40 text-xs" />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Contabilizar Lucro?</label>
                      <div onClick={() => setCustoNoLucro(!custoNoLucro)} className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${custoNoLucro ? 'bg-primary' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${custoNoLucro ? 'left-4' : 'left-0.5'}`} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase">Observação</label>
                    <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas da venda..." rows={2} className="w-full px-3 py-2 rounded-lg border border-input bg-secondary text-sm resize-none" />
                  </div>
                </div>

                <div className="border-t border-border p-4 space-y-3 bg-card/80 backdrop-blur-sm">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal Bruto</span><span className="font-mono">{fCurrency(subtotalSemDesconto)}</span></div>
                    {descontoGeralVal > 0 && <div className="flex justify-between text-emerald-500 font-medium"><span>Desconto Geral</span><span className="font-mono">-{fCurrency(descontoGeralVal)}</span></div>}
                    {custoAdicional > 0 && <div className="flex justify-between text-blue-500 font-medium"><span className="italic">{descCusto || 'Custo Adicional'}</span><span className="font-mono">+{fCurrency(Number(custoAdicional))}</span></div>}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-base font-bold">Total Final</span>
                    <span className="text-xl font-bold font-mono text-yellow-500">{fCurrency(total)}</span>
                  </div>
                  <button
                    disabled={cart.length === 0}
                    onClick={() => {
                      if (!vendedorId) { toast.error('Selecione o Vendedor(a)'); return; }
                      setShowFinalizeEdit(true);
                    }}
                    className="w-full h-10 rounded-lg bg-yellow-500 text-black text-sm font-black hover:bg-yellow-400 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Revisar Pagamento e Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Finalizar Edição */}
      {showFinalizeEdit && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-yellow-500/40 bg-card p-6 space-y-4 shadow-xl animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-yellow-500" /> Confirmar Pagamento
              </h2>
              <button onClick={() => setShowFinalizeEdit(false)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 flex justify-between items-center">
              <span className="text-sm font-bold text-muted-foreground">Total a Pagar</span>
              <span className="text-xl font-black font-mono text-yellow-500">{fCurrency(total)}</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground uppercase">Formas de Pagamento</label>
                <button type="button" onClick={addSplit} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline">
                  <PlusCircle className="h-3.5 w-3.5" /> Adicionar forma
                </button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {pagamentos.map((pgt, idx) => (
                  <div key={pgt.splitId} className="p-3 rounded-lg border border-border bg-secondary/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">#{idx + 1}</span>
                      <select value={pgt.forma_pagamento_id} onChange={(e) => updateSplit(pgt.splitId, 'forma_pagamento_id', e.target.value)} className="flex-1 h-9 px-2 rounded-lg border border-input bg-secondary text-sm">
                        <option value="">Selecione...</option>
                        {formas.map(f => <option key={f.id} value={f.id}>{f.nome.toUpperCase()}</option>)}
                      </select>
                      {pagamentos.length > 1 && (
                        <button type="button" onClick={() => removeSplit(pgt.splitId)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase ml-1">Valor:</span>
                      <input type="number" value={pgt.valor || ''} onChange={(e) => updateSplit(pgt.splitId, 'valor', Number(e.target.value))} placeholder="0,00" className="flex-1 h-8 bg-background border border-border rounded-lg px-3 font-mono text-sm" />
                      {pagamentos.length > 1 && (
                        <button type="button" onClick={() => {
                          const outros = pagamentos.filter(p => p.splitId !== pgt.splitId);
                          const somaOutros = outros.reduce((s, p) => s + (Number(p.valor) || 0), 0);
                          updateSplit(pgt.splitId, 'valor', Math.max(0, total - somaOutros));
                        }} className="text-[9px] font-bold text-primary border border-primary/30 rounded px-1.5 py-1 hover:bg-primary/10 whitespace-nowrap">Restante</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={`flex justify-between items-center p-2 rounded-lg text-xs font-bold ${Math.abs(restantePagamento) < 0.01 ? 'bg-green-500/10 text-green-600 border border-green-500/20' : restantePagamento > 0 ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'}`}>
                <span>{Math.abs(restantePagamento) < 0.01 ? '✓ Pagamento coberto' : restantePagamento > 0 ? `⚠ Falta cobrir: ${fCurrency(restantePagamento)}` : `Troco: ${fCurrency(Math.abs(restantePagamento))}`}</span>
                <span className="font-mono">{fCurrency(totalPagamentos)} / {fCurrency(total)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setShowFinalizeEdit(false)} className="h-10 px-4 rounded-lg border text-sm font-medium hover:bg-secondary">Cancelar</button>
              <button
                onClick={salvarEdicao}
                disabled={editando || pagamentos.some(p => !p.forma_pagamento_id) || totalPagamentos < total - 0.01}
                className="h-10 px-5 rounded-lg bg-yellow-500 text-black text-sm font-black shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-yellow-400 transition"
              >
                {editando ? 'Salvando...' : <><Check className="h-4 w-4" /> Salvar Edição</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes */}
      {selectedVenda && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div className={`bg-card border border-border p-6 rounded-2xl w-full shadow-2xl space-y-4 ${isAdminTab ? 'max-w-2xl' : 'max-w-lg'}`}>
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg flex items-center gap-2">
                {isAdminTab ? <Briefcase size={20} className="text-blue-500"/> : <Package size={20} className="text-primary"/>} 
                {isAdminTab ? 'Detalhes Administrativos' : 'Detalhes'}
              </h2>
              <button onClick={() => setSelectedVenda(null)} className="p-1 hover:bg-accent rounded-full"><X /></button>
            </div>

            {selectedVenda.status === 'cancelada' && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 space-y-1">
                <p className="text-red-500 font-black text-xs uppercase flex items-center gap-2"><Ban size={14} /> Venda Cancelada</p>
                <p className="text-xs text-muted-foreground"><b>Operador:</b> {selectedVenda.cancelado_por} &nbsp;|&nbsp; <b>Data/Hora:</b> {formatDateTime(selectedVenda.cancelado_em)}</p>
                <p className="text-xs text-foreground"><b>Motivo:</b> {selectedVenda.motivo_cancelamento}</p>
              </div>
            )}
            {selectedVenda.status === 'editada' && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 space-y-1">
                <p className="text-yellow-600 font-black text-xs uppercase flex items-center gap-2"><Pencil size={14} /> Venda Editada</p>
                <p className="text-xs text-muted-foreground"><b>Operador:</b> {selectedVenda.editado_por} &nbsp;|&nbsp; <b>Data/Hora:</b> {formatDateTime(selectedVenda.editado_em)}</p>
              </div>
            )}

            <div className={`space-y-1 text-sm border-l-2 pl-3 ${isAdminTab ? 'border-blue-500' : 'border-primary'}`}>
              <p><b>Data:</b> {formatDate(selectedVenda.criado_em)}</p>
              <p><b>Vendedor:</b> {selectedVenda.vendedor_nome || '-'}</p>
              <p><b>Cliente:</b> {selectedVenda.cliente_nome}</p>
              <p><b>Pagamento:</b> {selectedVenda.formas_resumo || selectedVenda.forma_nome}</p>
            </div>

            <div className="max-h-[280px] overflow-y-auto space-y-2 py-2 pr-2">
              {itensDetalhe.map(i => {
                const custoUnitario = i.produtos?.preco_custo || 0;
                const lucroItem = i.total - (custoUnitario * i.quantidade);

                return (
                  <div key={i.id} className="flex justify-between items-start text-sm border-b border-border/50 pb-2">
                    <div className="flex flex-col gap-0.5 flex-1 mr-4">
                      <span>{i.produto_nome} <b className={isAdminTab ? 'text-blue-500' : 'text-primary'}>x{i.quantidade}</b></span>
                      <span className="text-[10px] text-muted-foreground font-mono">Cd: <span className="text-foreground/70">{i.codigo_produto || '-'}</span> | Lote: <span className="text-foreground/70">{i.lote_observacao || '-'}</span></span>
                      {isAdminTab && <span className="text-[10px] text-muted-foreground mt-0.5">Custo Un: <span className="text-orange-400">{formatCurrency(custoUnitario)}</span> | Venda Un: {formatCurrency(i.quantidade > 0 ? i.total / i.quantidade : 0)}</span>}
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="font-mono font-bold">{formatCurrency(i.total)}</span>
                      {isAdminTab && <span className="text-[10px] text-green-500 font-bold mt-0.5">Lucro: {formatCurrency(lucroItem)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="space-y-1.5 border-t border-border/50 pt-2 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal Itens:</span><span>{formatCurrency(selectedVenda.subtotal)}</span></div>
              {selectedVenda.desconto > 0 && <div className="flex justify-between text-emerald-500 font-bold"><span>Desconto Aplicado:</span><span>- {formatCurrency(selectedVenda.desconto)}</span></div>}
              {selectedVenda.custo_adicional > 0 && <div className={`flex justify-between font-bold ${selectedVenda.custo_no_lucro && isAdminTab ? 'text-green-500' : 'text-red-500'}`}><span>{selectedVenda.desc_custo_adicional || 'Custo Adicional'}:</span><span>{selectedVenda.custo_no_lucro && isAdminTab ? '+' : '+'} {formatCurrency(selectedVenda.custo_adicional)}</span></div>}
              
              {isAdminTab && (
                <>
                  <div className="flex justify-between text-orange-400 font-bold border-t border-border/30 pt-1 mt-1"><span>Custo Total Estoque:</span><span>- {formatCurrency(Number(selectedVenda.total_custo) || 0)}</span></div>
                  <div className="flex justify-between text-green-500 font-black pt-1"><span>LUCRO LÍQUIDO FINAL:</span><span>{formatCurrency(Number(selectedVenda.lucro_liquido) || 0)}</span></div>
                  <div className="flex justify-between text-blue-500 font-bold"><span>Margem Operacional:</span><span>{selectedVenda.total > 0 ? ((Number(selectedVenda.lucro_liquido) || 0) / selectedVenda.total * 100).toFixed(2) : '0.00'}%</span></div>
                </>
              )}

              {selectedVenda.observacao && (
                <div className="mt-3 p-3 bg-secondary/50 rounded-xl text-xs text-muted-foreground border border-border/50">
                  <p className={`font-black uppercase mb-1 text-[10px] ${isAdminTab ? 'text-blue-500' : 'text-primary'}`}>Observações do Pedido:</p>
                  {selectedVenda.observacao}
                </div>
              )}
            </div>

            {!isAdminTab && (
              <div className="bg-secondary p-4 rounded-xl flex justify-between items-center mt-2">
                <span className="font-bold text-muted-foreground">TOTAL FINAL</span>
                <span className="text-xl font-black text-primary">{formatCurrency(selectedVenda.total)}</span>
              </div>
            )}

            <button 
              onClick={() => {
                if (isAdminTab) {
                  imprimirVendaAdmin(selectedVenda, itensDetalhe);
                } else {
                  setPrintSelection({ venda: selectedVenda, itens: itensDetalhe, tipo: 'comum' });
                }
              }}
              className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all text-white ${isAdminTab ? 'bg-blue-600' : 'bg-primary'}`}
            >
              <Printer size={18}/> {isAdminTab ? 'IMPRIMIR COMPROVANTE INTERNO' : 'IMPRIMIR COMPROVANTE'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de Seleção de Impressão */}
      {printSelection && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-[100] p-4">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Printer size={20} className="text-primary"/> Escolha o Formato
              </h2>
              <button onClick={() => setPrintSelection(null)} className="p-1 hover:bg-accent rounded-full"><X /></button>
            </div>
            
            <div className="grid gap-3">
              <button 
                onClick={() => { imprimirA4(printSelection.venda, printSelection.itens); setPrintSelection(null); }}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all group"
              >
                <FileText size={40} className="text-muted-foreground group-hover:text-primary" />
                <div className="text-center">
                  <span className="block font-bold">Papel A4</span>
                  <span className="text-[10px] text-muted-foreground uppercase">Impressora Convencional</span>
                </div>
              </button>

              <button 
                onClick={() => { imprimirTermica(printSelection.venda, printSelection.itens); setPrintSelection(null); }}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-border hover:border-orange-500 hover:bg-orange-500/5 transition-all group"
              >
                <Zap size={40} className="text-muted-foreground group-hover:text-orange-500" />
                <div className="text-center">
                  <span className="block font-bold">Papel Térmico</span>
                  <span className="text-[10px] text-muted-foreground uppercase">Impressora de Cupom (80mm)</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
