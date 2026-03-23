import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, Percent, DollarSign,
  FileText, CreditCard, X, Check, AlertCircle, Wallet, Info, UserCircle,
  Lock, Unlock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CartItem {
  cartItemId: string; 
  id: string; 
  nome: string;
  codigo: string;
  price: number;
  preco_custo: number;
  quantity: number;
  stock: number;
  discount: number;
  discountType: 'percent' | 'fixed';
  lote_id?: string;
  lote_codigo?: string;
}

interface Produto {
  id: string;
  nome: string;
  codigo: string;
  preco_venda: number;
  preco_custo: number;
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

interface FormaPagamento {
  id: string;
  nome: string;
}

interface Usuario {
  id: string;
  nome_usuario: string;
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
  const [formaPagamentoId, setFormaPagamentoId] = useState('');
  const [showFinalize, setShowFinalize] = useState(false);
  const [valorRecebido, setValorRecebido] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promocoes, setPromocoes] = useState<Record<string, number>>({});
  const [usarCredito, setUsarCredito] = useState(false);

  const [vendedores, setVendedores] = useState<Usuario[]>([]);
  const [vendedorId, setVendedorId] = useState(() => {
    return localStorage.getItem('@pdv:vendedor_id') || '';
  });
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [caixaAberto, setCaixaAberto] = useState(false);

  const darkScrollbarClass = "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overflow-y-auto";
  const customScrollStyles = {
    scrollbarWidth: 'thin',
    scrollbarColor: '#3f3f46 transparent',
  } as React.CSSProperties;

