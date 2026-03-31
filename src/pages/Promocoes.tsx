import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, X, Save, Search, Layers, CheckSquare, Square, Package, Calendar, Play, Pause, AlertCircle, ShoppingCart } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface PromocaoItem {
  id?: string;
  produto_id: string;
  produto_nome?: string;
  codigo?: string;
  preco_venda?: number;
  lote_id?: string | null;
  lote_codigo?: string;
  observacao_lote?: string;
  preco_promocional: number;
  quantidade_minima: number;
  quantidade_maxima?: number | null;
  condicao_pagamento: string;
}

interface PromocaoGrupo {
  grupo_id: string;
  nome_promocao: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: boolean;
  itens: PromocaoItem[];
}

// Interface para a Tabela (Grid) Simples
interface PromocaoRow {
  id: string;
  grupo_id: string | null;
  nome_promocao: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: boolean;
  produto_id: string;
  produto_nome: string;
  codigo: string;
  preco_venda: number;
  lote_id: string | null;
  lote_codigo: string;
  observacao_lote: string;
  preco_promocional: number;
  quantidade_minima: number;
  quantidade_maxima: number | null;
  condicao_pagamento: string;
}

interface Produto {
  id: string;
  nome: string;
  codigo: string;
  marca?: string;
  preco_venda: number;
  categoria: string;
  estoque_atual: number;
  lote_id?: string;
  lote_codigo?: string;
  lotes?: {
    id: string;
    codigo: string;
    data_validade?: string;
    quantidade_atual?: number;
    observacao?: string;
  }[];
}

interface FormaPagamento {
  id: string;
  nome: string;
}

