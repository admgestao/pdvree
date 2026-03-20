import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, Percent, DollarSign,
  FileText, X, Check, AlertCircle, Info, Save, List, Eye, Calendar, ArrowLeft, Printer
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CartItem {
  id: string;
  nome: string;
  codigo: string;
  price: number;
  preco_custo: number;
  quantity: number;
  stock: number;
  discount: number;
  discountType: 'percent' | 'fixed';
}

interface Produto {
  id: string;
  nome: string;
  codigo: string;
  preco_venda: number;
  preco_custo: number;
  estoque_atual: number;
  categoria: string;
}

interface Pessoa {
  id: string;
  nome: string;
  credito: number;
  limite_compra: number;
  limite_usado: number;
  observacoes?: string;
}

interface OrcamentoSalvo {
  id: string;
  created_at: string;
  cliente_nome_manual: string | null;
  total: number;
  status: string;
  pessoas: { nome: string } | { nome: string }[] | null;
  observacao: string;
  // Detalhes extras para o modal
  subtotal?: number;
  desconto?: number;
  custo_adicional?: number;
  desc_custo_adicional?: string;
  valor_credito_usado?: number;
}

interface ItemDetalhe {
  id: string;
  produto_nome: string;
  quantidade: number;
  preco: number;
  total: number;
}

