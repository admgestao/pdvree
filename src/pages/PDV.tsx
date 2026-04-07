import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, Percent, DollarSign,
  FileText, CreditCard, X, Check, AlertCircle, Info, UserCircle, Tag, PlusCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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

interface PromoAtiva {
  id: string;
  produto_id: string;
  lote_id?: string;
  preco_promocional: number;
  quantidade_minima: number;
  quantidade_maxima?: number;
  condicao_pagamento: string;
  nome_promocao: string;
}

interface Produto {
  id: string;
  nome: string;
  codigo: string;
  marca?: string;
  preco_venda: number;
  preco_custo: number;
  estoque_atual: number;
  categoria: string;
  lote_id?: string;
  lote_codigo?: string;
  lotes?: { 
    id: string;
    codigo: string;
    data_validade?: string;
    quantidade_atual?: number;
    observacao?: string;
    preco_venda_lote?: number;
    nome_produto_lote?: string;
  }[];
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

interface Usuario {
  id: string;
  nome_usuario: string;
}

interface PagamentoSplit {
  splitId: string;
  forma_pagamento_id: string;
  valor: number;
}

export default function PDV() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clienteManual, setClienteManual] = useState('');
  const [clienteObj, setClienteObj] = useState<Pessoa | null>(null);
  const [observacao, setObservacao] = useState('');
  
  const [custoAdicional, setCustoAdicional] = useState(0);
  const [descCusto, setDescCusto] = useState('');
  const [custoNoLucro, setCustoNoLucro] = useState(false);
  const [descontoGeral, setDescontoGeral] = useState(0);
  const [descontoGeralTipo, setDescontoGeralTipo] = useState<'percent' | 'fixed'>('percent');
  const [showResults, setShowResults] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  
  const [clientes, setClientes] = useState<Pessoa[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [showFinalize, setShowFinalize] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [promocoesAtivas, setPromocoesAtivas] = useState<PromoAtiva[]>([]);
  const [usarCredito, setUsarCredito] = useState(false);
  const [vendedores, setVendedores] = useState<Usuario[]>([]);
  const [vendedorId, setVendedorId] = useState(() => {
    return localStorage.getItem('@pdv:vendedor_id') || '';
  });
  const [lotSelectionItem, setLotSelectionItem] = useState<Produto | null>(null);

  // Estados para múltiplos pagamentos
  const [pagamentos, setPagamentos] = useState<PagamentoSplit[]>([]);
  const darkScrollbarClass = "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overflow-y-auto";
  const customScrollStyles = {
    scrollbarWidth: 'thin',
    scrollbarColor: '#3f3f46 transparent',
  } as React.CSSProperties;
  
  const fCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    loadFormas();
    loadClientes();
    loadPromocoes();
    loadVendedores();
  }, []);

  async function loadVendedores() {
    const { data } = await supabase.from('usuarios').select('id, nome_usuario');
    setVendedores(data || []);
  }

  async function loadFormas() {
    const { data } = await supabase.from('formas_pagamento').select('id, nome').eq('ativo', true);
    setFormas(data || []);
  }

  async function loadClientes() {
    const { data } = await supabase.from('pessoas').select('*').eq('categoria', 'cliente');
    setClientes(data || []);
  }

  async function loadPromocoes() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('promocoes').select('*')
      .eq('status', true)
      .lte('data_inicio', today)
      .or(`data_fim.gte.${today},data_fim.is.null`);
    setPromocoesAtivas(data || []);
  }

  const searchProducts = useCallback(async (term: string) => {
    const query = term.trim();
    if (!query) { setProdutos([]); setShowResults(false); return; }
    
    try {
      const searchPattern = `%${query.replace(/\s+/g, '%')}%`;
      const { data: pData } = await supabase.from('produtos').select('*')
        .or(`nome.ilike.${searchPattern},codigo.ilike.${searchPattern},categoria.ilike.${searchPattern}`)
        .limit(10);
      
      const { data: lData } = await supabase.from('produto_lotes')
        .select('*, produtos(*)')
        .ilike('codigo_barras', `%${query}%`)
        .limit(5);

      const pIds = (pData || []).map(p => p.id);
      let lotesAdicionais: any[] = [];
      if (pIds.length > 0) {
        const { data: lExtras } = await supabase.from('produto_lotes')
          .select('id, codigo_barras, produto_id, data_validade, quantidade_atual, observacao, preco_venda')
          .in('produto_id', pIds);
        lotesAdicionais = lExtras || [];
      }

      const produtosMap = new Map<string, Produto>();
      (pData || []).forEach(p => {
        produtosMap.set(p.id, {
          id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
          preco_venda: Number(p.preco_venda) || 0, preco_custo: Number(p.preco_custo) || 0,
          estoque_atual: Number(p.estoque_atual) || 0, categoria: p.categoria || '',
          lotes: []
        });
      });

      lotesAdicionais.forEach(lote => {
        const prod = produtosMap.get(lote.produto_id);
        if (prod && prod.lotes) {
           prod.lotes.push({ 
             id: lote.id, codigo: lote.codigo_barras, data_validade: lote.data_validade,
             quantidade_atual: lote.quantidade_atual, observacao: lote.observacao,
             preco_venda_lote: Number(lote.preco_venda) || Number(prod.preco_venda)
           });
        }
      });

      if (lData) {
        lData.forEach(lote => {
          if (lote.produtos) {
            let prod = produtosMap.get(lote.produtos.id);
            if (!prod) {
              prod = {
                id: lote.produtos.id, nome: lote.produtos.nome, codigo: lote.produtos.codigo || '',
                marca: lote.produtos.marca || '', preco_venda: Number(lote.produtos.preco_venda) || 0,
                preco_custo: Number(lote.produtos.preco_custo) || 0, estoque_atual: Number(lote.produtos.estoque_atual) || 0,
                categoria: lote.produtos.categoria || '', lotes: []
              };
              produtosMap.set(prod.id, prod);
            }
            if (prod.lotes && !prod.lotes.find(l => l.id === lote.id)) {
              prod.lotes.push({
                id: lote.id, codigo: lote.codigo_barras, data_validade: lote.data_validade,
                quantidade_atual: lote.quantidade_atual, observacao: lote.observacao,
                preco_venda_lote: Number(lote.preco_venda) || Number(lote.produtos.preco_venda)
              });
            }
            if (query === lote.codigo_barras) {
              prod.lote_id = lote.id;
              prod.lote_codigo = lote.codigo_barras;
              prod.preco_venda = Number(lote.preco_venda) || Number(lote.produtos.preco_venda);
            }
          }
        });
      }

      setProdutos(Array.from(produtosMap.values()));
      setShowResults(true);
    } catch (error) { toast.error("Erro ao buscar produtos"); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { searchProducts(search); }, 300);
    return () => clearTimeout(timer);
  }, [search, searchProducts]);

  const handleSearchExact = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = search.trim();
    if (!query) return;

    setShowResults(false);
    setProdutos([]);
    setSearch('');

    try {
      // 1. Tenta buscar primeiro pelo código exato do PRODUTO
      const { data: prodsData } = await supabase
        .from('produtos')
        .select('*')
        .eq('codigo', query)
        .eq('ativo', true);

      if (prodsData && prodsData.length > 0) {
        const p = prodsData[0];
        if (p.estoque_atual <= 0) { toast.error('Produto sem estoque'); return; }

        // Busca TODOS os lotes ativos com estoque para este produto
        const { data: lotesDoProduto } = await supabase
          .from('produto_lotes')
          .select('*')
          .eq('produto_id', p.id)
          .gt('quantidade_atual', 0);

        const lotesValidos = (lotesDoProduto || []).filter(l => Number(l.quantidade_atual) > 0);

        if (lotesValidos.length > 1) {
          // Abre modal de lotes SOMENTE se houver mais de 1 lote com estoque
          setLotSelectionItem({
            id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
            preco_venda: Number(p.preco_venda) || 0, preco_custo: Number(p.preco_custo) || 0,
            estoque_atual: Number(p.estoque_atual) || 0, categoria: p.categoria || '',
            lotes: lotesValidos.map(l => ({
              id: l.id,
              codigo: l.codigo_barras,
              data_validade: l.data_validade,
              quantidade_atual: l.quantidade_atual,
              observacao: l.observacao,
              preco_venda_lote: Number(l.preco_venda) || Number(p.preco_venda) || 0,
              nome_produto_lote: p.nome
            }))
          });
          return;
        } else if (lotesValidos.length === 1) {
          // Único lote, adiciona direto
          const lote = lotesValidos[0];
          executeAddToCart({
            id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
            preco_venda: Number(lote.preco_venda) || Number(p.preco_venda) || 0,
            preco_custo: Number(p.preco_custo) || 0,
            estoque_atual: Number(p.estoque_atual) || 0, categoria: p.categoria || '',
            lote_id: lote.id, lote_codigo: lote.codigo_barras, lotes: []
          });
          return;
        } else {
          // Sem lotes mapeados, adiciona produto puro
          executeAddToCart({
            id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
            preco_venda: Number(p.preco_venda) || 0, preco_custo: Number(p.preco_custo) || 0,
            estoque_atual: Number(p.estoque_atual) || 0, categoria: p.categoria || '',
            lotes: []
          });
          return;
        }
      }

      // 2. Se não achou produto direto, tenta buscar por código de barras de LOTE específico
      const { data: lotesData } = await supabase
        .from('produto_lotes')
        .select('*, produtos(*)')
        .eq('codigo_barras', query)
        .gt('quantidade_atual', 0);

      const lotesValidos = (lotesData || []).filter(l => Number(l.quantidade_atual) > 0);

      if (lotesValidos.length > 0) {
        if (lotesValidos.length === 1) {
          const lote = lotesValidos[0];
          const p = lote.produtos;
          if (p) {
            if (p.estoque_atual <= 0) { toast.error('Produto sem estoque'); return; }
            executeAddToCart({
              id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
              preco_venda: Number(lote.preco_venda) || Number(p.preco_venda) || 0,
              preco_custo: Number(p.preco_custo) || 0,
              estoque_atual: Number(p.estoque_atual) || 0, categoria: p.categoria || '',
              lote_id: lote.id, lote_codigo: lote.codigo_barras, lotes: []
            });
          } else {
            toast.error('Produto base não encontrado para este lote.');
          }
        } else {
          // Raro: múltiplos lotes diferentes com o mesmo código de barras
          const baseProd = lotesValidos[0].produtos;
          if (baseProd) {
            setLotSelectionItem({
              id: baseProd.id, nome: baseProd.nome, codigo: baseProd.codigo || '', marca: baseProd.marca || '',
              preco_venda: Number(baseProd.preco_venda) || 0, preco_custo: Number(baseProd.preco_custo) || 0,
              estoque_atual: Number(baseProd.estoque_atual) || 0, categoria: baseProd.categoria || '',
              lotes: lotesValidos.map(l => ({
                id: l.id,
                codigo: l.codigo_barras,
                data_validade: l.data_validade,
                quantidade_atual: l.quantidade_atual,
                observacao: l.observacao,
                preco_venda_lote: Number(l.preco_venda) || Number(baseProd.preco_venda) || 0,
                nome_produto_lote: baseProd.nome || ''
              }))
            });
          }
        }
      } else {
        toast.error('Produto ou Lote não encontrado');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro na busca');
    }
  };

  const addToCart = (product: Produto) => {
    if (product.estoque_atual <= 0) { toast.error('Produto sem estoque'); return; }

    // Filtra apenas lotes que possuem saldo real > 0
    const activeLotes = product.lotes ? product.lotes.filter(l => Number(l.quantidade_atual || 0) > 0) : [];

    if (!product.lote_id && activeLotes.length > 1) {
      setLotSelectionItem({
        ...product,
        lotes: activeLotes.map(l => ({
          ...l,
          preco_venda_lote: Number(l.preco_venda_lote) || product.preco_venda,
          nome_produto_lote: product.nome
        }))
      });
      setShowResults(false);
      return;
    }

    const finalProduct = { ...product };
    if (!finalProduct.lote_id && activeLotes.length === 1) {
      finalProduct.lote_id = activeLotes[0].id;
      finalProduct.lote_codigo = activeLotes[0].codigo;
      finalProduct.preco_venda = Number(activeLotes[0].preco_venda_lote) || finalProduct.preco_venda;
    }

    executeAddToCart(finalProduct);
  };

  const executeAddToCart = (product: Produto) => {
    setCart((prev) => {
      const normalizedLoteId = product.lote_id ?? null;

      let existing = prev.find((i) =>
        i.id === product.id &&
        (
          (i.lote_id ?? null) === normalizedLoteId ||
          (!!product.lote_codigo && i.lote_codigo === product.lote_codigo)
        )
      );

      if (!existing) {
        const sameProdItems = prev.filter((i) => i.id === product.id);
        if (sameProdItems.length === 1) {
          existing = sameProdItems[0];
        }
      }

      if (existing) {
        if (existing.quantity >= product.estoque_atual) { 
          toast.error('Limite atingido');
          return prev; 
        }
        return prev.map((i) =>
          i.cartItemId === existing!.cartItemId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }

      return [
        ...prev,
        {
          cartItemId: crypto.randomUUID(),
          id: product.id,
          nome: product.nome,
          codigo: product.codigo,
          marca: product.marca,
          price: product.preco_venda,
          preco_custo: product.preco_custo,
          quantity: 1,
          stock: product.estoque_atual,
          discount: 0,
          discountType: 'percent',
          lote_id: product.lote_id,
          lote_codigo: product.lote_codigo,
        },
      ];
    });
    
    setSearch('');
    setProdutos([]);
    setShowResults(false);
  };

  const handleSelectSpecificLot = (product: Produto, lote: any) => {
    executeAddToCart({ 
      ...product, 
      nome: lote.nome_produto_lote || product.nome,
      preco_venda: Number(lote.preco_venda_lote) || product.preco_venda,
      lote_id: lote.id, 
      lote_codigo: lote.codigo 
    });
    setLotSelectionItem(null);
  };

  const updateQty = (cartItemId: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.cartItemId !== cartItemId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return null as any;
      if (newQty > i.stock) { toast.error('Estoque insuficiente'); return i; }
      return { ...i, quantity: newQty };
    }).filter(Boolean));
  };

  const updateItemDiscount = (cartItemId: string, value: number, type: 'percent' | 'fixed') => {
    setCart((prev) => prev.map((i) => i.cartItemId === cartItemId ? { ...i, discount: value, discountType: type } : i));
  };

  const removeItem = (cartItemId: string) => { 
    setCart((prev) => prev.filter((i) => i.cartItemId !== cartItemId)); 
  };

  const getPromoForItem = (item: CartItem, currentFormaPgto?: string) => {
    const matches = promocoesAtivas.filter(p => p.produto_id === item.id && (!p.lote_id || p.lote_id === item.lote_id));
    const validQty = matches.filter(p => item.quantity >= (p.quantidade_minima || 1) && (!p.quantidade_maxima || item.quantity <= p.quantidade_maxima));
    const validPgto = validQty.filter(p => p.condicao_pagamento === 'todas' || p.condicao_pagamento === currentFormaPgto);
    if (validPgto.length > 0) {
      return validPgto.reduce((prev, curr) => prev.preco_promocional < curr.preco_promocional ? prev : curr);
    }
    return null;
  };

  const getDynamicItemPrice = (item: CartItem) => {
    const formaRefId = pagamentos.length > 0 ? pagamentos[0].forma_pagamento_id : '';
    const promo = getPromoForItem(item, formaRefId);
    return { unitPrice: promo ? promo.preco_promocional : item.price, promo };
  };

  const getItemTotal = (item: CartItem) => {
    const { unitPrice } = getDynamicItemPrice(item);
    const base = unitPrice * item.quantity;
    if (item.discount <= 0) return base;
    if (item.discountType === 'percent') return base * (1 - item.discount / 100);
    return Math.max(0, base - item.discount);
  };

  const subtotalSemDesconto = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItensComDescontoIndividual = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
  const descontoDosItens = subtotalSemDesconto - totalItensComDescontoIndividual;
  const totalCustoItens = cart.reduce((sum, item) => sum + (item.preco_custo * item.quantity), 0);
  
  const descontoGeralVal = descontoGeralTipo === 'percent' ?
    totalItensComDescontoIndividual * (descontoGeral / 100) : descontoGeral;
  
  const totalDescontoAplicado = descontoDosItens + descontoGeralVal;
  const totalBruto = Math.max(0, totalItensComDescontoIndividual - descontoGeralVal + (Number(custoAdicional) || 0));
  
  const creditoDisponivel = clienteObj?.credito || 0;
  const valorAbatidoCredito = usarCredito ? Math.min(totalBruto, creditoDisponivel) : 0;
  const total = totalBruto - valorAbatidoCredito;
  const lucroLiquido = (totalItensComDescontoIndividual - descontoGeralVal) - totalCustoItens + (custoNoLucro ? Number(custoAdicional) : 0);

  // Lógica dos múltiplos pagamentos
  const totalPagamentos = pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const restantePagamento = total - totalPagamentos;

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
    setPagamentos(prev => prev.map(p => 
      p.splitId === splitId ? { ...p, [field]: value } : p
    ));
  };

  // Troco calculado apenas sobre dinheiro
  const troco = (() => {
    const pagamentosDinheiro = pagamentos.filter(p => {
      const forma = formas.find(f => f.id === p.forma_pagamento_id);
      return forma?.nome.toLowerCase().includes('dinheiro');
    });
    const totalDinheiro = pagamentosDinheiro.reduce((s, p) => s + Number(p.valor), 0);
    const outrosPagamentos = pagamentos.filter(p => {
      const forma = formas.find(f => f.id === p.forma_pagamento_id);
      return !forma?.nome.toLowerCase().includes('dinheiro');
    });
    const totalOutros = outrosPagamentos.reduce((s, p) => s + Number(p.valor), 0);
    const restanteParaDinheiro = total - totalOutros;
    return Math.max(0, totalDinheiro - restanteParaDinheiro);
  })();

  function selectCliente(id: string) {
    const c = clientes.find(x => x.id === id);
    if (c) { 
      setClienteObj(c); 
      setClienteManual(''); 
      setUsarCredito(false);
    } else { 
      setClienteObj(null);
    }
  }

  const handleVendedorChange = (id: string) => {
    setVendedorId(id);
    localStorage.setItem('@pdv:vendedor_id', id);
  };

  async function finalizeSale() {
    if (cart.length === 0) return;
    if (pagamentos.length === 0 || pagamentos.some(p => !p.forma_pagamento_id)) {
      toast.error('Preencha todas as formas de pagamento');
      return;
    }
    if (Math.abs(totalPagamentos - total) > 0.01 && totalPagamentos < total) {
      toast.error(`Falta ${fCurrency(restantePagamento)} para cobrir o total`);
      return;
    }
    if (!vendedorId) { 
      toast.error('Selecione o Vendedor(a) antes de finalizar!');
      return; 
    }

    setSaving(true);
    try {
      const selectedVendedor = vendedores.find(v => v.id === vendedorId);
      const nomeVendedor = selectedVendedor?.nome_usuario || 'Não Informado';
      const formaPrincipalId = pagamentos.length > 0 ? pagamentos[0].forma_pagamento_id : null;
      const { data: venda, error: vendaErr } = await supabase.from('vendas').insert({
        cliente_id: clienteObj?.id || null,
        cliente_nome_manual: clienteObj ? null : clienteManual,
        usuario_id: user?.id || 'Operador',
        vendedor_nome: nomeVendedor,
        subtotal: subtotalSemDesconto,
        desconto: totalDescontoAplicado,
        custo_adicional: Number(custoAdicional) || 0,
        desc_custo_adicional: descCusto,
        custo_no_lucro: custoNoLucro,
        total: total,
        total_custo: totalCustoItens,
        lucro_liquido: lucroLiquido,
        valor_credito_usado: valorAbatidoCredito,
        forma_pagamento_id: formaPrincipalId,
        troco,
        observacao,
      }).select('id').single();
      if (vendaErr) throw vendaErr;

      // Salvar pagamentos detalhados
      const pagamentosParaSalvar = pagamentos.map(p => ({
        venda_id: venda.id,
        forma_pagamento_id: p.forma_pagamento_id,
        valor: Number(p.valor) || 0,
      }));
      const { error: pgtoErr } = await supabase.from('vendas_pagamentos').insert(pagamentosParaSalvar);
      if (pgtoErr) throw pgtoErr;

      const itensParaSalvar = cart.map(item => {
        const { unitPrice } = getDynamicItemPrice(item);
        return {
          venda_id: venda.id,
          produto_id: item.id,
          produto_nome: item.nome,
          quantidade: item.quantity,
          preco: unitPrice,
          desconto_item: item.discount,
          desconto_tipo_item: item.discountType,
          total: getItemTotal(item)
        };
      });

      const { error: itensErr } = await supabase.from('vendas_itens').insert(itensParaSalvar);
      if (itensErr) throw itensErr;

      for (const item of cart) {
        await supabase.from('produtos').update({ 
          estoque_atual: item.stock - item.quantity 
        }).eq('id', item.id);
        if (item.lote_id) {
          const { data: lote } = await supabase.from('produto_lotes')
            .select('quantidade_atual, quantidade')
            .eq('id', item.lote_id)
            .single();
          if (lote) {
            const novaQtd = Number(lote.quantidade_atual || lote.quantidade || 0) - item.quantity;
            await supabase.from('produto_lotes').update({ 
              quantidade_atual: novaQtd, 
              quantidade: novaQtd, 
              status: novaQtd <= 0 ? 'esgotado' : 'ativo' 
            }).eq('id', item.lote_id);
          }
        }
      }

      if (valorAbatidoCredito > 0 && clienteObj) {
        await supabase.from('pessoas').update({ 
          credito: clienteObj.credito - valorAbatidoCredito 
        }).eq('id', clienteObj.id);
      }

      // ✅ CORREÇÃO: Registro automático no caixa para pagamentos em dinheiro
      // Calcula o troco uma única vez e distribui corretamente
      let trocoRestante = troco;
      for (const pgt of pagamentos) {
        const forma = formas.find(f => f.id === pgt.forma_pagamento_id);
        const nomeLower = forma?.nome?.toLowerCase() || '';
        if (nomeLower.includes('dinheiro')) {
          const valorPago = Number(pgt.valor) || 0;
          // Subtrai o troco apenas do primeiro split de dinheiro que cobrir
          const trocoDescontado = Math.min(trocoRestante, valorPago);
          const valorParaCaixa = valorPago - trocoDescontado;
          trocoRestante = trocoRestante - trocoDescontado;

          if (valorParaCaixa > 0) {
            const { error: caixaErr } = await supabase.from('caixa_movimentos').insert({
              usuario_id: nomeVendedor,
              tipo: 'entrada',
              valor: valorParaCaixa,
              descricao: `Venda #${venda.id.substring(0, 8)} - ${forma?.nome || 'Dinheiro'}`,
            });
            if (caixaErr) {
              console.error('Erro ao registrar entrada no caixa:', caixaErr);
            }
          }
        }
      }

      setShowSuccess(true);
      setShowFinalize(false);
      setTimeout(() => { window.location.reload(); }, 2000);
    } catch (err: any) { 
      toast.error('Erro ao finalizar: ' + err.message);
      setSaving(false);
    }
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col lg:flex-row animate-fade-in bg-background text-foreground">
      <style>{`
        @keyframes pulse-yellow { 0%, 100% { background-color: rgba(234, 179, 8, 0.1); border-color: rgba(234, 179, 8, 0.5); } 50% { background-color: rgba(234, 179, 8, 0.3); border-color: rgba(234, 179, 8, 1); } }
        .animate-pulse-yellow { animation: pulse-yellow 1.5s infinite; }
      `}</style>

      {/* COLUNA ESQUERDA - CARRINHO */}
      <div className="flex-1 flex flex-col border-r border-border min-w-0">
        <div className="p-3 border-b border-border flex items-center justify-between bg-card/50">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black tracking-tighter text-primary">P.D.V</h1>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">Terminal de Vendas</span>
          </div>
        </div>

        <div className="p-3 border-b border-border">
          <form onSubmit={handleSearchExact} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              onFocus={() => search.trim().length > 0 && setShowResults(true)}
              placeholder="Bipe o código de barras ou busque por nome e código..." 
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-secondary text-sm focus:outline-none" 
            />
            
            {showResults && produtos.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-50 max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-zinc-800">
                {produtos.map((p, idx) => (
                  <button key={p.id + '-' + idx} type="button" onClick={() => addToCart(p)} className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 text-left border-b border-border last:border-0 ${p.estoque_atual <= 0 ? 'bg-red-500/20 border-red-500/40' : ''}`}>
                    <div>
                      <p className={`text-sm font-bold ${p.estoque_atual <= 0 ? 'text-red-500 underline' : ''}`}>{p.nome}</p>
                      <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{p.categoria} {p.marca ? ` • ${p.marca}` : ''} • {p.estoque_atual <= 0 ? <span className="text-red-600 font-black animate-pulse">⚠️ SEM ESTOQUE</span> : `Estoque: ${p.estoque_atual}`}</p>
                      {p.lotes && p.lotes.length > 0 && (<p className="text-[10px] text-blue-500 font-bold mt-0.5">{p.lotes.length === 1 ? `LOTE: ${p.lotes[0].codigo}` : `${p.lotes.length} LOTES DISPONÍVEIS`}</p>)}
                    </div>
                    <span className={`text-sm font-mono font-semibold ${p.estoque_atual <= 0 ? 'text-red-400' : 'text-primary'}`}>{fCurrency(p.preco_venda)}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {clienteObj?.observacoes && (
          <div className="mx-3 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-600 text-[11px] font-bold animate-pulse flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" /> ATENÇÃO: {clienteObj.observacoes}
          </div>
        )}

        <div className={`flex-1 p-3 space-y-2 ${darkScrollbarClass}`} style={customScrollStyles}>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20">
              <ShoppingCart className="h-12 w-12 mb-3" />
              <p>Carrinho vazio</p>
            </div>
          ) : (
            cart.map((item) => {
              const { unitPrice, promo } = getDynamicItemPrice(item);
              const isPromo = promo !== null;

              return (
                <div key={item.cartItemId} className={`rounded-lg border bg-card p-3 flex flex-col gap-2 ${isPromo ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate">{item.nome}</p>
                        {isPromo && <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-black flex items-center gap-1"><Tag className="h-2.5 w-2.5"/> {promo.nome_promocao}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Estoque: {item.stock} • Unit: {isPromo ? <><span className="line-through opacity-50">{fCurrency(item.price)}</span> <span className="text-primary font-bold">{fCurrency(unitPrice)}</span></> : fCurrency(item.price)}
                      </p>
                      {item.lote_codigo && (<p className="text-[10px] text-blue-500 font-medium mt-0.5">Lote Bipado: {item.lote_codigo}</p>)}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 border-r border-border pr-3">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Desc. Item</span>
                        <input type="number" value={item.discount || ''} onChange={(e) => updateItemDiscount(item.cartItemId, Number(e.target.value), item.discountType)} className="w-12 h-7 bg-secondary border border-border rounded text-[11px] px-1 font-mono" />
                        <select value={item.discountType} onChange={(e) => updateItemDiscount(item.cartItemId, item.discount, e.target.value as any)} className="h-7 bg-secondary border border-border rounded text-[10px] px-0.5">
                          <option value="percent">%</option><option value="fixed">R$</option>
                        </select>
                      </div>
                      <div className="flex items-center rounded-lg border border-border bg-secondary">
                        <button type="button" onClick={() => updateQty(item.cartItemId, -1)} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-l-lg"><Minus className="h-3 w-3" /></button>
                        <span className="h-8 w-8 flex items-center justify-center text-sm font-mono border-x border-border">{item.quantity}</span>
                        <button type="button" onClick={() => updateQty(item.cartItemId, 1)} disabled={item.quantity >= item.stock} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-r-lg"><Plus className="h-3 w-3" /></button>
                      </div>
                      <span className={`text-sm font-mono font-bold w-24 text-right ${isPromo ? 'text-primary' : ''}`}>{fCurrency(getItemTotal(item))}</span>
                      <button type="button" onClick={() => removeItem(item.cartItemId)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* COLUNA DIREITA - PAINEL */}
      <div className={`w-full lg:w-80 xl:w-96 flex flex-col border-t lg:border-t-0 border-border bg-card/30 ${darkScrollbarClass}`} style={customScrollStyles}>
        <div className="flex-1 p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5" /> Vendedor(a) *</label>
            <select value={vendedorId} onChange={(e) => handleVendedorChange(e.target.value)} className={`w-full h-10 px-3 rounded-lg border text-sm font-bold outline-none ${!vendedorId ? 'animate-pulse-yellow border-yellow-500 text-yellow-700' : 'bg-green-500/10 border-green-500 text-green-600'}`}>
              <option value="" className="bg-background text-foreground">-- SELECIONE O VENDEDOR --</option>
              {vendedores.map(v => (<option key={v.id} value={v.id} className="bg-background text-foreground">{v.nome_usuario.toUpperCase()}</option>))}
            </select>
          </div>

          {clienteObj && (
             <div className="p-3 rounded-xl border border-border bg-secondary/20 space-y-2 animate-in slide-in-from-right-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5"><User className="h-3 w-3" /> Status do Cliente</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-background border border-border"><p className="text-muted-foreground">Crédito</p><p className="font-mono text-green-600 font-bold">{fCurrency(clienteObj.credito)}</p></div>
                  <div className="p-2 rounded bg-background border border-border"><p className="text-muted-foreground">Limite</p><p className="font-mono text-primary font-bold">{fCurrency(clienteObj.limite_compra)}</p></div>
                </div>
                {clienteObj.credito > 0 && (<button onClick={() => setUsarCredito(!usarCredito)} className={`w-full h-8 rounded-lg text-[10px] font-bold transition-all ${usarCredito ? 'bg-green-600 text-white shadow-lg' : 'bg-zinc-700 text-zinc-300'}`}>{usarCredito ? '✓ CRÉDITO APLICADO' : 'USAR CRÉDITO NO PEDIDO?'}</button>)}
             </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><User className="h-3 w-3" /> Cliente</label>
            <select value={clienteObj?.id || ''} onChange={(e) => selectCliente(e.target.value)} className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm">
              <option value="">-- Buscar no cadastro --</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {!clienteObj && <input type="text" value={clienteManual} onChange={(e) => setClienteManual(e.target.value)} placeholder="Nome manual..." className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm mt-2" />}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><Percent className="h-3 w-3" /> Desconto Geral</label>
            <div className="flex gap-2">
              <input type="number" value={descontoGeral || ''} onChange={(e) => setDescontoGeral(Number(e.target.value))} className="flex-1 h-9 px-3 rounded-lg border border-input bg-secondary text-sm font-mono" />
              <select value={descontoGeralTipo} onChange={(e) => setDescontoGeralTipo(e.target.value as any)} className="h-9 px-2 rounded-lg border border-input bg-secondary text-sm">
                <option value="percent">%</option><option value="fixed">R$</option>
              </select>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border bg-secondary/20 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> Custo Adicional</label>
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
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><FileText className="h-3 w-3" /> Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas da venda..." rows={2} className="w-full px-3 py-2 rounded-lg border border-input bg-secondary text-sm resize-none" />
          </div>
        </div>

        <div className="border-t border-border p-4 space-y-3 bg-card/80 backdrop-blur-sm">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal Bruto</span><span className="font-mono">{fCurrency(subtotalSemDesconto)}</span></div>
            {descontoDosItens > 0 && (<div className="flex justify-between text-emerald-500 font-medium"><span>Descontos (Itens/Promo)</span><span className="font-mono">-{fCurrency(descontoDosItens)}</span></div>)}
            {descontoGeralVal > 0 && (<div className="flex justify-between text-emerald-500 font-medium"><span>Desconto Geral</span><span className="font-mono">-{fCurrency(descontoGeralVal)}</span></div>)}
            {custoAdicional > 0 && (<div className="flex justify-between text-blue-500 font-medium"><span className="italic">{descCusto || 'Custo Adicional'}</span><span className="font-mono">+{fCurrency(Number(custoAdicional))}</span></div>)}
            {valorAbatidoCredito > 0 && (<div className="flex justify-between text-green-600 font-bold"><span>Crédito Utilizado</span><span className="font-mono">-{fCurrency(valorAbatidoCredito)}</span></div>)}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <div className="flex flex-col">
              <span className="text-base font-bold">Total Final</span>
              {totalDescontoAplicado > 0 && (<span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">Economia: {fCurrency(totalDescontoAplicado)}</span>)}
            </div>
            <span className="text-xl font-bold font-mono text-primary">{fCurrency(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { 
              setCart([]);
              setCustoAdicional(0); 
              setDescCusto(''); 
              setUsarCredito(false); 
              setObservacao(''); 
              setPagamentos([]);
            }} className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary flex items-center justify-center gap-1.5"><X className="h-3.5 w-3.5" /> Limpar</button>
            <button disabled={cart.length === 0} onClick={() => { 
              if(!vendedorId) return toast.error("Selecione o Vendedor(a)!");
              setPagamentos([{ 
                splitId: crypto.randomUUID(), 
                forma_pagamento_id: formas[0]?.id || '', 
                valor: total 
              }]);
              setShowFinalize(true); 
            }} className="h-10 rounded-lg text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 transition-all bg-primary hover:opacity-90"><CreditCard className="h-3.5 w-3.5" /> Finalizar</button>
          </div>
        </div>
      </div>

      {/* MODAL - SELEÇÃO DE LOTE */}
      {lotSelectionItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-bold text-primary">Múltiplos Lotes Encontrados</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Selecione o item desejado para código correspondente</p>
              </div>
              <button onClick={() => setLotSelectionItem(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className={`max-h-[60vh] overflow-y-auto space-y-2 pr-1 ${darkScrollbarClass}`} style={customScrollStyles}>
              {lotSelectionItem.lotes?.map(lote => (
                <button key={lote.id} onClick={() => handleSelectSpecificLot(lotSelectionItem, lote)} className="w-full text-left p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary hover:border-primary/50 transition-all flex flex-col gap-1.5 group">
                  <div className="flex justify-between items-start w-full">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-primary group-hover:underline">Cód Lote: {lote.codigo}</span>
                      {lote.nome_produto_lote && lote.nome_produto_lote !== lotSelectionItem.nome && (
                         <span className="text-xs font-semibold text-secondary-foreground mt-0.5">{lote.nome_produto_lote}</span>
                      )}
                      {lote.data_validade && (<span className="text-[11px] text-muted-foreground mt-0.5">Validade: <span className="font-medium text-foreground">{lote.data_validade.split('T')[0].split('-').reverse().join('/')}</span></span>)}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-bold text-primary">{fCurrency(lote.preco_venda_lote || lotSelectionItem.preco_venda)}</span>
                      <span className="text-xs font-mono font-bold bg-background px-2 py-1 rounded shadow-sm">Estoque: <span className={Number(lote.quantidade_atual) <= 0 ? 'text-red-500' : 'text-green-500'}>{lote.quantidade_atual || 0}</span></span>
                    </div>
                  </div>
                  {lote.observacao && (<div className="mt-1 p-2 bg-background/50 rounded border text-xs italic text-muted-foreground flex items-start gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" /><span>{lote.observacao}</span></div>)}
                </button>
               ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-border"><button onClick={() => setLotSelectionItem(null)} className="h-9 px-4 rounded-lg border text-sm font-medium hover:bg-secondary">Cancelar</button></div>
          </div>
        </div>
      )}

      {/* MODAL - FINALIZAR VENDA COM MÚLTIPLOS PAGAMENTOS */}
      {showFinalize && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" /> Finalizar Venda
              </h2>
              <button onClick={() => setShowFinalize(false)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex justify-between items-center">
              <span className="text-sm font-bold text-muted-foreground">Total a Pagar</span>
              <span className="text-xl font-black font-mono text-primary">{fCurrency(total)}</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-muted-foreground uppercase">Formas de Pagamento</label>
                <button
                  type="button"
                  onClick={addSplit}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                >
                  <PlusCircle className="h-3.5 w-3.5" /> Adicionar forma
                </button>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1" style={customScrollStyles}>
                {pagamentos.map((pgt, idx) => {
                  const formaNome = formas.find(f => f.id === pgt.forma_pagamento_id)?.nome.toLowerCase() || '';
                  const isDinheiro = formaNome.includes('dinheiro');

                  return (
                    <div key={pgt.splitId} className="p-3 rounded-lg border border-border bg-secondary/40 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                          #{idx + 1}
                        </span>
                        <select
                          value={pgt.forma_pagamento_id}
                          onChange={(e) => updateSplit(pgt.splitId, 'forma_pagamento_id', e.target.value)}
                          className="flex-1 h-9 px-2 rounded-lg border border-input bg-secondary text-sm"
                        >
                          <option value="">Selecione...</option>
                          {formas.map(f => <option key={f.id} value={f.id}>{f.nome.toUpperCase()}</option>)}
                        </select>
                        {pagamentos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSplit(pgt.splitId)}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase ml-1">Valor:</span>
                        <input
                          type="number"
                          value={pgt.valor || ''}
                          onChange={(e) => updateSplit(pgt.splitId, 'valor', Number(e.target.value))}
                          placeholder="0,00"
                          className="flex-1 h-8 bg-background border border-border rounded-lg px-3 font-mono text-sm"
                        />
                        {pagamentos.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const outrosSplits = pagamentos.filter(p => p.splitId !== pgt.splitId);
                              const somaOutros = outrosSplits.reduce((s, p) => s + (Number(p.valor) || 0), 0);
                              updateSplit(pgt.splitId, 'valor', Math.max(0, total - somaOutros));
                            }}
                            className="text-[9px] font-bold text-primary border border-primary/30 rounded px-1.5 py-1 hover:bg-primary/10 whitespace-nowrap"
                          >
                            Restante
                          </button>
                        )}
                      </div>

                      {isDinheiro && pgt.valor > 0 && troco > 0 && (
                        <div className="flex justify-between items-center px-1 pt-1 border-t border-border/50">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Troco</span>
                          <span className="text-sm font-black font-mono text-green-500">{fCurrency(troco)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={`flex justify-between items-center p-2 rounded-lg text-xs font-bold ${Math.abs(restantePagamento) < 0.01 ? 'bg-green-500/10 text-green-600 border border-green-500/20' : restantePagamento > 0 ? 'bg-yellow-500/10 text-yellow-600 border border-yellow-500/20' : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'}`}>
                <span>
                  {Math.abs(restantePagamento) < 0.01 
                    ? '✓ Pagamento coberto' 
                    : restantePagamento > 0 
                      ? `⚠ Falta cobrir: ${fCurrency(restantePagamento)}` 
                      : `Troco: ${fCurrency(Math.abs(restantePagamento))}`
                  }
                </span>
                <span className="font-mono">{fCurrency(totalPagamentos)} / {fCurrency(total)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button onClick={() => setShowFinalize(false)} className="h-10 px-4 rounded-lg border text-sm font-medium hover:bg-secondary">
                Cancelar
              </button>
              <button
                 onClick={finalizeSale}
                disabled={saving || pagamentos.some(p => !p.forma_pagamento_id) || totalPagamentos < total - 0.01}
                className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? 'Processando...' : <><Check className="h-4 w-4" /> Confirmar Venda</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL - SUCESSO */}
      {showSuccess && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-xl bg-card border border-primary p-8 text-center shadow-xl animate-in zoom-in-95">
            <Check className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="font-bold text-lg">Venda finalizada com sucesso!</p>
          </div>
        </div>
      )}
    </div>
  );
}