export default function Promocoes() {
  const { user, isAdmin } = useAuth();
  const [promocoesFlat, setPromocoesFlat] = useState<PromocaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showForm, setShowForm] = useState(false);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);

  // Estados do Formulário Master (A Campanha)
  const [formGrupo, setFormGrupo] = useState<Partial<PromocaoGrupo>>({});
  const [indeterminado, setIndeterminado] = useState(false);

  // Estados da Busca e Adição de Item
  const [searchGrid, setSearchGrid] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [produtosBusca, setProdutosBusca] = useState<Produto[]>([]);
  const [lotSelectionItem, setLotSelectionItem] = useState<Produto | null>(null);
  const [selectedLotes, setSelectedLotes] = useState<any[]>([]);
  
  // Item sendo configurado no momento
  const [itemConfig, setItemConfig] = useState<Partial<PromocaoItem> | null>(null);

  const darkScrollbarClass = "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent overflow-y-auto";

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const parseCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return Number(digits) / 100;
  };

  useEffect(() => { 
    load(); 
    loadFormas();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('promocoes')
      .select('*, produtos:produto_id(nome, codigo, preco_venda), produto_lotes:lote_id(codigo_barras, observacao)')
      .order('created_at', { ascending: false });

    // Transformando direto em uma lista plana (Grid Simples)
    const flatData = (data || []).map((p: any) => ({
      id: p.id,
      grupo_id: p.grupo_id,
      nome_promocao: p.nome_promocao || 'Campanha Padrão',
      data_inicio: p.data_inicio,
      data_fim: p.data_fim,
      status: p.status ?? true,
      produto_id: p.produto_id,
      produto_nome: p.produtos?.nome || 'Produto Removido',
      codigo: p.produtos?.codigo || '',
      preco_venda: p.produtos?.preco_venda || 0,
      lote_id: p.lote_id,
      lote_codigo: p.produto_lotes?.codigo_barras || 'Todos',
      observacao_lote: p.produto_lotes?.observacao || '',
      preco_promocional: p.preco_promocional,
      quantidade_minima: p.quantidade_minima,
      quantidade_maxima: p.quantidade_maxima,
      condicao_pagamento: p.condicao_pagamento
    }));

    setPromocoesFlat(flatData);
    setLoading(false);
  }

  async function loadFormas() {
    const { data } = await supabase.from('formas_pagamento').select('id, nome').eq('ativo', true);
    setFormas(data || []);
  }

  // Busca Inteligente idêntica ao PDV
  const searchProductsSmart = useCallback(async (term: string) => {
    const query = term.trim();
    if (!query) { setProdutosBusca([]); setShowResults(false); return; }
    
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
          .select('id, codigo_barras, produto_id, data_validade, quantidade_atual, observacao')
          .in('produto_id', pIds);
        lotesAdicionais = lExtras || [];
      }

      const produtosMap = new Map<string, Produto>();

      (pData || []).forEach(p => {
        produtosMap.set(p.id, {
          id: p.id, nome: p.nome, codigo: p.codigo || '', marca: p.marca || '',
          preco_venda: Number(p.preco_venda) || 0, estoque_atual: Number(p.estoque_atual) || 0, 
          categoria: p.categoria || '', lotes: []
        });
      });

      lotesAdicionais.forEach(lote => {
        const prod = produtosMap.get(lote.produto_id);
        if (prod && prod.lotes) {
           prod.lotes.push({ 
             id: lote.id, codigo: lote.codigo_barras, data_validade: lote.data_validade,
             quantidade_atual: lote.quantidade_atual, observacao: lote.observacao
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
                estoque_atual: Number(lote.produtos.estoque_atual) || 0, categoria: lote.produtos.categoria || '', lotes: []
              };
              produtosMap.set(prod.id, prod);
            }
            if (prod.lotes && !prod.lotes.find(l => l.id === lote.id)) {
              prod.lotes.push({
                id: lote.id, codigo: lote.codigo_barras, data_validade: lote.data_validade,
                quantidade_atual: lote.quantidade_atual, observacao: lote.observacao
              });
            }
          }
        });
      }

      setProdutosBusca(Array.from(produtosMap.values()));
      setShowResults(true);
    } catch (error) { toast.error("Erro ao buscar produtos"); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { searchProductsSmart(searchProduct); }, 300);
    return () => clearTimeout(timer);
  }, [searchProduct, searchProductsSmart]);

  function handleSelectProduct(p: Produto) {
    if (p.lotes && p.lotes.length > 1) {
      setLotSelectionItem(p);
      setSelectedLotes([]);
      return;
    }
    const loteId = p.lote_id || (p.lotes && p.lotes.length === 1 ? p.lotes[0].id : null);
    const loteCod = p.lote_codigo || (p.lotes && p.lotes.length === 1 ? p.lotes[0].codigo : 'Todos');

    startItemConfig(p, [{ id: loteId, codigo: loteCod }]);
  }

  function toggleLoteSelection(lote: any) {
    setSelectedLotes(prev => 
      prev.find(l => l.id === lote.id) ? prev.filter(l => l.id !== lote.id) : [...prev, lote]
    );
  }

  function confirmMultiLotSelection() {
    if (!lotSelectionItem) return;
    if (selectedLotes.length === 0) {
      toast.error("Selecione pelo menos um lote.");
      return;
    }
    startItemConfig(lotSelectionItem, selectedLotes);
    setLotSelectionItem(null);
  }

  function startItemConfig(p: Produto, lotes: any[]) {
    setItemConfig({
      produto_id: p.id,
      produto_nome: p.nome,
      codigo: p.codigo,
      preco_venda: p.preco_venda,
      preco_promocional: 0,
      quantidade_minima: 1,
      quantidade_maxima: null,
      condicao_pagamento: 'todas',
      lotesSelecionados: lotes 
    } as any);
    
    setSearchProduct('');
    setShowResults(false);
  }

  function addItemToGroup() {
    if (!itemConfig || !itemConfig.preco_promocional || itemConfig.preco_promocional <= 0) {
      toast.error("Defina o valor promocional");
      return;
    }

    const lotes = (itemConfig as any).lotesSelecionados || [];
    const newItems: PromocaoItem[] = lotes.map((lote: any) => ({
      produto_id: itemConfig.produto_id!,
      produto_nome: itemConfig.produto_nome,
      codigo: itemConfig.codigo,
      preco_venda: itemConfig.preco_venda,
      lote_id: lote.id || null,
      lote_codigo: lote.codigo || 'Todos',
      preco_promocional: itemConfig.preco_promocional!,
      quantidade_minima: itemConfig.quantidade_minima || 1,
      quantidade_maxima: itemConfig.quantidade_maxima || null,
      condicao_pagamento: itemConfig.condicao_pagamento || 'todas'
    }));

    setFormGrupo(prev => ({
      ...prev,
      itens: [...(prev.itens || []), ...newItems]
    }));
    setItemConfig(null);
  }

  function removeItemFromGroup(idx: number) {
    setFormGrupo(prev => {
      const list = [...(prev.itens || [])];
      list.splice(idx, 1);
      return { ...prev, itens: list };
    });
  }

  async function handleSaveGroup() {
    if (!formGrupo.nome_promocao) { toast.error('Dê um nome para a promoção'); return; }
    if (!formGrupo.data_inicio) { toast.error('Informe a data de início'); return; }
    if (!formGrupo.itens || formGrupo.itens.length === 0) { toast.error('Adicione pelo menos um produto'); return; }

    const gId = formGrupo.grupo_id || crypto.randomUUID();

    try {
      // Deleta itens antigos desse grupo caso seja edição
      if (formGrupo.grupo_id) {
        await supabase.from('promocoes').delete().eq('grupo_id', gId);
      }

      const payloads = formGrupo.itens.map(item => ({
        grupo_id: gId,
        nome_promocao: formGrupo.nome_promocao,
        data_inicio: formGrupo.data_inicio,
        data_fim: indeterminado ? null : formGrupo.data_fim,
        status: formGrupo.status,
        produto_id: item.produto_id,
        lote_id: item.lote_id,
        preco_promocional: item.preco_promocional,
        quantidade_minima: item.quantidade_minima,
        quantidade_maxima: item.quantidade_maxima || null,
        condicao_pagamento: item.condicao_pagamento
      }));

      const { error } = await supabase.from('promocoes').insert(payloads);
      if (error) throw error;

      toast.success('Promoção salva com sucesso!');
      await logAction(user?.name || '', formGrupo.grupo_id ? 'editar_promocao' : 'cadastrar_promocao', formGrupo.nome_promocao);
      
      setShowForm(false);
      load();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    }
  }

  // --- AÇÕES INDIVIDUAIS NA TABELA ---
  async function handleToggleStatusIndividual(p: PromocaoRow) {
    const newStatus = !p.status;
    await supabase.from('promocoes').update({ status: newStatus }).eq('id', p.id);
    toast.success(`Item da Promoção ${newStatus ? 'Ativado' : 'Pausado'}`);
    load();
  }

  async function handleDeleteIndividual(p: PromocaoRow) {
    if (!isAdmin) { toast.error('Apenas administradores podem excluir.'); return; }
    if (!confirm(`Deseja excluir permanentemente o item "${p.produto_nome}" desta promoção?`)) return;
    
    await supabase.from('promocoes').delete().eq('id', p.id);
    toast.success('Item excluído da promoção');
    load();
  }

  function handleEditIndividual(p: PromocaoRow) {
    // Carrega a campanha completa (grupo) a qual este item pertence para manter a estética do form
    const groupItems = promocoesFlat.filter(row => 
      (row.grupo_id && row.grupo_id === p.grupo_id) || (!row.grupo_id && row.id === p.id)
    );

    const g: PromocaoGrupo = {
      grupo_id: p.grupo_id || p.id,
      nome_promocao: p.nome_promocao,
      data_inicio: p.data_inicio,
      data_fim: p.data_fim,
      status: p.status,
      itens: groupItems.map(item => ({
        id: item.id,
        produto_id: item.produto_id,
        produto_nome: item.produto_nome,
        codigo: item.codigo,
        preco_venda: item.preco_venda,
        lote_id: item.lote_id,
        lote_codigo: item.lote_codigo,
        observacao_lote: item.observacao_lote,
        preco_promocional: item.preco_promocional,
        quantidade_minima: item.quantidade_minima,
        quantidade_maxima: item.quantidade_maxima,
        condicao_pagamento: item.condicao_pagamento
      }))
    };

    setFormGrupo(g);
    setIndeterminado(!g.data_fim);
    setSearchProduct('');
    setShowResults(false);
    setItemConfig(null);
    setShowForm(true);
  }

  function openNewForm() {
    setFormGrupo({
      nome_promocao: '',
      data_inicio: new Date().toISOString().split('T')[0],
      data_fim: '',
      status: true,
      itens: []
    });
    setIndeterminado(false);
    setSearchProduct('');
    setShowResults(false);
    setItemConfig(null);
    setShowForm(true);
  }

  const today = new Date().toISOString().split('T')[0];

  // Filtro adaptado para a lista plana
  const filteredPromocoes = promocoesFlat.filter(p => 
    p.nome_promocao.toLowerCase().includes(searchGrid.toLowerCase()) ||
    p.produto_nome.toLowerCase().includes(searchGrid.toLowerCase()) ||
    p.codigo.toLowerCase().includes(searchGrid.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" /> Central de Campanhas
        </h1>
        <button onClick={openNewForm} className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-2 hover:opacity-90 transition shadow-lg shadow-primary/20">
          <Plus className="h-5 w-5" /> Nova Promoção
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={searchGrid} onChange={(e) => setSearchGrid(e.target.value)} placeholder="Pesquisar por nome da campanha, produto ou código..."
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      {loading ? (
        <div className="h-40 rounded-xl bg-card animate-pulse border border-border" />
      ) : (
        <div className={`rounded-xl border border-border bg-card overflow-x-auto ${darkScrollbarClass}`}>
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase font-bold border-b border-border">
              <tr>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Campanha</th>
                <th className="px-4 py-4">Produto</th>
                <th className="px-4 py-4">Lote</th>
                <th className="px-4 py-4">Período</th>
                <th className="px-4 py-4">Valores</th>
                <th className="px-4 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPromocoes.map(p => {
                const isVigente = (!p.data_inicio || p.data_inicio <= today) && (!p.data_fim || p.data_fim >= today);
                const isActive = isVigente && p.status;

                return (
                  <tr key={p.id} className={`transition-colors hover:bg-muted/10 ${!isActive && 'opacity-70'}`}>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-1 rounded-md uppercase font-black tracking-tighter ${isActive ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {isActive ? 'Ativa' : (p.status ? 'Fora do Prazo' : 'Pausada')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">{p.nome_promocao}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground line-clamp-1">{p.produto_nome}</span>
                        <span className="text-[10px] text-muted-foreground">Cód: {p.codigo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-blue-500">{p.lote_codigo}</td>
                    <td className="px-4 py-3 text-[11px]">
                      <div className="flex flex-col text-muted-foreground gap-0.5">
                        <span className="flex items-center gap-1">Início: <b className="text-foreground">{p.data_inicio ? new Date(p.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</b></span>
                        <span className="flex items-center gap-1">Fim: <b className="text-foreground">{p.data_fim ? new Date(p.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'}</b></span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground line-through">{formatCurrency(p.preco_venda)}</span>
                        <span className="text-sm font-black text-primary font-mono">{formatCurrency(p.preco_promocional)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                        <button onClick={() => handleToggleStatusIndividual(p)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title={p.status ? 'Pausar' : 'Ativar'}>
                          {p.status ? <Pause className="h-4 w-4 text-amber-500" /> : <Play className="h-4 w-4 text-emerald-500" />}
                        </button>
                        <button onClick={() => handleEditIndividual(p)} className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors" title="Editar Campanha/Item">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDeleteIndividual(p)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Excluir Item">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPromocoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground border-dashed border-2 rounded-xl m-4">
                    Nenhuma promoção encontrada no banco de dados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* FORMULÁRIO DE CAMPANHA (MASTER/DETAIL) - INTOCADO */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-5xl rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95 my-auto max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <div>
                <h2 className="text-2xl font-black text-foreground">{formGrupo.grupo_id ? 'Editar Campanha' : 'Nova Campanha Promocional'}</h2>
                <p className="text-sm text-muted-foreground">Agrupe vários produtos sob a mesma promoção.</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition-colors"><X className="h-6 w-6" /></button>
            </div>
            
            {/* Scrollable Body */}
            <div className={`p-6 overflow-y-auto space-y-8 ${darkScrollbarClass}`}>
              
              {/* DADOS GERAIS DA CAMPANHA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-2xl bg-secondary/30 border border-border">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-xs font-black text-primary uppercase tracking-widest">Nome da Promoção *</label>
                  <input type="text" value={formGrupo.nome_promocao || ''} onChange={e => setFormGrupo({...formGrupo, nome_promocao: e.target.value})} placeholder="Ex: Black Friday"
                    className="w-full h-12 px-4 rounded-xl border border-input bg-background font-bold focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">Início *</label>
                  <input type="date" value={formGrupo.data_inicio || ''} onChange={e => setFormGrupo({...formGrupo, data_inicio: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-input bg-background font-bold focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-1">Término</label>
                    <button type="button" onClick={() => { setIndeterminado(!indeterminado); if(!indeterminado) setFormGrupo({...formGrupo, data_fim: ''}); }} 
                      className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${indeterminado ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      Indeterminado
                    </button>
                  </div>
                  <input type="date" disabled={indeterminado} value={formGrupo.data_fim || ''} onChange={e => setFormGrupo({...formGrupo, data_fim: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-input bg-background font-bold focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-30 disabled:grayscale" />
                </div>
              </div>

              {/* ÁREA DE ADIÇÃO DE PRODUTOS */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-foreground uppercase tracking-widest border-b border-border pb-2">Produtos Inclusos na Promoção</h3>
                
                {/* Busca e Configuração do Produto */}
                <div className="p-5 rounded-2xl border-2 border-dashed border-border bg-card space-y-4">
                  {!itemConfig ? (
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <input type="text" value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)} onFocus={() => searchProduct.trim().length > 0 && setShowResults(true)}
                        placeholder="Buscar produto para adicionar à promoção..."
                        className="w-full h-14 pl-12 pr-4 rounded-2xl border border-input bg-secondary/50 text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all" />
                      
                      {showResults && (
                        <div className={`absolute top-full left-0 right-0 mt-2 rounded-2xl border border-border bg-card shadow-2xl z-50 max-h-60 overflow-auto ${darkScrollbarClass}`}>
                          {produtosBusca.map((p, idx) => (
                            <button key={p.id + '-' + idx} type="button" onClick={() => handleSelectProduct(p)}
                              className="w-full flex items-center justify-between px-5 py-3 hover:bg-primary/5 text-left border-b border-border transition-colors">
                              <div>
                                <p className="text-sm font-black text-foreground">{p.nome}</p>
                                <p className="text-[10px] text-muted-foreground font-bold mt-0.5">Cód: {p.codigo}</p>
                              </div>
                               <p className="text-sm font-mono font-bold text-foreground">{formatCurrency(p.preco_venda)}</p>
                            </button>
                          ))}
                        </div>
                       )}
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="flex justify-between items-center p-3 rounded-xl bg-primary/10 border border-primary/20">
                        <div>
                          <p className="text-sm font-black text-foreground">{itemConfig.produto_nome}</p>
                          <p className="text-[10px] text-primary font-bold uppercase mt-0.5">Preço Base: {formatCurrency(itemConfig.preco_venda || 0)}</p>
                        </div>
                        <button onClick={() => setItemConfig(null)} className="p-2 rounded-lg bg-background text-destructive hover:bg-destructive hover:text-white transition-all"><X className="h-4 w-4" /></button>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-primary uppercase">Valor Promocional *</label>
                          <input type="text" value={itemConfig.preco_promocional ? formatCurrency(itemConfig.preco_promocional) : 'R$ 0,00'} onChange={(e) => setItemConfig({ ...itemConfig, preco_promocional: parseCurrencyInput(e.target.value) })}
                            className="w-full h-10 px-3 rounded-lg border-2 border-primary bg-primary/5 text-primary font-mono font-bold focus:outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase">Qtd. Mínima</label>
                          <input type="number" min={1} value={itemConfig.quantidade_minima || ''} onChange={(e) => setItemConfig({ ...itemConfig, quantidade_minima: Number(e.target.value) })}
                            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono font-bold" />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black text-muted-foreground uppercase">Qtd. Máxima (Opci)</label>
                          <input type="number" min={1} value={itemConfig.quantidade_maxima || ''} onChange={(e) => setItemConfig({ ...itemConfig, quantidade_maxima: Number(e.target.value) })} placeholder="Ilimitado"
                            className="w-full h-10 px-3 rounded-lg border border-input bg-background font-mono font-bold" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase">Pgto Específico</label>
                          <select value={itemConfig.condicao_pagamento || 'todas'} onChange={(e) => setItemConfig({ ...itemConfig, condicao_pagamento: e.target.value })}
                            className="w-full h-10 px-2 rounded-lg border border-input bg-background text-xs font-bold">
                            <option value="todas">Todas as Formas</option>
                            {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </select>
                        </div>
                      </div>
                      
                      <button onClick={addItemToGroup} className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-black text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                        <CheckSquare className="h-4 w-4" /> Confirmar na Lista
                      </button>
                    </div>
                  )}
                </div>

                {/* Lista de Itens Adicionados */}
                <div className="space-y-2">
                  {formGrupo.itens?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/20">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-foreground">{item.produto_nome}</p>
                        <div className="flex gap-3 text-[10px] text-muted-foreground font-medium mt-1">
                          <span className="bg-background px-1.5 py-0.5 rounded border border-border">Lote: {item.lote_codigo}</span>
                          {item.quantidade_minima > 1 && <span className="text-amber-500 font-bold">Min: {item.quantidade_minima}</span>}
                          {item.quantidade_maxima && <span className="text-red-500 font-bold">Max: {item.quantidade_maxima}</span>}
                          {item.condicao_pagamento !== 'todas' && <span className="text-blue-500 font-bold uppercase">Pgto Restrito</span>}
                        </div>
                      </div>
                       <div className="text-right mx-4">
                        <p className="text-xs text-muted-foreground line-through font-mono">{formatCurrency(item.preco_venda || 0)}</p>
                        <p className="text-sm font-black text-primary font-mono">{formatCurrency(item.preco_promocional)}</p>
                      </div>
                      <button onClick={() => removeItemFromGroup(idx)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  {(!formGrupo.itens || formGrupo.itens.length === 0) && (
                    <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                      Nenhum produto adicionado nesta campanha ainda.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-4 p-6 border-t border-border bg-muted/20 shrink-0">
              <button onClick={() => setShowForm(false)} className="h-12 px-8 rounded-xl border border-border font-bold text-muted-foreground hover:bg-secondary transition-all">Cancelar</button>
              <button onClick={handleSaveGroup} className="h-12 px-10 rounded-xl bg-primary text-primary-foreground font-black flex items-center gap-2 shadow-xl shadow-primary/25 hover:opacity-90 transition-all">
                <Save className="h-5 w-5" /> Salvar Campanha
               </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÚLTIPLOS LOTES */}
      {lotSelectionItem && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95">
             <div className="p-6 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-primary uppercase tracking-tight">Vários Lotes Encontrados</h2>
                <p className="text-sm text-muted-foreground mt-1">Selecione quais lotes deseja configurar.</p>
              </div>
              <button onClick={() => setLotSelectionItem(null)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><X className="h-6 w-6" /></button>
            </div>

            <div className={`p-6 max-h-[50vh] overflow-y-auto space-y-3 ${darkScrollbarClass}`}>
              {lotSelectionItem.lotes?.map(lote => {
                const isSelected = !!selectedLotes.find(l => l.id === lote.id);
                return (
                  <button key={lote.id} onClick={() => toggleLoteSelection(lote)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex justify-between items-center group ${isSelected ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-secondary/10 hover:border-primary/30'}`}>
                    <div className="flex gap-4 items-center">
                       <div className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30 bg-background'}`}>
                        {isSelected && <CheckSquare className="h-4 w-4 text-primary-foreground" />}
                      </div>
                      <div className="space-y-1">
                         <div className="flex items-center gap-2">
                           <span className="text-sm font-black text-foreground">{lote.observacao || 'LOTE SEM OBS.'}</span>
                           <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-black">CÓD: {lote.codigo}</span>
                         </div>
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-bold uppercase">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Val: <b className="text-foreground">{lote.data_validade ? new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR') : '∞'}</b></span>
                          <span className="flex items-center gap-1"><Package className="h-3 w-3" /> Est: <b className="text-foreground">{lote.quantidade_atual}</b></span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-4 bg-muted/10 rounded-b-3xl">
              <button onClick={() => setLotSelectionItem(null)} className="h-10 px-6 rounded-xl border border-border font-bold text-muted-foreground hover:bg-card transition-all">Sair</button>
              <button onClick={confirmMultiLotSelection} 
                className="h-10 px-8 rounded-xl bg-primary text-primary-foreground font-black flex items-center gap-2 hover:opacity-90 shadow-xl shadow-primary/20 transition-all">
                Configurar ({selectedLotes.length}) Lotes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}