  const fCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    loadCaixaStatus();
    loadFormas();
    loadClientes();
    loadPromocoes();
    loadVendedores();
  }, []);

  async function loadCaixaStatus() {
    try {
      const hoje = new Date().toLocaleDateString('en-CA');
      const { data } = await supabase
        .from('caixa_movimentos')
        .select('tipo')
        .gte('criado_em', `${hoje}T00:00:00`)
        .lte('criado_em', `${hoje}T23:59:59`)
        .order('criado_em', { ascending: false });

      if (data && data.length > 0) {
        const ultimoMovimento = data[0];
        setCaixaAberto(ultimoMovimento.tipo === 'abertura');
      } else {
        setCaixaAberto(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingInitial(false);
    }
  }

  async function handleQuickAbertura() {
    const valor = prompt("Informe o valor de abertura (Fundo de Reserva):", "0.00");
    if (valor !== null) {
      const { error } = await supabase.from('caixa_movimentos').insert({
        tipo: 'abertura',
        valor: Number(valor),
        descricao: 'Abertura rápida via PDV',
        usuario_id: user?.name || 'Sistema'
      });
      if (error) return toast.error('Erro ao abrir caixa: ' + error.message);
      toast.success('Caixa aberto com sucesso!');
      loadCaixaStatus();
    }
  }

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
    const { data } = await supabase.from('promocoes').select('produto_id, preco_promocional')
      .lte('data_inicio', today).gte('data_fim', today);
    const map: Record<string, number> = {};
    (data || []).forEach(p => { map[p.produto_id] = Number(p.preco_promocional); });
    setPromocoes(map);
  }

  const searchProducts = useCallback(async (term: string) => {
    const query = term.trim();
    if (!query) { setProdutos([]); setShowResults(false); return; }
    try {
      const { data: pData } = await supabase.from('produtos').select('*')
        .or(`nome.ilike.%${query}%,codigo.ilike.%${query}%,categoria.ilike.%${query}%`)
        .limit(10);
      
      const { data: lData } = await supabase.from('produto_lotes')
        .select('*, produtos(*)')
        .ilike('codigo_barras', `%${query}%`)
        .limit(5);

      let combined: Produto[] = (pData || []).map(p => ({
        id: p.id, nome: p.nome, codigo: p.codigo || '',
        preco_venda: Number(p.preco_venda) || 0,
        preco_custo: Number(p.preco_custo) || 0,
        estoque_atual: Number(p.estoque_atual) || 0,
        categoria: p.categoria || ''
      }));

      if (lData) {
        lData.forEach(lote => {
          if (lote.produtos && !combined.find(p => p.id === lote.produtos.id && p.lote_id === lote.id)) {
            combined.push({
              id: lote.produtos.id,
              nome: lote.produtos.nome, // Removido o sufixo (LOTE: ...)
              codigo: lote.produtos.codigo || '',
              preco_venda: Number(lote.produtos.preco_venda) || 0,
              preco_custo: Number(lote.produtos.preco_custo) || 0,
              estoque_atual: Number(lote.produtos.estoque_atual) || 0,
              categoria: lote.produtos.categoria || '',
              lote_id: lote.id,
              lote_codigo: lote.codigo_barras
            });
          }
        });
      }

      setProdutos(combined);
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

    let { data: prod } = await supabase.from('produtos').select('*').eq('codigo', query).eq('ativo', true).maybeSingle();
    let loteId = undefined;
    let loteCodigo = undefined;

    if (!prod) {
      const { data: lote } = await supabase.from('produto_lotes').select('*, produtos(*)').eq('codigo_barras', query).maybeSingle();
      if (lote && lote.produtos) {
        prod = lote.produtos;
        loteId = lote.id;
        loteCodigo = lote.codigo_barras;
      }
    }

    if (prod) {
      addToCart({
        id: prod.id, 
        nome: prod.nome, // Removido o sufixo (LOTE: ...)
        codigo: prod.codigo || '',
        preco_venda: Number(prod.preco_venda) || 0,
        preco_custo: Number(prod.preco_custo) || 0,
        estoque_atual: Number(prod.estoque_atual) || 0,
        categoria: prod.categoria || '',
        lote_id: loteId,
        lote_codigo: loteCodigo
      });
    } else {
      toast.error('Produto ou Lote não encontrado');
    }
  };

  const addToCart = (product: Produto) => {
    if (product.estoque_atual <= 0) { 
      toast.error('Produto sem estoque disponível');
      return; 
    }
    
    const price = promocoes[product.id] || product.preco_venda;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id && i.lote_id === product.lote_id);
      if (existing) {
        if (existing.quantity >= product.estoque_atual) { 
          toast.error('Limite de estoque atingido'); 
          return prev; 
        }
        return prev.map((i) => i.cartItemId === existing.cartItemId ? { ...i, quantity: i.quantity + 1 } : i);
      }
 
      return [...prev, {
        cartItemId: crypto.randomUUID(), 
        id: product.id, 
        nome: product.nome, 
        codigo: product.codigo,
        price, 
        preco_custo: product.preco_custo, 
        quantity: 1, 
        stock: product.estoque_atual,
        discount: 0, 
        discountType: 'percent' as const,
        lote_id: product.lote_id,
        lote_codigo: product.lote_codigo
      }];
    });
    setSearch('');
    setShowResults(false);
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

  const getItemTotal = (item: CartItem) => {
    const base = item.price * item.quantity;
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
  const troco = valorRecebido > total ? valorRecebido - total : 0;
  const lucroLiquido = (totalItensComDescontoIndividual - descontoGeralVal) - totalCustoItens + (custoNoLucro ? Number(custoAdicional) : 0);

  function selectCliente(id: string) {
    const c = clientes.find(x => x.id === id);
    if (c) {
      setClienteObj(c); setClienteManual(''); setUsarCredito(false);
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
    if (!formaPagamentoId) { toast.error('Selecione a forma de pagamento'); return; }
    if (!vendedorId) { toast.error('Selecione o Vendedor(a) antes de finalizar!'); return; }

    setSaving(true);
    try {
      const selectedVendedor = vendedores.find(v => v.id === vendedorId);
      const { data: venda, error: vendaErr } = await supabase.from('vendas').insert({
        cliente_id: clienteObj?.id || null,
        cliente_nome_manual: clienteObj ? null : clienteManual,
        usuario_id: user?.id || 'Operador',
        vendedor_nome: selectedVendedor?.nome_usuario || 'Não Informado',
        subtotal: subtotalSemDesconto, 
        desconto: totalDescontoAplicado, 
        custo_adicional: Number(custoAdicional) || 0,
        desc_custo_adicional: descCusto, 
        custo_no_lucro: custoNoLucro,
        total: total, 
        total_custo: totalCustoItens, 
        lucro_liquido: lucroLiquido,
        valor_credito_usado: valorAbatidoCredito, 
        forma_pagamento_id: formaPagamentoId,
        troco, 
        observacao,
      }).select('id').single();

      if (vendaErr) throw vendaErr;

      const itensParaSalvar = cart.map(item => ({
        venda_id: venda.id,
        produto_id: item.id,
        produto_nome: item.nome,
        quantidade: item.quantity,
        preco: item.price,
        desconto_item: item.discount,
        desconto_tipo_item: item.discountType,
        total: getItemTotal(item)
      }));
      const { error: itensErr } = await supabase.from('vendas_itens').insert(itensParaSalvar);
      if (itensErr) throw itensErr;

      for (const item of cart) {
        await supabase.from('produtos').update({ estoque_atual: item.stock - item.quantity }).eq('id', item.id);
        if (item.lote_id) {
          const { data: lote } = await supabase.from('produto_lotes').select('quantidade_atual, quantidade').eq('id', item.lote_id).single();
          if (lote) {
             const qtdAtualLote = Number(lote.quantidade_atual || lote.quantidade || 0);
             const novaQtd = qtdAtualLote - item.quantity;
             const novoStatus = novaQtd <= 0 ? 'esgotado' : 'ativo';
             await supabase.from('produto_lotes').update({
               quantidade_atual: novaQtd,
               quantidade: novaQtd, 
               status: novoStatus
             }).eq('id', item.lote_id);
          }
        }
      }

      if (valorAbatidoCredito > 0 && clienteObj) {
        await supabase.from('pessoas').update({ credito: clienteObj.credito - valorAbatidoCredito }).eq('id', clienteObj.id);
      }

      const formaNome = formas.find(f => f.id === formaPagamentoId)?.nome.toLowerCase() || '';
      if (formaNome.includes('dinheiro')) {
        await supabase.from('caixa_movimentos').insert({
          usuario_id: user?.name || user?.id || 'Sistema',
          tipo: 'entrada',
          valor: total,
          descricao: 'Venda realizada.'
        });
      }

      setShowSuccess(true);
      setShowFinalize(false);
      setTimeout(() => { window.location.reload(); }, 2000);
    } catch (err: any) { 
      toast.error('Erro ao finalizar: ' + err.message);
    }
    setSaving(false);
  }

  if (loadingInitial) {
    return <div className="h-screen flex items-center justify-center bg-background italic font-medium">Verificando caixa...</div>;
  }

  if (!caixaAberto) {
    return (
      <div className="h-[calc(100vh-3rem)] flex items-center justify-center bg-background p-4 animate-in fade-in duration-500">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="inline-flex p-6 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
            <Lock className="h-16 w-16 text-red-500 animate-bounce" />
          </div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-foreground">Vendas Bloqueadas</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            O terminal de vendas está desativado pois o caixa do dia ainda não foi aberto ou já foi encerrado.
          </p>
          <div className="bg-card border border-border p-8 rounded-3xl shadow-2xl space-y-6">
             <div className="flex items-center justify-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Status: Caixa Fechado</span>
             </div>
             <button 
              onClick={handleQuickAbertura}
              className="w-full py-5 rounded-2xl bg-primary text-primary-foreground font-black uppercase text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform flex items-center justify-center gap-3"
            >
              <Unlock className="h-5 w-5" /> Abrir Caixa Agora
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col lg:flex-row animate-fade-in bg-background text-foreground">
      <style>{`
        @keyframes pulse-yellow {
          0%, 100% { background-color: rgba(234, 179, 8, 0.1); border-color: rgba(234, 179, 8, 0.5); }
          50% { background-color: rgba(234, 179, 8, 0.3); border-color: rgba(234, 179, 8, 1); }
        }
        .animate-pulse-yellow { animation: pulse-yellow 1.5s infinite; }
      `}</style>

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
            <input type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => search.trim().length > 0 && setShowResults(true)}
              placeholder="Buscar por nome, código ou código do lote (Bipar)..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-input bg-secondary text-sm focus:outline-none" />
            
            {showResults && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-50 max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-zinc-800">
                {produtos.map((p, idx) => (
                  <button key={p.id + '-' + idx} type="button" onClick={() => addToCart(p)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 text-left border-b border-border last:border-0 ${p.estoque_atual <= 0 ? 'bg-red-500/20 border-red-500/40' : ''}`}>
                    <div>
                      <p className={`text-sm font-bold ${p.estoque_atual <= 0 ? 'text-red-500 underline' : ''}`}>{p.nome}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {p.categoria} • {p.estoque_atual <= 0 ? <span className="text-red-600 font-black animate-pulse">⚠️ SEM ESTOQUE</span> : `Estoque: ${p.estoque_atual}`}
                      </p>
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
            cart.map((item) => (
              <div key={item.cartItemId} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.nome}</p>
                    <p className="text-[10px] text-muted-foreground">Estoque: {item.stock} • Unit: {fCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 border-r border-border pr-3">
                       <span className="text-[10px] font-bold text-muted-foreground uppercase">Desc. Item</span>
                       <input type="number" value={item.discount || ''} 
                        onChange={(e) => updateItemDiscount(item.cartItemId, Number(e.target.value), item.discountType)}
                        className="w-12 h-7 bg-secondary border border-border rounded text-[11px] px-1 font-mono" />
                       <select value={item.discountType} 
                        onChange={(e) => updateItemDiscount(item.cartItemId, item.discount, e.target.value as any)}
                        className="h-7 bg-secondary border border-border rounded text-[10px] px-0.5">
                        <option value="percent">%</option>
                        <option value="fixed">R$</option>
                    </select>
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-secondary">
                      <button type="button" onClick={() => updateQty(item.cartItemId, -1)} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-l-lg"><Minus className="h-3 w-3" /></button>
                      <span className="h-8 w-8 flex items-center justify-center text-sm font-mono border-x border-border">{item.quantity}</span>
                      <button type="button" onClick={() => updateQty(item.cartItemId, 1)} disabled={item.quantity >= item.stock} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-r-lg"><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="text-sm font-mono font-bold w-24 text-right">{fCurrency(getItemTotal(item))}</span>
                    <button type="button" onClick={() => removeItem(item.cartItemId)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
             ))
          )}
        </div>
      </div>

      <div className={`w-full lg:w-80 xl:w-96 flex flex-col border-t lg:border-t-0 border-border bg-card/30 ${darkScrollbarClass}`} style={customScrollStyles}>
        <div className="flex-1 p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-primary uppercase flex items-center gap-1.5">
              <UserCircle className="h-3.5 w-3.5" /> Vendedor(a) *
            </label>
            <select 
              value={vendedorId} 
              onChange={(e) => handleVendedorChange(e.target.value)}
              className={`w-full h-10 px-3 rounded-lg border text-sm font-bold transition-all duration-300 outline-none ${!vendedorId ? 'animate-pulse-yellow border-yellow-500 text-yellow-700' : 'bg-green-500/10 border-green-500 text-green-600'}`}
            >
              <option value="" className="bg-background text-foreground">-- SELECIONE O VENDEDOR --</option>
              {vendedores.map(v => (
                 <option key={v.id} value={v.id} className="bg-background text-foreground">
                  {v.nome_usuario.toUpperCase()}
                 </option>
              ))}
            </select>
          </div>

          {clienteObj && (
             <div className="p-3 rounded-xl border border-border bg-secondary/20 space-y-2 animate-in slide-in-from-right-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5"><User className="h-3 w-3" /> Status do Cliente</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-background border border-border">
                    <p className="text-muted-foreground">Crédito</p>
                    <p className="font-mono text-green-600 font-bold">{fCurrency(clienteObj.credito)}</p>
                  </div>
                  <div className="p-2 rounded bg-background border border-border">
                    <p className="text-muted-foreground">Limite</p>
                    <p className="font-mono text-primary font-bold">{fCurrency(clienteObj.limite_compra)}</p>
                  </div>
                </div>
                {clienteObj.credito > 0 && (
                  <button onClick={() => setUsarCredito(!usarCredito)} className={`w-full h-8 rounded-lg text-[10px] font-bold transition-all ${usarCredito ? 'bg-green-600 text-white shadow-lg' : 'bg-zinc-700 text-zinc-300'}`}>
                    {usarCredito ? '✓ CRÉDITO APLICADO' : 'USAR CRÉDITO NO PEDIDO?'}
                  </button>
                )}
             </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><User className="h-3 w-3" /> Cliente</label>
            <select value={clienteObj?.id || ''} onChange={(e) => selectCliente(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm">
              <option value="">-- Buscar no cadastro --</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {!clienteObj && <input type="text" value={clienteManual} onChange={(e) => setClienteManual(e.target.value)} placeholder="Nome manual..." className="w-full h-9 px-3 rounded-lg border border-input bg-secondary text-sm mt-2" />}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><Percent className="h-3 w-3" /> Desconto Geral</label>
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
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal Bruto</span>
              <span className="font-mono">{fCurrency(subtotalSemDesconto)}</span>
            </div>
            {descontoDosItens > 0 && (
              <div className="flex justify-between text-emerald-500 font-medium">
                <span>Descontos (Itens)</span>
                <span className="font-mono">-{fCurrency(descontoDosItens)}</span>
              </div>
            )}
            {descontoGeralVal > 0 && (
              <div className="flex justify-between text-emerald-500 font-medium">
                <span>Desconto Geral</span>
                <span className="font-mono">-{fCurrency(descontoGeralVal)}</span>
              </div>
            )}
            {custoAdicional > 0 && (
              <div className="flex justify-between text-blue-500 font-medium">
                <span className="italic">{descCusto || 'Custo Adicional'}</span>
                <span className="font-mono">+{fCurrency(Number(custoAdicional))}</span>
              </div>
            )}
            {valorAbatidoCredito > 0 && (
              <div className="flex justify-between text-green-600 font-bold">
                <span>Crédito Utilizado</span>
                <span className="font-mono">-{fCurrency(valorAbatidoCredito)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <div className="flex flex-col">
              <span className="text-base font-bold">Total Final</span>
              {totalDescontoAplicado > 0 && (
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">
                  Economia: {fCurrency(totalDescontoAplicado)}
                </span>
              )}
            </div>
           <span className="text-xl font-bold font-mono text-primary">{fCurrency(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setCart([]); setCustoAdicional(0); setDescCusto(''); setUsarCredito(false); setObservacao(''); }} className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary flex items-center justify-center gap-1.5"><X className="h-3.5 w-3.5" /> Limpar</button>
            <button 
              disabled={cart.length === 0} 
              onClick={() => {
                if(!vendedorId) return toast.error("Selecione o Vendedor(a)!");
                setShowFinalize(true);
              }} 
              className="h-10 rounded-lg text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 transition-all bg-primary hover:opacity-90">
              <CreditCard className="h-3.5 w-3.5" /> 
              Finalizar
            </button>
          </div>
        </div>
      </div>

      {showFinalize && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold">Finalizar Venda</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                 <label className="text-xs font-medium text-muted-foreground">Forma de Pagamento *</label>
                <select value={formaPagamentoId} onChange={(e) => setFormaPagamentoId(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-input bg-secondary text-sm">
                  <option value="">Selecione...</option>
                  {formas.map(f => <option key={f.id} value={f.id}>{f.nome.toUpperCase()}</option>)}
                </select>
              </div>

              {formas.find(f => f.id === formaPagamentoId)?.nome.toLowerCase().includes('dinheiro') && (
                <div className="space-y-2 p-3 bg-secondary rounded-lg border border-primary/20 animate-in zoom-in-95">
                  <label className="text-xs font-bold text-primary uppercase">Valor Recebido</label>
                  <input type="number" value={valorRecebido || ''} onChange={(e) => setValorRecebido(Number(e.target.value))} className="w-full h-10 bg-background border border-primary/30 rounded-lg px-3 font-mono font-bold text-lg" autoFocus placeholder="0,00" />
                  {valorRecebido > total && (
                    <div className="flex justify-between items-center pt-1 font-bold text-green-600">
                      <span className="text-[10px] uppercase">Troco</span>
                      <span className="text-sm font-mono">{fCurrency(troco)}</span>
                    </div>
                  )}
                </div>
               )}

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex justify-between text-sm font-bold">
                  <span>Total Final</span>
                  <span className="font-mono text-primary text-lg">{fCurrency(total)}</span>
                </div>
               </div>
             </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowFinalize(false)} className="h-10 px-4 rounded-lg border border-border text-sm font-medium">Cancelar</button>
              <button onClick={finalizeSale} disabled={saving} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20">{saving ? 'Processando...' : 'Confirmar Venda'}</button>
            </div>
          </div>
        </div>
      )}

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