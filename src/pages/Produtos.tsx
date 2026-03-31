import { useState, useEffect, useRef } from 'react';
import { Package, Plus, Search, Pencil, Trash2, X, Save, Camera, Printer, Filter, DollarSign, BarChart3, TrendingUp, Boxes, AlertTriangle, Calendar, ArrowRightLeft, History, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface Lote {
  id: string;
  produto_id: string;
  quantidade: number;
  custo: number;
  preco_venda?: number; // Campo adicionado para preço por lote
  data_entrada: string;
  data_validade: string;
  observacao: string;
  criado_em?: string;
  codigo_barras: string;
  quantidade_inicial: number;
  quantidade_atual: number;
  status: string;
}

interface Produto {
  id: string;
  nome: string;
  marca: string;
  codigo: string;
  categoria: string;
  fornecedor: string;
  unidade: string;
  custo: number;
  preco_venda: number;
  margem: number;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
  data_validade: string;
  data_entrada: string;
  observacao: string;
  criado_em: string;
  valor_estoque: number;
  lucro_estoque: number;
  lucro_produto: number;
  lotes?: Lote[];
}

const emptyProduct: Partial<Produto> = {
  nome: '', marca: '', codigo: '', unidade: 'Und', categoria: '', fornecedor: '',
  custo: 0, preco_venda: 0, margem: 0, estoque_atual: 0, estoque_minimo: 0,
  ativo: true, data_validade: '', data_entrada: new Date().toISOString().split('T')[0],
  observacao: '', valor_estoque: 0, lucro_estoque: 0, lucro_produto: 0,
};

const UNIDADES_PADRAO = ['Par', 'Und', 'Pç', 'Kg', 'Cm', 'Mt', 'm²', 'Lt', 'Cx'];

export default function Produtos() {
  const { user, isAdmin } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [search, setSearch] = useState('');
  
  // NOVO: Estados para autocomplete da busca
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  const [showLoteForm, setShowLoteForm] = useState(false);
  const [loteFormMode, setLoteFormMode] = useState<'new' | 'edit'>('new');
  const [loteEditId, setLoteEditId] = useState<string | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCodigoConflito, setShowCodigoConflito] = useState(false);
  const [codigoConflitoData, setCodigoConflitoData] = useState<{produto: Produto, lotes: any[]} | null>(null);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<Partial<Produto>>(emptyProduct);
  
  // NOVO: Estados para sistema de guias de lotes
  const [activeLoteTab, setActiveLoteTab] = useState<string>('base');
  const [loteTabsData, setLoteTabsData] = useState<Record<string, Partial<Produto>>>({});
  
  const [loteForm, setLoteForm] = useState({ 
    quantidade: 0, 
    custo: 0, 
    preco_venda: 0, // Campo adicionado
    data_entrada: new Date().toISOString().split('T')[0], 
    data_validade: '', 
    observacao: '',
    codigo_barras: ''
  });

  const [fornecedores, setFornecedores] = useState<{ nome: string }[]>([]);
  const [categoriasExistentes, setCategoriasExistentes] = useState<string[]>([]);
  const [unidadesExistentes, setUnidadesExistentes] = useState<string[]>(UNIDADES_PADRAO);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  const [scanMode, setScanMode] = useState<'produto' | 'lote' | null>(null);
  
  const [maxEstoqueFilter, setMaxEstoqueFilter] = useState<number>(999);
  const [filtroValidade, setFiltroValidade] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filtros Histórico
  const [historicoBusca, setHistoricoBusca] = useState('');
  const [historicoFiltroData, setHistoricoFiltroData] = useState('');
  const [historicoSortOption, setHistoricoSortOption] = useState<'registro_desc' | 'registro_asc' | 'validade_asc' | 'validade_desc' | 'saldo_desc' | 'saldo_asc'>('registro_desc');

  const [activeTab, setActiveTab] = useState<'todos' | 'estoque_baixo' | 'sem_estoque' | 'vencidos'>('todos');

  // NOVO: Fechar sugestões ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toUpperSafe(value: any): any {
    if (typeof value === 'string') return value.toUpperCase();
    return value;
  }

  useEffect(() => { 
    load();
    loadAuxiliarData();
  }, []);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (scanMode) {
      scanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.777778
      }, false);
      scanner.render((decodedText) => {
        if (scanMode === 'produto') {
          updateField('codigo', decodedText);
          verificarCodigo(decodedText);
        } else if (scanMode === 'lote') {
          setLoteForm(prev => ({ ...prev, codigo_barras: decodedText }));
          verificarCodigoLote(decodedText);
        }
        setScanMode(null);
        scanner?.clear();
        
        toast.success("Código lido com sucesso!");
      }, 
      (error) => {});
    }
    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Erro ao fechar scanner", err));
      }
    };
  }, [scanMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filtroValidade, maxEstoqueFilter, activeTab, filtroCategoria, sortOrder]);

  async function load() {
    setLoading(true);
    const { data: pData } = await supabase.from('produtos').select('*').order('nome');
    const { data: lData } = await supabase.from('produto_lotes').select('*');

    const produtosComLotes = (pData || []).map(p => {
      const lotesDoProduto = (lData || []).filter((l: any) => l.produto_id === p.id);
      
      if (lotesDoProduto.length > 0) {
        const loteMaisRecente = [...lotesDoProduto].sort((a, b) => {
          const dateA = new Date(a.data_entrada || '2000-01-01').getTime();
          const dateB = new Date(b.data_entrada || '2000-01-01').getTime();
          if (dateA === dateB) {
            const crA = new Date(a.criado_em || '2000-01-01').getTime();
            const crB = new Date(b.criado_em || '2000-01-01').getTime();
            return crB - crA;
          }
          return dateB - dateA;
        })[0];
        
        p.codigo = loteMaisRecente.codigo_barras || p.codigo;
        p.data_entrada = loteMaisRecente.data_entrada || p.data_entrada;
        p.data_validade = loteMaisRecente.data_validade || p.data_validade;
        p.custo = loteMaisRecente.custo;
      }
      
      return { ...p, lotes: lotesDoProduto };
    });

    setProdutos(produtosComLotes);
    
    if (editing) {
      const updatedEditing = produtosComLotes.find(p => p.id === editing.id);
      if (updatedEditing) setEditing(updatedEditing);
    }
    
    if (pData) {
      const cats = Array.from(new Set(pData.map(p => p.categoria).filter(Boolean)));
      setCategoriasExistentes(cats);
      
      const unids = Array.from(new Set(pData.map(p => p.unidade).filter(Boolean)));
      setUnidadesExistentes(Array.from(new Set([...UNIDADES_PADRAO, ...unids])));
    }
    setLoading(false);
  }

  async function loadAuxiliarData() {
    const { data: list } = await supabase
      .from('pessoas')
      .select('nome')
      .ilike('categoria', 'fornecedor')
      .order('nome');
    setFornecedores(list || []);
  }

  function getDaysDiff(dateStr: string) {
    if (!dateStr) return 999;
    const valDate = new Date(dateStr);
    valDate.setUTCHours(0,0,0,0);
    const today = new Date();
    today.setUTCHours(0,0,0,0);
    return Math.ceil((valDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  function getStatusValidade(p: Produto) {
    let qtd_vencida = 0;
    let qtd_proxima = 0;
    let dias_proximo = 999;

    const lotesQtd = p.lotes?.reduce((sum, l) => sum + Number(l.quantidade_atual || l.quantidade), 0) || 0;
    const baseQtd = Math.max(0, p.estoque_atual - lotesQtd);

    if (baseQtd > 0 && p.data_validade) {
      const diff = getDaysDiff(p.data_validade);
      if (diff < 0) qtd_vencida += baseQtd;
      else if (diff <= 30) {
        qtd_proxima += baseQtd;
        if (diff < dias_proximo) dias_proximo = diff;
      }
    }

    if (p.lotes) {
      p.lotes.forEach(l => {
        const qtdAtualLote = Number(l.quantidade_atual || l.quantidade);
        if (qtdAtualLote > 0 && l.data_validade) {
          const diff = getDaysDiff(l.data_validade);
          if (diff < 0) qtd_vencida += qtdAtualLote;
          else if (diff <= 30) {
            qtd_proxima += qtdAtualLote;
            if (diff < dias_proximo) dias_proximo = diff;
          }
        }
      });
    }

    if (qtd_vencida > 0) return { status: 'vencido', qtd: qtd_vencida };
    if (qtd_proxima > 0) return { status: 'proximo', qtd: qtd_proxima, dias: dias_proximo };
    return { status: 'ok', qtd: 0 };
  }

  // NOVO: Busca inteligente com sugestões
  const searchSuggestions = search.trim().length === 0 ? [] : produtos
    .filter((p) => {
      const term = search.toLowerCase();
      return (
        p.nome?.toLowerCase().includes(term) ||
        p.marca?.toLowerCase().includes(term) ||
        p.codigo?.toLowerCase().includes(term) ||
        p.categoria?.toLowerCase().includes(term)
      );
    })
    .slice(0, 8);

  const filtered = produtos.filter((p) => {
    const matchesSearch = 
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.marca?.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria?.toLowerCase().includes(search.toLowerCase());
    
    const matchesEstoque = p.estoque_atual <= maxEstoqueFilter;
    const matchesValidade = filtroValidade ? p.data_validade === filtroValidade : true;
    const matchesCategoria = filtroCategoria ? p.categoria === filtroCategoria : true;
    const statusValidade = getStatusValidade(p);

    let matchesTab = true;
    if (activeTab === 'estoque_baixo') matchesTab = p.estoque_atual > 0 && p.estoque_atual <= (p.estoque_minimo || 0);
    if (activeTab === 'sem_estoque') matchesTab = p.estoque_atual <= 0;
    if (activeTab === 'vencidos') matchesTab = statusValidade.status === 'vencido';

    return matchesSearch && matchesEstoque && matchesValidade && matchesTab && matchesCategoria;
  }).sort((a, b) => {
    const dateA = new Date(a.criado_em || a.data_entrada || '2000-01-01').getTime();
    const dateB = new Date(b.criado_em || b.data_entrada || '2000-01-01').getTime();
    if (dateA === dateB) return a.nome.localeCompare(b.nome);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedProdutos = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalProdutos = filtered.length;
  const valorTotalEstoqueCusto = filtered.reduce((acc, p) => acc + (Number(p.custo) * Number(p.estoque_atual)), 0);
  const valorTotalVendaPotencial = filtered.reduce((acc, p) => acc + (Number(p.preco_venda) * Number(p.estoque_atual)), 0);
  const lucroTotalProjetado = valorTotalVendaPotencial - valorTotalEstoqueCusto;

  function formatCurrency(value: number | string) {
    const amount = typeof value === 'string' ? parseFloat(value.replace(/[^\d]/g, '')) / 100 : value;
    if (isNaN(amount)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  }

  function parseCurrencyToNumber(value: string): number {
    const cleanValue = value.replace(/[^\d]/g, '');
    return cleanValue ? parseFloat(cleanValue) / 100 : 0;
  }

  function imprimirRelatorio() {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Relatório de Produtos</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f4f4f4; }
            .header { text-align: center; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Relatório de Estoque e Produtos</h2>
            <p>Data: ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código</th>
                <th>Marca</th>
                <th>Categoria</th>
                <th>Estoque</th>
                <th>Preço Custo</th>
                <th>Preço Venda</th>
                <th>Vl. Total Estoque</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(p => `
                <tr>
                  <td>${p.nome}</td>
                  <td>${p.codigo || '-'}</td>
                  <td>${p.marca || '-'}</td>
                  <td>${p.categoria || '-'}</td>
                  <td>${p.estoque_atual} ${p.unidade}</td>
                  <td>${formatCurrency(p.custo)}</td>
                  <td>${formatCurrency(p.preco_venda)}</td>
                  <td>${formatCurrency(p.custo * p.estoque_atual)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  function openNew() {
    setEditing(null);
    setForm({ ...emptyProduct });
    setActiveLoteTab('base');
    setLoteTabsData({});
    setShowForm(true);
  }

  // MODIFICADO: Função openEdit com suporte a guias de lotes
  function openEdit(p: Produto) {
    setEditing(p);
    setActiveLoteTab('base');
    
    // Inicializar dados das guias de lotes
    const tabsData: Record<string, Partial<Produto>> = {
      base: { ...p }
    };
    
    if (p.lotes && p.lotes.length > 0) {
      p.lotes.forEach(lote => {
        tabsData[lote.id] = {
          ...p,
          custo: lote.custo,
          preco_venda: lote.preco_venda || p.preco_venda,
          codigo: lote.codigo_barras,
          data_entrada: lote.data_entrada,
          data_validade: lote.data_validade,
          estoque_atual: lote.quantidade_atual || lote.quantidade,
          observacao: lote.observacao
        };
      });
    }
    
    setLoteTabsData(tabsData);
    setForm(tabsData.base);
    setShowForm(true);
  }

  // NOVO: Função para trocar entre guias de lotes
  function changeLoteTab(tabId: string) {
    setActiveLoteTab(tabId);
    if (loteTabsData[tabId]) {
      setForm(loteTabsData[tabId]);
    }
  }

  function abrirModalLote() {
    setLoteFormMode('new');
    setLoteEditId(null);
    setLoteForm({
      quantidade: 0,
      custo: 0,
      preco_venda: form.preco_venda || 0,
      data_entrada: new Date().toISOString().split('T')[0],
      data_validade: '',
      observacao: '',
      codigo_barras: form.codigo || (editing ? editing.codigo : '')
    });
    setShowForm(false);
    setShowLoteForm(true);
  }

  async function verificarCodigo(codigoStr: string) {
    if (!codigoStr || codigoStr.trim() === '') return;
    if (editing && editing.codigo === codigoStr) return;

    const { data: pData } = await supabase.from('produtos').select('*').eq('codigo', codigoStr);
    const { data: lData } = await supabase.from('produto_lotes').select('*').eq('codigo_barras', codigoStr);

    let prodIdEncontrado = pData?.[0]?.id || lData?.[0]?.produto_id;
    if (prodIdEncontrado) {
        if (editing && editing.id === prodIdEncontrado) return;
        const { data: fullProd } = await supabase.from('produtos').select('*').eq('id', prodIdEncontrado).single();
        const { data: fullLotes } = await supabase.from('produto_lotes').select('*').eq('produto_id', prodIdEncontrado).order('data_entrada', { ascending: false });
        if (fullProd) {
            const lotesFiltrados = (fullLotes || []).filter((l: any) => l.codigo_barras === codigoStr);
            setCodigoConflitoData({ produto: fullProd, lotes: lotesFiltrados });
            setShowCodigoConflito(true);
            setShowForm(false);
        }
    }
  }

  async function verificarCodigoLote(codigoStr: string) {
    if (!codigoStr || codigoStr.trim() === '') return;
    if (loteEditId) return;

    const { data: pData } = await supabase.from('produtos').select('*').eq('codigo', codigoStr);
    const { data: lData } = await supabase.from('produto_lotes').select('*').eq('codigo_barras', codigoStr);

    let prodIdEncontrado = pData?.[0]?.id || lData?.[0]?.produto_id;
    if (prodIdEncontrado) {
        if (editing && editing.id === prodIdEncontrado) {
            return;
        }

        const { data: fullProd } = await supabase.from('produtos').select('*').eq('id', prodIdEncontrado).single();
        const { data: fullLotes } = await supabase.from('produto_lotes').select('*').eq('produto_id', prodIdEncontrado).order('data_entrada', { ascending: false });
        if (fullProd) {
            const lotesFiltrados = (fullLotes || []).filter((l: any) => l.codigo_barras === codigoStr);
            setCodigoConflitoData({ produto: fullProd, lotes: lotesFiltrados });
            setShowCodigoConflito(true);
            setShowLoteForm(false);
        }
    }
  }

  async function enviarParaTrocasAvaria(p: Produto) {
    const stValidade = getStatusValidade(p);
    const qtdSugerida = stValidade.status === 'vencido' ? stValidade.qtd : 1;
    const qtdStr = prompt(`Quantidade de "${p.nome}" para dar baixa como avaria:`, String(qtdSugerida));
    if (!qtdStr) return;
    
    const qtdBaixa = Number(qtdStr);
    if (isNaN(qtdBaixa) || qtdBaixa <= 0 || qtdBaixa > p.estoque_atual) {
      toast.error("Quantidade inválida ou superior ao estoque atual.");
      return;
    }

    const lotesQtd = p.lotes?.reduce((sum, l) => sum + Number(l.quantidade_atual || l.quantidade), 0) || 0;
    const baseQtd = Math.max(0, p.estoque_atual - lotesQtd);

    const allSources = [
      { isBase: true, id: p.id, quantidade_atual: baseQtd, validade: p.data_validade },
      ...(p.lotes || []).map(l => ({ isBase: false, id: l.id, quantidade_atual: Number(l.quantidade_atual || l.quantidade), validade: l.data_validade }))
    ].sort((a, b) => new Date(a.validade || '2099-01-01').getTime() - new Date(b.validade || '2099-01-01').getTime());
    let remainingToDeduct = qtdBaixa;

    for (const source of allSources) {
      if (remainingToDeduct <= 0) break;
      if (source.quantidade_atual > 0) {
        const deduct = Math.min(source.quantidade_atual, remainingToDeduct);
        if (!source.isBase) {
          const novaQtdAtualLote = source.quantidade_atual - deduct;
          const novoStatusLote = novaQtdAtualLote <= 0 ? 'esgotado' : 'ativo';
          await supabase.from('produto_lotes').update({ 
            quantidade_atual: novaQtdAtualLote,
            quantidade: novaQtdAtualLote, 
            status: novoStatusLote
          }).eq('id', source.id);
        }
        remainingToDeduct -= deduct;
      }
    }

    const novoEstoque = p.estoque_atual - qtdBaixa;
    const custo = Number(p.custo) || 0;
    const venda = Number(p.preco_venda) || 0;
    const lucro_produto = venda - custo;
    const { error: prodError } = await supabase.from('produtos').update({
      estoque_atual: novoEstoque,
      valor_estoque: custo * novoEstoque,
      lucro_estoque: lucro_produto * novoEstoque
    }).eq('id', p.id);
    if (prodError) {
      toast.error('Erro ao abater o estoque: ' + prodError.message);
      return;
    }

    const payloadMov = {
      id_operacao: crypto.randomUUID(),
      is_troca: false,
      is_devolucao: false,
      is_estorno: true, 
      cliente_nome: toUpperSafe('Baixa Automática (Sistema)'),
      vendedor_nome: toUpperSafe(user?.name || 'Sistema'),
      produto_nome: toUpperSafe(p.nome),
      quantidade: qtdBaixa,
      valor_unitario: p.preco_venda,
      condicao_produto: 'perda',
      motivo: toUpperSafe('Estoque vencido / Avaria.')
    };
    const { error: movError } = await supabase.from('movimentacoes_estoque').insert([payloadMov]);

    if (movError) {
      toast.error('Erro ao registrar na tela de trocas: ' + movError.message);
      return;
    }

    await logAction(user?.name || '', 'baixa_avaria_vencido', `${p.nome} (Qtd: ${qtdBaixa})`);
    toast.success('Baixa registrada com sucesso! Lotes e Estoque atualizados.');
    load();
  }

  async function handleDelete(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    await supabase.from('produtos').delete().eq('id', p.id);
    await logAction(user?.name || '', 'excluir_produto', p.nome);
    toast.success('Produto excluído');
    load();
  }

  function updateField(field: string, value: any) {
    let nextValue = value;
    if (['custo', 'preco_venda'].includes(field)) {
      nextValue = parseCurrencyToNumber(value);
    }

    const next = { ...form, [field]: nextValue };
    const custo = Number(next.custo) || 0;
    let venda = Number(next.preco_venda) || 0;
    const estoque = Number(next.estoque_atual) || 0;
    if ((field === 'custo' || field === 'preco_venda') && custo > 0) {
      if (venda > 0) {
        next.margem = Number((((venda - custo) / custo) * 100).toFixed(2));
      } else {
        next.margem = 0;
      }
    } else if (field === 'margem' && custo > 0) {
      venda = custo * (1 + Number(next.margem) / 100);
      next.preco_venda = Number(venda.toFixed(2));
    }
    
    next.lucro_produto = venda - custo;
    next.valor_estoque = custo * estoque;
    next.lucro_estoque = next.lucro_produto * estoque;
    setForm(next);
    
    // NOVO: Atualizar dados da guia ativa
    if (editing) {
      setLoteTabsData(prev => ({
        ...prev,
        [activeLoteTab]: next
      }));
    }
  }

  // MODIFICADO: handleSave com suporte a salvamento por lote
  async function handleSave() {
    if (!form.nome) { toast.error('Nome é obrigatório'); return; }
    
    // Se estiver editando um lote específico (não a aba base)
    if (editing && activeLoteTab !== 'base') {
      const { error } = await supabase.from('produto_lotes').update({
        custo: Number(form.custo) || 0,
        preco_venda: Number(form.preco_venda) || 0,
        codigo_barras: toUpperSafe(form.codigo || ''),
        data_entrada: form.data_entrada || null,
        data_validade: form.data_validade || null,
        observacao: toUpperSafe(form.observacao || '')
      }).eq('id', activeLoteTab);

      if (error) { 
        toast.error('Erro ao atualizar lote: ' + error.message); 
        return; 
      }
      
      await logAction(user?.name || '', 'editar_lote', `${editing.nome} - Lote ${activeLoteTab.slice(-6)}`);
      toast.success('Lote atualizado com sucesso!');
      setShowForm(false);
      load();
      return;
    }
    
    const payload = {
      nome: toUpperSafe(form.nome),
      marca: toUpperSafe(form.marca || ''),
      codigo: toUpperSafe(form.codigo || ''),
      unidade: toUpperSafe(form.unidade || 'Und'),
      categoria: toUpperSafe(form.categoria || ''),
      fornecedor: toUpperSafe(form.fornecedor || ''),
      custo: Number(form.custo) || 0,
      preco_venda: Number(form.preco_venda) || 0,
      margem: Number(form.margem) || 0,
      estoque_atual: Number(form.estoque_atual) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ativo: form.ativo !== false,
      data_validade: form.data_validade || null,
      data_entrada: form.data_entrada || null,
      observacao: toUpperSafe(form.observacao || ''),
      valor_estoque: Number(form.valor_estoque) || 0,
      lucro_estoque: Number(form.lucro_estoque) || 0,
      lucro_produto: Number(form.lucro_produto) || 0,
    };
    
    if (editing) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar: ' + error.message); return; }
      
      if (editing.lotes && editing.lotes.length > 0) {
        const loteMaisRecente = [...editing.lotes].sort((a, b) => {
          const dateA = new Date(a.data_entrada || '2000-01-01').getTime();
          const dateB = new Date(b.data_entrada || '2000-01-01').getTime();
          if (dateA === dateB) {
            const crA = new Date(a.criado_em || '2000-01-01').getTime();
            const crB = new Date(b.criado_em || '2000-01-01').getTime();
            return crB - crA;
          }
          return dateB - dateA;
        })[0];
        await supabase.from('produto_lotes').update({
          custo: payload.custo,
          preco_venda: payload.preco_venda,
          codigo_barras: payload.codigo,
          data_entrada: payload.data_entrada || new Date().toISOString().split('T')[0],
          data_validade: payload.data_validade || null
        }).eq('id', loteMaisRecente.id);
      }

      await logAction(user?.name || '', 'editar_produto', form.nome || '');
      toast.success('Produto atualizado');
    } else {
      const { data: insertedProduto, error } = await supabase.from('produtos').insert(payload).select().single();
      if (error) { toast.error('Erro ao cadastrar: ' + error.message); return; }
      
      await supabase.from('produto_lotes').insert({
        produto_id: insertedProduto.id,
        quantidade: payload.estoque_atual,
        quantidade_inicial: payload.estoque_atual,
        quantidade_atual: payload.estoque_atual,
        custo: payload.custo,
        preco_venda: payload.preco_venda,
        data_entrada: payload.data_entrada || new Date().toISOString().split('T')[0],
        data_validade: payload.data_validade || null,
        observacao: toUpperSafe(payload.observacao || 'Lote Inicial (Cadastro)'),
        codigo_barras: toUpperSafe(payload.codigo),
        status: payload.estoque_atual > 0 ? 'ativo' : 'esgotado'
      });
      await logAction(user?.name || '', 'cadastrar_produto', form.nome || '');
      toast.success('Produto e Lote Inicial cadastrados');
    }
    setShowForm(false);
    load();
    loadAuxiliarData();
  }

  async function handleSaveLote() {
    if (!editing) return;
    if (loteForm.quantidade <= 0 || (loteFormMode === 'new' && loteForm.custo <= 0)) {
      toast.error('Preencha a quantidade e o custo do lote.');
      return;
    }

    const estoqueAntigo = Number(editing.estoque_atual) || 0;
    const custoAntigo = Number(editing.custo) || 0;
    const qtdNovo = Number(loteForm.quantidade);
    const custoNovo = Number(loteForm.custo);
    const precoVendaNovo = Number(loteForm.preco_venda);

    if (loteFormMode === 'edit' && loteEditId) {
        const { data: oldLote } = await supabase.from('produto_lotes').select('*').eq('id', loteEditId).single();
        if (oldLote) {
            const diff = qtdNovo - (oldLote.quantidade_inicial || oldLote.quantidade);
            const novaQtdAtual = (oldLote.quantidade_atual || 0) + diff;
            
            const { error: loteError } = await supabase.from('produto_lotes').update({
                quantidade: qtdNovo,
                quantidade_inicial: qtdNovo,
                quantidade_atual: novaQtdAtual,
                status: novaQtdAtual <= 0 ? 'esgotado' : 'ativo',
                custo: custoNovo,
                preco_venda: precoVendaNovo,
                data_entrada: loteForm.data_entrada || new Date().toISOString().split('T')[0],
                data_validade: loteForm.data_validade || null,
                observacao: toUpperSafe(loteForm.observacao || ''),
                codigo_barras: toUpperSafe(loteForm.codigo_barras || '')
            }).eq('id', loteEditId);

            if (loteError) {
                toast.error('Erro ao atualizar lote: ' + loteError.message);
                return;
            }

            const novoEstoque = estoqueAntigo + diff;
            
            const { data: todosLotes } = await supabase.from('produto_lotes').select('*').eq('produto_id', editing.id);
            let isUltimoLote = false;
            
            if (todosLotes && todosLotes.length > 0) {
                const loteMaisRecente = [...todosLotes].sort((a, b) => {
                    const dateA = new Date(a.data_entrada || '2000-01-01').getTime();
                    const dateB = new Date(b.data_entrada || '2000-01-01').getTime();
                    if (dateA === dateB) {
                        const crA = new Date(a.criado_em || '2000-01-01').getTime();
                        const crB = new Date(b.criado_em || '2000-01-01').getTime();
                        return crB - crA;
                    }
                    return dateB - dateA;
                })[0];
                
                isUltimoLote = loteMaisRecente.id === loteEditId;
            }

            let payloadProduto: any = {
                estoque_atual: novoEstoque,
                valor_estoque: custoAntigo * novoEstoque,
                lucro_estoque: editing.lucro_produto * novoEstoque,
            };

            if (isUltimoLote) {
                const venda = precoVendaNovo || Number(editing.preco_venda) || 0;
                const lucroProduto = venda - custoNovo;
                const margemNova = custoNovo > 0 ? ((venda - custoNovo) / custoNovo) * 100 : 0;

                payloadProduto = {
                    ...payloadProduto,
                    custo: custoNovo,
                    preco_venda: venda,
                    margem: Number(margemNova.toFixed(2)),
                    lucro_produto: lucroProduto,
                    valor_estoque: custoNovo * novoEstoque,
                    lucro_estoque: lucroProduto * novoEstoque,
                    data_entrada: loteForm.data_entrada || new Date().toISOString().split('T')[0],
                    data_validade: loteForm.data_validade || null,
                    codigo: toUpperSafe(loteForm.codigo_barras || editing.codigo)
                };
            }

            const { error: prodError } = await supabase.from('produtos').update(payloadProduto).eq('id', editing.id);

            if (prodError) {
                toast.error('Erro ao atualizar estoque do produto.');
                return;
            }
            toast.success('Lote e informações atualizados com sucesso!');
        }
    } else {
        const custoMedio = ((estoqueAntigo * custoAntigo) + (qtdNovo * custoNovo)) / (estoqueAntigo + qtdNovo);
        const novoEstoque = estoqueAntigo + qtdNovo;

        const { error: loteError } = await supabase.from('produto_lotes').insert({
          produto_id: editing.id,
          quantidade: qtdNovo, 
          quantidade_inicial: qtdNovo,
          quantidade_atual: qtdNovo,
          custo: custoNovo,
          preco_venda: precoVendaNovo,
          data_entrada: loteForm.data_entrada || new Date().toISOString().split('T')[0],
          data_validade: loteForm.data_validade || null,
          observacao: toUpperSafe(loteForm.observacao || ''),
          codigo_barras: toUpperSafe(loteForm.codigo_barras || ''),
          status: 'ativo'
        });
        if (loteError) {
          toast.error('Erro ao registrar lote: ' + loteError.message);
          return;
        }

        const venda = precoVendaNovo || Number(editing.preco_venda) || 0;
        const lucroProduto = venda - custoMedio;
        const margemNova = custoMedio > 0 ? ((venda - custoMedio) / custoMedio) * 100 : 0;
        const { error: prodError } = await supabase.from('produtos').update({
          custo: custoMedio,
          preco_venda: venda,
          estoque_atual: novoEstoque,
          margem: Number(margemNova.toFixed(2)),
          lucro_produto: lucroProduto,
          valor_estoque: custoMedio * novoEstoque,
          lucro_estoque: lucroProduto * novoEstoque,
          data_entrada: loteForm.data_entrada || new Date().toISOString().split('T')[0],
          data_validade: loteForm.data_validade || null,
          codigo: toUpperSafe(loteForm.codigo_barras || editing.codigo)
        }).eq('id', editing.id);
        if (prodError) {
          toast.error('Erro ao atualizar produto com os dados do lote.');
          return;
        }

        toast.success('Novo lote cadastrado, estoque e dados de identificação atualizados!');
    }
    
    setShowLoteForm(false);
    load();
  }

  function genCodeProduto() {
    updateField('codigo', 'P' + String(Date.now()).slice(-6));
  }

  function genCodeLote() {
    setLoteForm(prev => ({ ...prev, codigo_barras: 'L' + String(Date.now()).slice(-6) }));
  }

  function handleEditarLoteConflito(lote: any, produto: Produto) {
      setEditing(produto);
      setForm({ ...produto });
      setLoteEditId(lote.id);
      setLoteFormMode('edit');
      setLoteForm({
          quantidade: lote.quantidade_inicial || lote.quantidade,
          custo: lote.custo,
          preco_venda: lote.preco_venda || produto.preco_venda,
          data_entrada: lote.data_entrada || '',
          data_validade: lote.data_validade || '',
          observacao: lote.observacao || '',
          codigo_barras: lote.codigo_barras || ''
      });
      setShowCodigoConflito(false);
      setShowForm(false);
      setShowLoteForm(true);
  }

  function handleEditarLoteHistorico(lote: any) {
    setLoteEditId(lote.id);
    setLoteFormMode('edit');
    setLoteForm({
        quantidade: lote.quantidade_inicial || lote.quantidade,
        custo: lote.custo,
        preco_venda: lote.preco_venda || editing?.preco_venda || 0,
        data_entrada: lote.data_entrada || '',
        data_validade: lote.data_validade || '',
        observacao: lote.observacao || '',
        codigo_barras: lote.codigo_barras || ''
    });
    setShowHistoryModal(false);
    setShowLoteForm(true);
  }

  const historicoLotesFiltrados = (editing?.lotes || [])
    .filter(l => {
      const term = historicoBusca.toLowerCase();
      const matchBusca = (l.codigo_barras || '').toLowerCase().includes(term) || (l.observacao || '').toLowerCase().includes(term);
      const matchData = historicoFiltroData ? l.data_entrada === historicoFiltroData : true;
      return matchBusca && matchData;
    })
    .sort((a, b) => {
      if (historicoSortOption === 'registro_desc') {
        return new Date(b.data_entrada || '2000-01-01').getTime() - new Date(a.data_entrada || '2000-01-01').getTime();
      }
      if (historicoSortOption === 'registro_asc') {
        return new Date(a.data_entrada || '2000-01-01').getTime() - new Date(b.data_entrada || '2000-01-01').getTime();
      }
      if (historicoSortOption === 'validade_asc') {
        const dateA = a.data_validade ? new Date(a.data_validade).getTime() : 9999999999999;
        const dateB = b.data_validade ? new Date(b.data_validade).getTime() : 9999999999999;
        return dateA - dateB;
      }
      if (historicoSortOption === 'validade_desc') {
        const dateA = a.data_validade ? new Date(a.data_validade).getTime() : -9999999999999;
        const dateB = b.data_validade ? new Date(b.data_validade).getTime() : -9999999999999;
        return dateB - dateA;
      }
      if (historicoSortOption === 'saldo_desc') {
        const saldoA = Number(a.quantidade_atual || a.quantidade);
        const saldoB = Number(b.quantidade_atual || b.quantidade);
        return saldoB - saldoA;
      }
      if (historicoSortOption === 'saldo_asc') {
        const saldoA = Number(a.quantidade_atual || a.quantidade);
        const saldoB = Number(b.quantidade_atual || b.quantidade);
        return saldoA - saldoB;
      }
      return 0;
    });

  const mDash = {
    totalComprado: (editing?.lotes || []).reduce((acc, l) => acc + Number(l.quantidade_inicial || l.quantidade), 0),
    estoqueLotesAtual: (editing?.lotes || []).reduce((acc, l) => acc + Number(l.quantidade_atual || l.quantidade), 0),
    vencidos: (editing?.lotes || []).filter(l => getDaysDiff(l.data_validade) < 0 && Number(l.quantidade_atual || l.quantidade) > 0).length,
    custoMaisAlto: Math.max(...(editing?.lotes || []).map(l => Number(l.custo)), 0)
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in text-foreground [color-scheme:dark]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold">Cadastro de Produtos</h1>
        <div className="flex gap-2">
          <button onClick={imprimirRelatorio} className="h-9 px-4 rounded-lg bg-muted text-foreground text-sm font-medium flex items-center gap-2 hover:bg-border transition border border-border">
            <Printer className="h-4 w-4" /> Relatório
          </button>
  
          <button onClick={openNew} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:bg-primary/90 transition shadow-lg">
            <Plus className="h-4 w-4" /> Novo Produto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase">Total Produtos</span>
            <Boxes className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-foreground">{totalProdutos}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase">Total Estoque (Custo)</span>
            <DollarSign className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-orange-400">{formatCurrency(valorTotalEstoqueCusto)}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase">Total Venda (Estoque)</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-green-400">{formatCurrency(valorTotalVendaPotencial)}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card space-y-1 shadow-sm">
         <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase">Lucro Total Médio</span>
            <BarChart3 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-blue-400">{formatCurrency(lucroTotalProjetado)}</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-border pb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
        <button onClick={() => setActiveTab('todos')} className={`px-4 py-2 text-sm font-bold uppercase rounded-t-lg transition-colors ${activeTab === 'todos' ?
'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          Todos
        </button>
        <button onClick={() => setActiveTab('estoque_baixo')} className={`px-4 py-2 text-sm font-bold uppercase rounded-t-lg transition-colors ${activeTab === 'estoque_baixo' ?
'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          Estoque Baixo
        </button>
        <button onClick={() => setActiveTab('sem_estoque')} className={`px-4 py-2 text-sm font-bold uppercase rounded-t-lg transition-colors ${activeTab === 'sem_estoque' ?
'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}>
          Sem Estoque
        </button>
        <button onClick={() => setActiveTab('vencidos')} className={`px-4 py-2 text-sm font-bold uppercase rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'vencidos' ?
'bg-red-600 text-white' : 'text-muted-foreground hover:text-red-500 hover:bg-red-500/10'}`}>
          Vencidos <AlertTriangle size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* NOVO: Campo de busca com autocomplete */}
        <div className="relative md:col-span-2 lg:col-span-2" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSearchSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => { if(search.length > 0) setShowSearchSuggestions(true); }}
            placeholder="Buscar por nome, marca, código..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
          
          {/* Dropdown de sugestões */}
          {showSearchSuggestions && searchSuggestions.length > 0 && (
            <ul className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto bg-card border border-border rounded-xl shadow-lg text-sm">
              {searchSuggestions.map((p) => (
                <li
                  key={p.id}
                  className="px-3 py-2 cursor-pointer hover:bg-muted flex flex-col"
                  onMouseDown={() => {
                    setSearch(p.nome);
                    setShowSearchSuggestions(false);
                  }}
                >
                  <span className="font-medium text-foreground">{p.nome}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {p.marca || '-'} • {p.codigo || '-'} • {p.categoria || 'GERAL'} • {p.estoque_atual} {p.unidade}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative md:col-span-1">
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="w-full h-10 pl-3 pr-4 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm appearance-none"
          >
            <option value="">Todas Categorias</option>
            {categoriasExistentes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="relative md:col-span-1">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
            className="w-full h-10 pl-3 pr-4 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm appearance-none"
          >
            <option value="desc">Mais Recentes</option>
            <option value="asc">Mais Antigos</option>
          </select>
        </div>

        <div className="relative md:col-span-1">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={filtroValidade} onChange={(e) => setFiltroValidade(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-sm [color-scheme:dark]"
          />
        </div>
        
        <div className="flex flex-col justify-center px-2 md:col-span-1">
          <label className="text-[10px] uppercase text-muted-foreground font-bold mb-1 flex justify-between">
            Filtro Estoque Máx: <span>Até {maxEstoqueFilter === 999 ? '∞' : maxEstoqueFilter}</span>
          </label>
          <input 
            type="range" min="0" max="100" step="1" 
            value={maxEstoqueFilter > 100 ? 100 : maxEstoqueFilter} 
            onChange={(e) => setMaxEstoqueFilter(e.target.valueAsNumber === 100 ? 999 : e.target.valueAsNumber)}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-32 bg-card animate-pulse rounded-xl border border-border shadow-sm" />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm flex flex-col">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3 font-medium uppercase text-xs">Nome</th>
                  <th className="p-3 font-medium uppercase text-xs text-center">Código</th>
                  <th className="p-3 font-medium uppercase text-xs">Marca</th>
                  <th className="p-3 font-medium uppercase text-xs text-right">Custo Un.</th>
                  <th className="p-3 font-medium uppercase text-xs text-right">Estoque</th>
                  <th className="p-3 font-medium uppercase text-xs text-center">Data Entrada</th>
                  <th className="p-3 font-medium uppercase text-xs text-center">Validade (Base)</th>
                  <th className="p-3 font-medium uppercase text-xs text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedProdutos.map((p) => {
                  const isZerado = p.estoque_atual <= 0;
                  const isBaixo = p.estoque_atual > 0 && p.estoque_atual <= (p.estoque_minimo || 0);
                  const statusValidade = getStatusValidade(p);
                  
                  let highlightClass = '';
                  if (statusValidade.status === 'vencido') highlightClass = 'animate-pulse bg-red-500/10 text-red-500';
                  else if (statusValidade.status === 'proximo') highlightClass = 'bg-yellow-500/10 text-yellow-600';
                  else if (isZerado) highlightClass = 'animate-pulse bg-red-500/10 text-red-500';
                  else if (isBaixo) highlightClass = 'bg-orange-500/10 text-orange-500';
                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-muted/20 transition-colors ${highlightClass}`}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex flex-col">
                          <span className="text-foreground">{p.nome}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{p.categoria || 'Geral'}</span>
                        </div>
                        {isZerado && <span className="mt-1 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded uppercase w-fit inline-block font-bold">Sem Estoque</span>}
                        {statusValidade.status === 'vencido' && <span className="mt-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded uppercase w-fit inline-block font-bold">Vencido ({statusValidade.qtd} un.)</span>}
                        {statusValidade.status === 'proximo' && <span className="mt-1 text-[10px] bg-yellow-600 text-white px-1.5 py-0.5 rounded uppercase w-fit inline-block font-bold">Vence em {statusValidade.dias} dias ({statusValidade.qtd} un.)</span>}
                      </td>
                      <td className="p-3 text-center font-mono text-muted-foreground">
                        {p.codigo || '-'}
                      </td>
                      <td className="p-3 text-muted-foreground italic">
                        {p.marca || '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-orange-400/80">{formatCurrency(p.custo)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${isZerado ? 'text-red-500' : 'text-foreground'}`}>{p.estoque_atual} {p.unidade}</td>
                      <td className="p-3 text-center text-muted-foreground font-mono">
                        {p.data_entrada ? new Date(p.data_entrada).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3 text-center text-muted-foreground font-bold font-mono">
                        {p.data_validade ? new Date(p.data_validade).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          {activeTab === 'vencidos' && (
                            <button onClick={() => enviarParaTrocasAvaria(p)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 flex items-center gap-1 text-[10px] font-bold uppercase border border-red-500/20 mr-2 transition-colors" title="Lançar como Avaria na tela de Trocas">
                              <ArrowRightLeft className="h-3.5 w-3.5" /> Avaria
                            </button>
                          )}
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                       </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
            <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Itens por página:</span>
                <select
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="h-8 px-2 rounded-lg border border-border bg-background text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                </select>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground font-medium">
                 Página <span className="font-bold text-foreground">{currentPage}</span> de <span className="font-bold text-foreground">{totalPages || 1}</span>
                </span>
                <div className="flex gap-1">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:hover:bg-background transition-colors text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="p-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 disabled:hover:bg-background transition-colors text-foreground"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* MODIFICADO: Formulário principal com sistema de guias */}
      {showForm && !showLoteForm && !showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto scrollbar-thin scrollbar-thumb-muted 
rounded-2xl border border-border bg-card text-foreground p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-lg font-black uppercase text-primary italic tracking-tighter">{editing ? 'Editar Produto' : 'Novo Produto'}</h2>
                {editing && (
                  <div className="flex gap-2">
                    <button onClick={abrirModalLote} className="h-8 px-3 bg-primary/10 text-primary border border-primary/20 rounded-lg font-black uppercase text-[10px] flex items-center gap-2 hover:bg-primary/20 transition">
                      <Boxes className="h-3.5 w-3.5" /> Cadastrar Novo Lote
                    </button>
                    <button onClick={() => { setShowHistoryModal(true); setShowForm(false); }} className="h-8 px-3 bg-muted text-muted-foreground border border-border rounded-lg font-black uppercase text-[10px] flex items-center gap-2 hover:bg-border transition">
                      <History className="h-3.5 w-3.5" /> Ver Histórico
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition"><X className="h-5 w-5" /></button>
            </div>

            {/* NOVO: Sistema de guias para produtos com múltiplos lotes */}
            {editing && editing.lotes && editing.lotes.length > 0 && (
              <div className="flex space-x-2 border-b border-border pb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
                <button 
                  onClick={() => changeLoteTab('base')} 
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-lg transition-colors whitespace-nowrap ${
                    activeLoteTab === 'base' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Produto Base
                </button>
                {editing.lotes.map((lote, index) => (
                  <button 
                    key={lote.id}
                    onClick={() => changeLoteTab(lote.id)} 
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-lg transition-colors whitespace-nowrap ${
                      activeLoteTab === lote.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    Lote {index + 1} ({lote.quantidade_atual || lote.quantidade} un)
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Nome *</label>
                <input 
                  value={form.nome || ''} 
                  onChange={(e) => updateField('nome', e.target.value)} 
                  disabled={activeLoteTab !== 'base'}
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed" 
                />
               </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Marca</label>
                <input 
                  value={form.marca || ''} 
                  onChange={(e) => updateField('marca', e.target.value)} 
                  disabled={activeLoteTab !== 'base'}
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed" 
                />
               </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Código de Barras {activeLoteTab !== 'base' && 'do Lote'}</label>
                <div className="flex gap-2">
                  <input 
                    value={form.codigo || ''} 
                    onChange={(e) => updateField('codigo', e.target.value)} 
                    onBlur={(e) => verificarCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') verificarCodigo(form.codigo || ''); }}
                    className="flex-1 p-3 bg-muted/30 border border-border rounded-xl text-xs font-mono outline-none focus:border-primary/40 text-foreground" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setScanMode('produto')} 
                    className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center justify-center shadow-md" 
                    title="Escanear com a câmera"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={genCodeProduto} 
                    className="px-4 bg-muted border border-border hover:border-primary/40 rounded-xl text-[10px] font-black uppercase transition text-foreground"
                  >
                    Gerar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Data de Entrada</label>
                  <input 
                    type="date" 
                    value={form.data_entrada || ''} 
                    onChange={(e) => updateField('data_entrada', e.target.value)} 
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground [color-scheme:dark]" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Data de Validade {activeLoteTab !== 'base' && '(Lote)'}</label>
                  <input 
                    type="date" 
                    value={form.data_validade || ''} 
                    onChange={(e) => updateField('data_validade', e.target.value)} 
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground [color-scheme:dark]" 
                  />
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                  <label className="text-[10px] font-black text-orange-500 uppercase">Custo {activeLoteTab === 'base' && editing && "(Médio)"}</label>
                  <input 
                    type="text" 
                    value={formatCurrency(form.custo || 0)} 
                    onChange={(e) => updateField('custo', e.target.value)} 
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-orange-500 font-mono font-bold" 
                  />
                </div>
                <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                  <label className="text-[10px] font-black text-blue-500 uppercase">Margem (%)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={form.margem === 0 ? '' : form.margem} 
                    onChange={(e) => updateField('margem', e.target.value)} 
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-blue-500 font-mono font-bold" 
                  />
                </div>
                <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-1">
                  <label className="text-[10px] font-black text-green-500 uppercase">Venda {activeLoteTab !== 'base' && '(Lote)'}</label>
                  <input 
                    type="text" 
                    value={formatCurrency(form.preco_venda || 0)} 
                    onChange={(e) => updateField('preco_venda', e.target.value)} 
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-green-500 font-mono font-bold" 
                  />
               </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Categoria</label>
                  <input 
                    value={form.categoria || ''} 
                    onChange={(e) => {
                      updateField('categoria', e.target.value);
                      setShowCategoryDropdown(true);
                    }} 
                    onFocus={() => setShowCategoryDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
                    disabled={activeLoteTab !== 'base'}
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed" 
                  />
                  {showCategoryDropdown && categoriasExistentes.length > 0 && activeLoteTab === 'base' && (
                    <ul className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-[160px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted">
                      {categoriasExistentes
                        .filter(c => c.toLowerCase().includes((form.categoria || '').toLowerCase()))
                        .map(c => (
                        <li 
                          key={c} 
                          className="p-3 text-xs font-bold uppercase cursor-pointer hover:bg-muted text-foreground" 
                          onMouseDown={() => {
                            updateField('categoria', c);
                            setShowCategoryDropdown(false);
                          }}
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Fornecedor</label>
                  <select 
                    value={form.fornecedor || ''} 
                    onChange={(e) => updateField('fornecedor', e.target.value)} 
                    disabled={activeLoteTab !== 'base'}
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <option value="" className="bg-card text-foreground">Selecione...</option>
                    {fornecedores.map(f => <option key={f.nome} value={f.nome} className="bg-card text-foreground">{f.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Estoque Atual {activeLoteTab !== 'base' && '(Lote)'}</label>
                  <input 
                    type="number" 
                    value={form.estoque_atual || 0} 
                    onChange={(e) => updateField('estoque_atual', Number(e.target.value))} 
                    disabled={activeLoteTab !== 'base' || !!editing} 
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Unidade</label>
                  <input 
                    list="unidades-list"
                    value={form.unidade || ''} 
                    onChange={(e) => updateField('unidade', e.target.value)} 
                    disabled={activeLoteTab !== 'base'}
                    className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold uppercase outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed"
                  />
                  <datalist id="unidades-list">
                    {unidadesExistentes.map(u => <option key={u} value={u} className="bg-card text-foreground" />)}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Estoque Mínimo</label>
                <input 
                  type="number" 
                  value={form.estoque_minimo || 0} 
                  onChange={(e) => updateField('estoque_minimo', Number(e.target.value))} 
                  disabled={activeLoteTab !== 'base'}
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold outline-none focus:border-primary/40 text-foreground disabled:opacity-70 disabled:cursor-not-allowed" 
                />
              </div>

              <div className="flex items-center gap-2 h-full pt-4">
                <input 
                  type="checkbox" 
                  checked={form.ativo !== false} 
                  onChange={(e) => updateField('ativo', e.target.checked)} 
                  disabled={activeLoteTab !== 'base'}
                  className="h-5 w-5 rounded border-border bg-muted accent-primary disabled:opacity-70" 
                />
                <label className="text-xs font-black uppercase text-foreground">Produto Ativo</label>
               </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground ml-1 tracking-widest">Observações Internas</label>
                <textarea 
                  value={form.observacao || ''} 
                  onChange={(e) => updateField('observacao', e.target.value)} 
                  rows={2} 
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs outline-none focus:border-primary/40 text-foreground resize-none" 
                />
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 h-12 rounded-xl border border-border text-xs font-black uppercase hover:bg-muted transition text-foreground">Cancelar</button>
              <button 
                onClick={handleSave} className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:bg-primary/90 transition shadow-lg flex items-center justify-center gap-2">
                <Save className="h-4 w-4" /> {editing ? (activeLoteTab === 'base' ? 'Salvar Produto' : 'Salvar Lote') : 'Finalizar Cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODIFICADO: Formulário de lote com campo de preço de venda */}
      {showLoteForm && editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-6 space-y-6 
shadow-2xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center border-b border-border pb-4">
              <div>
                <h3 className="text-primary font-black uppercase italic tracking-tighter">
                    {loteFormMode === 'edit' ? 'Editar Lote' : 'Novo Lote'}
                </h3>
                <p className="text-[10px] text-muted-foreground font-bold uppercase">{editing.nome}</p>
              </div>
               <button onClick={() => setShowLoteForm(false)} className="text-muted-foreground hover:text-red-500 transition"><X /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Código de Barras do Lote</label>
                <div className="flex gap-2">
                  <input 
                    value={loteForm.codigo_barras} 
                    onChange={(e) => setLoteForm({...loteForm, codigo_barras: e.target.value})} 
                    onBlur={(e) => verificarCodigoLote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') verificarCodigoLote(loteForm.codigo_barras); }}
                    className="flex-1 p-3 bg-muted/30 border border-border rounded-xl text-xs font-mono outline-none focus:border-primary text-foreground" 
                  />
                  <button 
                    type="button" 
                    onClick={() => setScanMode('lote')} 
                    className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center justify-center shadow-md"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={genCodeLote} 
                    className="px-4 bg-muted border border-border rounded-xl text-[10px] font-black uppercase text-foreground"
                  >
                    Gerar
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-orange-500">Quantidade Entrada</label>
                <input 
                  type="number" 
                  value={loteForm.quantidade} 
                  onChange={(e) => setLoteForm({...loteForm, quantidade: Number(e.target.value)})} 
                  className="w-full p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl text-xs font-bold outline-none focus:border-orange-500 text-foreground" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-blue-500">Custo Unitário (R$)</label>
                 <input 
                   type="text" 
                   value={formatCurrency(loteForm.custo)} 
                  onChange={(e) => setLoteForm({...loteForm, custo: parseCurrencyToNumber(e.target.value)})} 
                   className="w-full p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs font-mono font-bold outline-none focus:border-blue-500 text-foreground" 
                 />
               </div>

               {/* NOVO: Campo de preço de venda para o lote */}
               <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-green-500">Preço de Venda (R$)</label>
                 <input 
                   type="text" 
                   value={formatCurrency(loteForm.preco_venda)} 
                  onChange={(e) => setLoteForm({...loteForm, preco_venda: parseCurrencyToNumber(e.target.value)})} 
                   className="w-full p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-xs font-mono font-bold outline-none focus:border-green-500 text-foreground" 
                 />
               </div>
             
              <div className="space-y-1">
                 <label className="text-[10px] font-black uppercase text-muted-foreground">Data Entrada</label>
                <input 
                  type="date" 
                   value={loteForm.data_entrada} 
                 onChange={(e) => setLoteForm({...loteForm, data_entrada: e.target.value})} 
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold outline-none focus:border-primary text-foreground [color-scheme:dark]" 
                />
              </div>
                <div className="space-y-1">
               <label className="text-[10px] font-black uppercase text-muted-foreground">Data Validade</label>
                <input 
                  type="date" 
                  value={loteForm.data_validade} 
                  onChange={(e) => setLoteForm({...loteForm, data_validade: e.target.value})} 
                 className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs font-bold outline-none focus:border-primary text-foreground [color-scheme:dark]" 
                />
               </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Observação do Lote</label>
                <textarea 
                  value={loteForm.observacao} 
                  onChange={(e) => setLoteForm({...loteForm, observacao: e.target.value})} 
                  rows={2} 
                  className="w-full p-3 bg-muted/30 border border-border rounded-xl text-xs outline-none focus:border-primary text-foreground resize-none" 
                />
              </div>
            </div>

            <button onClick={handleSaveLote} className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-black uppercase text-xs hover:bg-primary/90 transition shadow-xl flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> {loteFormMode === 'edit' ? 'Salvar Lote' : 'Confirmar Novo Lote'}
            </button>
          </div>
        </div>
      )}

      {/* Modais restantes mantidos iguais ao código original */}
      {showHistoryModal && editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
               <div className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                   <History className="h-6 w-6 text-primary" />
                </div>
                 <div>
                  <h2 className="text-xl font-black uppercase italic text-foreground leading-tight">Histórico de Lotes</h2>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{editing.nome}</p>
                </div>
               </div>
              <button onClick={() => setShowHistoryModal(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"><X /></button>
            </div>

            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/10 border-b border-border">
              <div className="p-3 bg-card border border-border rounded-xl">
                  <p className="text-[9px] font-black uppercase text-muted-foreground">Total Comprado</p>
                  <p className="text-lg font-mono font-bold">{mDash.totalComprado} {editing.unidade}</p>
               </div>
               <div className="p-3 bg-card border border-border rounded-xl">
                  <p className="text-[9px] font-black uppercase text-muted-foreground">Em Estoque (Lotes)</p>
                  <p className="text-lg font-mono font-bold text-primary">{mDash.estoqueLotesAtual} {editing.unidade}</p>
               </div>
               <div className="p-3 bg-card border border-border rounded-xl">
                  <p className="text-[9px] font-black uppercase text-red-500">Lotes Vencidos</p>
                  <p className="text-lg font-mono font-bold text-red-500">{mDash.vencidos}</p>
               </div>
                <div className="p-3 bg-card border border-border rounded-xl">
                  <p className="text-[9px] font-black uppercase text-orange-500">Custo mais Alto</p>
                  <p className="text-lg font-mono font-bold text-orange-500">{formatCurrency(mDash.custoMaisAlto)}</p>
               </div>
            </div>

            <div className="p-4 border-b border-border flex flex-col md:flex-row gap-3">
               <div className="relative flex-1">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={historicoBusca} onChange={(e) => setHistoricoBusca(e.target.value)} placeholder="Filtrar por código ou observação..." className="w-full h-10 pl-10 pr-4 bg-muted/20 border border-border rounded-xl text-xs outline-none focus:border-primary" />
              </div>
              <input type="date" value={historicoFiltroData} onChange={(e) => setHistoricoFiltroData(e.target.value)} className="h-10 px-4 bg-background text-foreground border border-border rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary [color-scheme:dark]" />
               <select
                  value={historicoSortOption}
                  onChange={(e) => setHistoricoSortOption(e.target.value as any)}
                  className="h-10 px-4 bg-background text-foreground border border-border rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
              >
                  <option value="registro_desc" className="bg-card text-foreground">Mais Recentes</option>
                  <option value="registro_asc" className="bg-card text-foreground">Mais Antigos</option>
                  <option value="validade_asc" className="bg-card text-foreground">Validade: Próx. a Vencer</option>
                  <option value="validade_desc" className="bg-card text-foreground">Validade: Mais Distantes</option>
                  <option value="saldo_desc" className="bg-card text-foreground">Maior Saldo em Estoque</option>
                  <option value="saldo_asc" className="bg-card text-foreground">Menor Saldo em Estoque</option>
              </select>
            </div>

            <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-muted">
               <table className="w-full text-xs text-left">
                <thead className="text-[10px] font-black uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3 text-center">Entrada</th>
                     <th className="p-3 text-center">Validade</th>
                    <th className="p-3 text-right">Custo</th>
                    <th className="p-3 text-right">Inicial</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3">Observação</th>
                    <th className="p-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historicoLotesFiltrados.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground font-bold uppercase italic">Nenhum lote registrado.</td></tr>
                  ) : (
                    historicoLotesFiltrados.map((l) => {
                      const lQtdAtual = Number(l.quantidade_atual || l.quantidade);
                      const isEsgotado = lQtdAtual <= 0;
                      const isVencido = getDaysDiff(l.data_validade) < 0 && !isEsgotado;
                      return (
                        <tr key={l.id} className={`hover:bg-muted/30 transition-colors ${isEsgotado ? 'opacity-40' : ''} ${isVencido ? 'bg-red-500/5' : ''}`}>
                          <td className="p-3 font-mono font-bold text-primary">{l.codigo_barras || '-'}</td>
                          <td className="p-3 text-center">{new Date(l.data_entrada).toLocaleDateString('pt-BR')}</td>
                          <td className={`p-3 text-center font-bold ${isVencido ? 'text-red-500' : ''}`}>
                            {l.data_validade ? new Date(l.data_validade).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="p-3 text-right font-mono">{formatCurrency(l.custo)}</td>
                          <td className="p-3 text-right font-mono">{l.quantidade_inicial || l.quantidade}</td>
                          <td className={`p-3 text-right font-mono font-black ${isEsgotado ? 'text-muted-foreground' : 'text-foreground'}`}>{lQtdAtual}</td>
                          <td className="p-3 text-xs max-w-[200px] truncate" title={l.observacao}>{l.observacao || '-'}</td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleEditarLoteHistorico(l)} className="p-1.5 rounded hover:bg-primary/20 bg-primary/10 text-primary transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showCodigoConflito && codigoConflitoData && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-border bg-muted/30 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black uppercase italic text-foreground leading-tight text-red-500 flex items-center gap-2">
                   <AlertTriangle className="h-6 w-6" /> Atenção! Código já cadastrado
                </h2>
                <p className="text-sm mt-2 text-foreground">
                  Produto encontrado: <span className="uppercase underline animate-pulse font-black text-red-500 bg-red-500/10 px-2 py-1 rounded">{codigoConflitoData.produto.nome}</span>
                </p>
                {codigoConflitoData.lotes.length > 1 && (
                  <p className="text-sm mt-2 text-foreground">
                    <span className="uppercase underline animate-pulse font-black text-red-500 bg-red-500/10 px-2 py-1 rounded">{codigoConflitoData.lotes.length} LOTES CADASTRADOS</span>
                 </p>
                )}
              </div>
              <button onClick={() => setShowCodigoConflito(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"><X /></button>
            </div>
            
            <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-muted">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] font-black uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3 text-center">Entrada</th>
                    <th className="p-3 text-center">Validade</th>
                    <th className="p-3 text-right">Custo</th>
                    <th className="p-3 text-right">Inicial</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3">Observação</th>
                     <th className="p-3 text-right">Ação</th>
                  </tr>
                 </thead>
                <tbody className="divide-y divide-border">
                   {codigoConflitoData.lotes.map(l => {
                    const lQtdAtual = Number(l.quantidade_atual || l.quantidade);
                    const isEsgotado = lQtdAtual <= 0;
                    const isVencido = getDaysDiff(l.data_validade) < 0 && !isEsgotado;
                    return (
                      <tr key={l.id} className={`hover:bg-muted/30 transition-colors ${isEsgotado ? 'opacity-40' : ''} ${isVencido ? 'bg-red-500/5' : ''}`}>
                        <td className="p-3 font-mono font-bold text-primary">{l.codigo_barras || '-'}</td>
                        <td className="p-3 text-center">{new Date(l.data_entrada).toLocaleDateString('pt-BR')}</td>
                         <td className={`p-3 text-center font-bold ${isVencido ? 'text-red-500' : ''}`}>
                          {l.data_validade ? new Date(l.data_validade).toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="p-3 text-right font-mono">{formatCurrency(l.custo)}</td>
                        <td className="p-3 text-right font-mono">{l.quantidade_inicial || l.quantidade}</td>
                        <td className={`p-3 text-right font-mono font-black ${isEsgotado ? 'text-muted-foreground' : 'text-foreground'}`}>{lQtdAtual}</td>
                        <td className="p-3 text-xs max-w-[200px] truncate" title={l.observacao}>{l.observacao || '-'}</td>
                        <td className="p-3 text-right">
                          <button onClick={() => handleEditarLoteConflito(l, codigoConflitoData.produto)} className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20"><Pencil className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {codigoConflitoData.lotes.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground font-bold uppercase italic">Nenhum lote registrado para este produto.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/10">
               <button onClick={() => {
                  setEditing(codigoConflitoData.produto);
                  setForm({ ...codigoConflitoData.produto });
                  setLoteFormMode('new');
                  setLoteEditId(null);
                  setLoteForm({
                      quantidade: 0,
                      custo: 0,
                      preco_venda: codigoConflitoData.produto.preco_venda || 0,
                      data_entrada: new Date().toISOString().split('T')[0],
                      data_validade: '',
                      observacao: '',
                      codigo_barras: codigoConflitoData.produto.codigo || ''
                  });
                  setShowCodigoConflito(false);
                  setShowForm(false);
                  setShowLoteForm(true);
              }} className="h-10 px-4 bg-primary text-primary-foreground rounded-xl font-black uppercase text-xs hover:bg-primary/90 transition shadow-xl flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" /> Cadastrar Novo Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {scanMode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md bg-card rounded-2xl overflow-hidden relative border border-border shadow-2xl">
            <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
              <h3 className="text-foreground font-black uppercase text-xs">Escanear Código ({scanMode === 'produto' ? 'Produto' : 'Lote'})</h3>
              <button onClick={() => setScanMode(null)} className="text-muted-foreground hover:text-red-500 transition"><X /></button>
            </div>
            <div id="reader" className="w-full"></div>
            <div className="p-4 text-center text-muted-foreground text-[10px] font-bold uppercase">
              Aponte a câmera para o código de barras
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