export default function Orcamentos() {
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
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [promocoes, setPromocoes] = useState<Record<string, number>>({});
  const [usarCredito, setUsarCredito] = useState(false);

  // Estados para Visualização e Detalhes
  const [viewMode, setViewMode] = useState(false);
  const [orcamentosSalvos, setOrcamentosSalvos] = useState<OrcamentoSalvo[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [orcamentoSelecionado, setOrcamentoSelecionado] = useState<OrcamentoSalvo | null>(null);
  const [itensSelecionados, setItensSelecionados] = useState<ItemDetalhe[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);

  const darkScrollbarClass = "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overflow-y-auto";
  const customScrollStyles = {
    scrollbarWidth: 'thin',
    scrollbarColor: '#3f3f46 transparent',
  } as React.CSSProperties;

  const fCurrency = (v: number) => v.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 2 
  });

  useEffect(() => {
    loadClientes();
    loadPromocoes();
  }, []);

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

  async function loadOrcamentosSalvos() {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('orcamentos')
        .select(`
          id, created_at, cliente_nome_manual, total, status, observacao,
          subtotal, desconto, custo_adicional, desc_custo_adicional, valor_credito_usado,
          pessoas ( nome )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrcamentosSalvos((data as any) || []);
      setViewMode(true);
    } catch (err: any) {
      toast.error("Erro ao carregar orçamentos: " + err.message);
    } finally {
      setLoadingList(false);
    }
  }

  async function verDetalhes(orc: OrcamentoSalvo) {
    setOrcamentoSelecionado(orc);
    setLoadingItens(true);
    try {
      const { data, error } = await supabase
        .from('orcamentos_itens')
        .select('*')
        .eq('orcamento_id', orc.id);

      if (error) throw error;
      setItensSelecionados(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar itens: " + err.message);
    } finally {
      setLoadingItens(false);
    }
  }

  // Função para excluir orçamento
  async function excluirOrcamento(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir este orçamento?')) return;
    
    try {
      // Deleta primeiro os itens vinculados
      await supabase.from('orcamentos_itens').delete().eq('orcamento_id', id);
      // Deleta o orçamento principal
      const { error } = await supabase.from('orcamentos').delete().eq('id', id);
      
      if (error) throw error;
      
      toast.success('Orçamento excluído com sucesso!');
      setOrcamentoSelecionado(null);
      loadOrcamentosSalvos(); // Recarrega a lista
    } catch (err: any) {
      toast.error('Erro ao excluir orçamento: ' + err.message);
    }
  }

  // Função para imprimir
  function imprimirOrcamento() {
    window.print();
  }

  const searchProducts = useCallback(async (term: string) => {
    const query = term.trim();
    if (!query) { setProdutos([]); setShowResults(false); return; }
    try {
      const { data, error } = await supabase.from('produtos').select('*')
        .or(`nome.ilike.%${query}%,codigo.ilike.%${query}%,categoria.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      setProdutos((data || []).map(p => ({
        id: p.id, nome: p.nome, codigo: p.codigo || '',
        preco_venda: Number(p.preco_venda) || 0,
        preco_custo: Number(p.preco_custo) || 0,
        estoque_atual: Number(p.estoque_atual) || 0,
        categoria: p.categoria || ''
      })));
      setShowResults(true);
    } catch (error) { toast.error("Erro ao buscar produtos"); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { searchProducts(search); }, 300);
    return () => clearTimeout(timer);
  }, [search, searchProducts]);

  const addToCart = (product: Produto) => {
    const price = promocoes[product.id] || product.preco_venda;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: product.id, nome: product.nome, codigo: product.codigo,
        price, preco_custo: product.preco_custo, quantity: 1, stock: product.estoque_atual,
        discount: 0, discountType: 'percent' as const,
      }];
    });
    setSearch('');
    setShowResults(false);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const newQty = Math.max(1, i.quantity + delta);
      return { ...i, quantity: newQty };
    }));
  };

  const updateItemDiscount = (id: string, value: number, type: 'percent' | 'fixed') => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, discount: value, discountType: type } : i));
  };

  const removeItem = (id: string) => { setCart((prev) => prev.filter((i) => i.id !== id)); };

  const getItemTotal = (item: CartItem) => {
    const base = item.price * item.quantity;
    if (item.discount <= 0) return base;
    if (item.discountType === 'percent') return base * (1 - item.discount / 100);
    return Math.max(0, base - item.discount);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalItensComDescontoIndividual = cart.reduce((sum, item) => sum + getItemTotal(item), 0);
  const totalCustoItens = cart.reduce((sum, item) => sum + (item.preco_custo * item.quantity), 0);
  const descontoGeralVal = descontoGeralTipo === 'percent' ? totalItensComDescontoIndividual * (descontoGeral / 100) : descontoGeral;
  const totalBruto = Math.max(0, totalItensComDescontoIndividual - descontoGeralVal + (Number(custoAdicional) || 0));
  
  const creditoDisponivel = clienteObj?.credito || 0;
  const valorAbatidoCredito = usarCredito ? Math.min(totalBruto, creditoDisponivel) : 0;
  const total = totalBruto - valorAbatidoCredito;
  const lucroLiquido = (totalItensComDescontoIndividual - descontoGeralVal) - totalCustoItens + (custoNoLucro ? Number(custoAdicional) : 0);

  function selectCliente(id: string) {
    const c = clientes.find(x => x.id === id);
    if (c) {
      setClienteObj(c); setClienteManual(''); setUsarCredito(false);
    } else {
      setClienteObj(null);
    }
  }

  async function saveOrcamento() {
    if (cart.length === 0) return toast.error('Adicione itens ao orçamento');
    setSaving(true);
    try {
      const { data: orcamento, error: orcErr } = await supabase.from('orcamentos').insert({
        cliente_id: clienteObj?.id || null,
        cliente_nome_manual: clienteObj ? null : clienteManual,
        usuario_id: user?.id || 'Operador',
        subtotal: totalItensComDescontoIndividual, 
        desconto: descontoGeralVal, 
        custo_adicional: custoAdicional,
        desc_custo_adicional: descCusto, 
        custo_no_lucro: custoNoLucro,
        total, 
        total_custo: totalCustoItens, 
        lucro_liquido: lucroLiquido,
        valor_credito_usado: valorAbatidoCredito, 
        observacao,
        status: 'pendente'
      }).select('id').single();

      if (orcErr) throw orcErr;

      const itensParaSalvar = cart.map(item => ({
        orcamento_id: orcamento.id,
        produto_id: item.id,
        produto_nome: item.nome,
        quantidade: item.quantity,
        preco: item.price,
        desconto_item: item.discount,
        desconto_tipo_item: item.discountType,
        total: getItemTotal(item)
      }));

      const { error: itensErr } = await supabase.from('orcamentos_itens').insert(itensParaSalvar);
      if (itensErr) throw itensErr;

      setShowSuccess(true);
      setTimeout(() => { window.location.reload(); }, 2000);
    } catch (err: any) { 
      toast.error('Erro ao salvar orçamento: ' + err.message); 
    }
    setSaving(false);
  }

  // Extrai o nome do usuário logado para exibição
  const nomeUsuarioLogado = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuário';

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col lg:flex-row animate-fade-in bg-background text-foreground relative">
      
      {/* Estilos para impressão isolada do modal */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            margin: 0;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* MODAL DE DETALHES DO ORÇAMENTO */}
      {orcamentoSelecionado && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] print-section">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Detalhes do Orçamento</h3>
                <p className="text-xs text-muted-foreground uppercase font-mono">{orcamentoSelecionado.id.split('-')[0]}</p>
              </div>
              <button onClick={() => setOrcamentoSelecionado(null)} className="p-2 hover:bg-secondary rounded-full transition-colors no-print">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className={`flex-1 p-6 ${darkScrollbarClass}`} style={customScrollStyles}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Cliente</p>
                  <p className="text-sm font-medium">
                    {Array.isArray(orcamentoSelecionado.pessoas) ? orcamentoSelecionado.pessoas[0]?.nome : orcamentoSelecionado.pessoas?.nome || orcamentoSelecionado.cliente_nome_manual || 'Não informado'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Data</p>
                  <p className="text-sm font-medium">{new Date(orcamentoSelecionado.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase font-bold border-b border-border pb-1">Itens do Orçamento</p>
                {loadingItens ? (
                  <div className="py-10 text-center text-sm animate-pulse">Carregando itens...</div>
                ) : (
                  itensSelecionados.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-sm py-1 border-b border-border/50 last:border-0">
                      <div>
                        <span className="font-medium">{item.quantidade}x</span> {item.produto_nome}
                        <p className="text-[10px] text-muted-foreground">Unit: {fCurrency(item.preco)}</p>
                      </div>
                      <span className="font-mono font-bold">{fCurrency(item.total)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-8 p-4 rounded-xl bg-secondary/30 space-y-2">
                <div className="flex justify-between text-xs">
                  <span>Subtotal</span>
                  <span className="font-mono">{fCurrency(orcamentoSelecionado.subtotal || 0)}</span>
                </div>
                {orcamentoSelecionado.desconto! > 0 && (
                  <div className="flex justify-between text-xs text-red-500 font-medium">
                    <span>Desconto</span>
                    <span className="font-mono">-{fCurrency(orcamentoSelecionado.desconto || 0)}</span>
                  </div>
                )}
                {orcamentoSelecionado.custo_adicional! > 0 && (
                  <div className="flex justify-between text-xs text-blue-500 font-medium">
                    <span>{orcamentoSelecionado.desc_custo_adicional || 'Custo Adicional'}</span>
                    <span className="font-mono">+{fCurrency(orcamentoSelecionado.custo_adicional || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
                  <span>TOTAL FINAL</span>
                  <span className="font-mono text-primary text-lg">{fCurrency(orcamentoSelecionado.total)}</span>
                </div>
              </div>

              {orcamentoSelecionado.observacao && (
                <div className="mt-4 p-3 border border-border rounded-lg text-xs italic text-muted-foreground">
                  <strong>Obs:</strong> {orcamentoSelecionado.observacao}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-card/50 flex justify-end gap-3 no-print">
               <button 
                 onClick={() => excluirOrcamento(orcamentoSelecionado.id)} 
                 className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors mr-auto flex items-center gap-2"
               >
                 <Trash2 className="h-4 w-4" /> Excluir
               </button>
               <button onClick={() => setOrcamentoSelecionado(null)} className="px-4 py-2 text-sm font-medium hover:bg-secondary rounded-lg transition-colors">Fechar</button>
               <button onClick={imprimirOrcamento} className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg hover:opacity-90 flex items-center gap-2">
                 <Printer className="h-4 w-4" /> Imprimir
               </button>
            </div>
          </div>
        </div>
      )}

      {/* TELA DE LISTAGEM (VIEW MODE) */}
      {viewMode && (
        <div className="absolute inset-0 z-[60] bg-background flex flex-col animate-in slide-in-from-bottom-4">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card">
            <div className="flex items-center gap-3">
              <button onClick={() => setViewMode(false)} className="p-2 hover:bg-secondary rounded-full transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-bold">Orçamentos Salvos</h2>
            </div>
            <div className="text-sm text-muted-foreground">{orcamentosSalvos.length} registros encontrados</div>
          </div>

          <div className={`flex-1 p-4 ${darkScrollbarClass}`} style={customScrollStyles}>
            <div className="max-w-5xl mx-auto grid gap-3">
              {orcamentosSalvos.map((orc) => {
                const nomeCliente = Array.isArray(orc.pessoas) 
                  ? orc.pessoas[0]?.nome 
                  : orc.pessoas?.nome;

                return (
                  <div key={orc.id} className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-all flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{nomeCliente || orc.cliente_nome_manual || 'Cliente não identificado'}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground uppercase">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(orc.created_at).toLocaleDateString('pt-BR')}</span>
                          <span className={`px-2 py-0.5 rounded-full ${orc.status === 'pendente' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-green-500/10 text-green-600'}`}>
                            {orc.status === 'pendente' ? nomeUsuarioLogado : orc.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Total</p>
                        <p className="font-mono font-bold text-primary">{fCurrency(orc.total)}</p>
                      </div>
                      <button 
                        onClick={() => verDetalhes(orc)}
                        className="p-2 bg-secondary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {orcamentosSalvos.length === 0 && (
                <div className="text-center py-20 text-muted-foreground opacity-50">
                   <List className="h-12 w-12 mx-auto mb-4" />
                   <p>Nenhum orçamento encontrado.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TELA PRINCIPAL DE CRIAÇÃO */}
      <div className="flex-1 flex flex-col border-r border-border min-w-0">
        <div className="p-3 border-b border-border flex items-center justify-between bg-card/50">
          <div className="flex items-center gap-2">
             <FileText className="text-primary h-5 w-5" />
             <h1 className="text-lg font-bold">Orçamentos</h1>
          </div>
          <div className="flex items-center gap-3 flex-1 justify-end px-4">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => search.trim().length > 0 && setShowResults(true)}
                placeholder="Buscar produto..."
                className="w-full h-9 pl-9 pr-4 rounded-lg border border-input bg-secondary text-sm focus:outline-none" />
              
              {showResults && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-xl z-50 max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-zinc-800">
                  {produtos.map((p) => (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 text-left border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium">{p.nome}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">{p.categoria} • Estoque: {p.estoque_atual}</p>
                      </div>
                      <span className="text-sm font-mono font-semibold text-primary">{fCurrency(p.preco_venda)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button 
              onClick={loadOrcamentosSalvos}
              className="h-9 px-3 rounded-lg border border-green-600/50 text-green-600 text-[11px] font-bold hover:bg-green-600 hover:text-white flex items-center gap-2 transition-all uppercase whitespace-nowrap"
            >
              <List className="h-3.5 w-3.5" /> {loadingList ? '...' : 'Salvos'}
            </button>
          </div>
        </div>

        {clienteObj?.observacoes && (
          <div className="mx-3 mt-2 p-2 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-600 text-[11px] font-bold animate-pulse flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" /> ATENÇÃO: {clienteObj.observacoes}
          </div>
        )}

        <div className={`flex-1 p-3 space-y-2 ${darkScrollbarClass}`} style={customScrollStyles}>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20">
              <FileText className="h-12 w-12 mb-3" />
              <p>Nenhum item adicionado ao orçamento</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-green-600">{fCurrency(item.price)}</span>
                        <span className="text-[10px] px-2 py-0.5 bg-secondary rounded-full text-muted-foreground">Estoque: {item.stock}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 border-r border-border pr-3">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Desc. Item</span>
                        <input type="number" value={item.discount || ''} 
                         onChange={(e) => updateItemDiscount(item.id, Number(e.target.value), item.discountType)}
                         className="w-12 h-7 bg-secondary border border-border rounded text-[11px] px-1 font-mono" />
                        <select value={item.discountType} 
                         onChange={(e) => updateItemDiscount(item.id, item.discount, e.target.value as any)}
                         className="h-7 bg-secondary border border-border rounded text-[10px] px-0.5">
                         <option value="percent">%</option>
                         <option value="fixed">R$</option>
                        </select>
                    </div>
                    <div className="flex items-center rounded-lg border border-border bg-secondary">
                      <button onClick={() => updateQty(item.id, -1)} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-l-lg"><Minus className="h-3 w-3" /></button>
                      <span className="h-8 w-8 flex items-center justify-center text-sm font-mono border-x border-border">{item.quantity}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="h-8 w-8 flex items-center justify-center hover:bg-background rounded-r-lg"><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="text-sm font-mono font-bold w-28 text-right">{fCurrency(getItemTotal(item))}</span>
                    <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`w-full lg:w-80 xl:w-96 flex flex-col border-t lg:border-t-0 border-border bg-card/30 ${darkScrollbarClass}`} style={customScrollStyles}>
        <div className="flex-1 p-4 space-y-4">
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
                    {usarCredito ? '✓ CRÉDITO APLICADO' : 'USAR CRÉDITO NO ORÇAMENTO?'}
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
              <input type="text" value={descCusto} onChange={(e) => setDescCusto(e.target.value)} placeholder="Ex: Frete / Instalação" className="w-full h-8 px-3 rounded-lg border border-input bg-secondary/40 text-xs" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5"><FileText className="h-3 w-3" /> Observação</label>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Validade, termos, etc..." rows={2} className="w-full px-3 py-2 rounded-lg border border-input bg-secondary text-sm resize-none" />
          </div>
        </div>

        <div className="border-t border-border p-4 space-y-3 bg-card/80 backdrop-blur-sm">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal Itens</span>
              <span className="font-mono">{fCurrency(totalItensComDescontoIndividual)}</span>
            </div>
            {descontoGeralVal > 0 && (
              <div className="flex justify-between text-red-500 font-medium">
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
                <span>Abatimento Crédito</span>
                <span className="font-mono">-{fCurrency(valorAbatidoCredito)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-base font-bold">Total do Orçamento</span>
            <span className="text-xl font-bold font-mono text-primary">{fCurrency(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setCart([]); setCustoAdicional(0); setDescCusto(''); setUsarCredito(false); }} className="h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary flex items-center justify-center gap-1.5"><X className="h-3.5 w-3.5" /> Limpar</button>
            <button disabled={cart.length === 0 || saving} onClick={saveOrcamento} className="h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-1.5">
                <Save className="h-3.5 w-3.5" /> Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}