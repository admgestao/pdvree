import { useState, useEffect } from 'react';
import { Package, Plus, Search, Pencil, Trash2, X, Save, Camera, Printer, Filter, DollarSign, BarChart3, TrendingUp, Boxes } from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Html5QrcodeScanner } from 'html5-qrcode';

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
  criado_em: string;
  valor_estoque: number;
  lucro_estoque: number;
  lucro_produto: number;
}

const emptyProduct: Partial<Produto> = {
  nome: '', marca: '', codigo: '', unidade: 'Und', categoria: '', fornecedor: '',
  custo: 0, preco_venda: 0, margem: 0, estoque_atual: 0, estoque_minimo: 0,
  ativo: true, data_validade: '', data_entrada: new Date().toISOString().split('T')[0],
  valor_estoque: 0, lucro_estoque: 0, lucro_produto: 0,
};

export default function Produtos() {
  const { user, isAdmin } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<Partial<Produto>>(emptyProduct);
  
  const [fornecedores, setFornecedores] = useState<{ nome: string }[]>([]);
  const [categoriasExistentes, setCategoriasExistentes] = useState<string[]>([]);
  
  const [scanning, setScanning] = useState(false);
  const [maxEstoqueFilter, setMaxEstoqueFilter] = useState<number>(999);

  useEffect(() => { 
    load();
    loadAuxiliarData();
  }, []);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (scanning) {
      scanner = new Html5QrcodeScanner("reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.777778
      }, false);
      scanner.render((decodedText) => {
        updateField('codigo', decodedText);
        setScanning(false);
        scanner?.clear();
        toast.success("Código lido com sucesso!");
      }, (error) => {});
    }
    return () => {
      if (scanner) {
        scanner.clear().catch(err => console.error("Erro ao fechar scanner", err));
      }
    };
  }, [scanning]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('produtos').select('*').order('nome');
    setProdutos(data || []);
    if (data) {
      const cats = Array.from(new Set(data.map(p => p.categoria).filter(Boolean)));
      setCategoriasExistentes(cats);
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

  const filtered = produtos.filter((p) => {
    const matchesSearch = 
      p.nome?.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria?.toLowerCase().includes(search.toLowerCase());
    
    const matchesEstoque = p.estoque_atual <= maxEstoqueFilter;

    return matchesSearch && matchesEstoque;
  });

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
    setShowForm(true);
  }

  function openEdit(p: Produto) {
    if (!isAdmin) { toast.error('Apenas administradores podem editar.'); return; }
    setEditing(p);
    setForm({ ...p });
    setShowForm(true);
  }

  async function handleDelete(p: Produto) {
    if (!isAdmin) { toast.error('Apenas administradores podem excluir.'); return; }
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
      next.margem = Number((((venda - custo) / custo) * 100).toFixed(2));
    } else if (field === 'margem' && custo > 0) {
      venda = custo * (1 + Number(next.margem) / 100);
      next.preco_venda = Number(venda.toFixed(2));
    }
    
    next.lucro_produto = venda - custo;
    next.valor_estoque = custo * estoque;
    next.lucro_estoque = next.lucro_produto * estoque;
    setForm(next);
  }

  async function handleSave() {
    if (!form.nome) { toast.error('Nome é obrigatório'); return; }
    const payload = {
      nome: form.nome, marca: form.marca || '', codigo: form.codigo || '',
      unidade: form.unidade || 'Und', categoria: form.categoria || '',
      fornecedor: form.fornecedor || '',
      custo: Number(form.custo) || 0,
      preco_venda: Number(form.preco_venda) || 0,
      margem: Number(form.margem) || 0,
      estoque_atual: Number(form.estoque_atual) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ativo: form.ativo !== false,
      data_validade: form.data_validade || null,
      data_entrada: form.data_entrada || null,
      valor_estoque: Number(form.valor_estoque) || 0,
      lucro_estoque: Number(form.lucro_estoque) || 0,
      lucro_produto: Number(form.lucro_produto) || 0,
    };
    if (editing) {
      const { error } = await supabase.from('produtos').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar: ' + error.message); return; }
      await logAction(user?.name || '', 'editar_produto', form.nome || '');
      toast.success('Produto atualizado');
    } else {
      const { error } = await supabase.from('produtos').insert(payload);
      if (error) { toast.error('Erro ao cadastrar: ' + error.message); return; }
      await logAction(user?.name || '', 'cadastrar_produto', form.nome || '');
      toast.success('Produto cadastrado');
    }
    setShowForm(false);
    load();
    loadAuxiliarData();
  }

  function genCode() {
    updateField('codigo', 'P' + String(Date.now()).slice(-6));
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in text-zinc-100">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-bold">Cadastro de Produtos</h1>
        <div className="flex gap-2">
          <button onClick={imprimirRelatorio} className="h-9 px-4 rounded-lg bg-zinc-800 text-white text-sm font-medium flex items-center gap-2 hover:bg-zinc-700 transition border border-zinc-700">
            <Printer className="h-4 w-4" /> Relatório
          </button>
          <button onClick={openNew} className="h-9 px-4 rounded-lg bg-orange-500 text-white text-sm font-medium flex items-center gap-2 hover:bg-orange-600 transition shadow-lg shadow-orange-500/20">
            <Plus className="h-4 w-4" /> Novo Produto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase">Total Produtos</span>
            <Boxes className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold">{totalProdutos}</p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase">Total Estoque (Custo)</span>
            <DollarSign className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-orange-400">{formatCurrency(valorTotalEstoqueCusto)}</p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase">Total Venda (Estoque)</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-green-400">{formatCurrency(valorTotalVendaPotencial)}</p>
        </div>
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase">Lucro Total</span>
            <BarChart3 className="h-4 w-4" />
          </div>
          <p className="text-2xl font-mono font-bold text-blue-400">{formatCurrency(lucroTotalProjetado)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código ou categoria..."
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        
        <div className="flex flex-col justify-center px-2">
          <label className="text-[10px] uppercase text-zinc-500 font-bold mb-1 flex justify-between">
            Filtro de Estoque: <span>Até {maxEstoqueFilter === 999 ? '∞' : maxEstoqueFilter}</span>
          </label>
          <input 
            type="range" min="0" max="100" step="1" 
            value={maxEstoqueFilter > 100 ? 100 : maxEstoqueFilter} 
            onChange={(e) => setMaxEstoqueFilter(e.target.valueAsNumber === 100 ? 999 : e.target.valueAsNumber)}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="h-32 bg-zinc-900 animate-pulse rounded-xl border border-zinc-800" />
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 font-medium">Nome</th>
                  <th className="p-3 font-medium text-right">Custo Un.</th>
                  <th className="p-3 font-medium text-right">Estoque</th>
                  <th className="p-3 font-medium text-right">Vl. Estoque</th>
                  <th className="p-3 font-medium text-right">Vl. Venda Tot.</th>
                  <th className="p-3 font-medium text-right">Lucro Tot.</th>
                  <th className="p-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isZerado = p.estoque_atual <= 0;
                  const vlEstoque = Number(p.custo) * Number(p.estoque_atual);
                  const vlVendaTot = Number(p.preco_venda) * Number(p.estoque_atual);
                  const vlLucroTot = vlVendaTot - vlEstoque;

                  return (
                    <tr 
                      key={p.id} 
                      className={`border-b border-zinc-800 hover:bg-white/5 transition-colors ${isZerado ? 'animate-pulse bg-red-900/20 text-red-400' : ''}`}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex flex-col">
                          <span>{p.nome}</span>
                          <span className="text-[10px] text-zinc-500">{p.categoria || 'Geral'}</span>
                        </div>
                        {isZerado && <span className="mt-1 text-[10px] bg-red-500 text-white px-1 rounded uppercase w-fit">Sem Estoque</span>}
                      </td>
                      <td className="p-3 text-right font-mono text-orange-400/80">{formatCurrency(p.custo)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${isZerado ? 'text-red-500' : ''}`}>{p.estoque_atual} {p.unidade}</td>
                      <td className="p-3 text-right font-mono text-zinc-300">{formatCurrency(vlEstoque)}</td>
                      <td className="p-3 text-right font-mono text-green-400">{formatCurrency(vlVendaTot)}</td>
                      <td className="p-3 text-right font-mono text-blue-400 font-bold">{formatCurrency(vlLucroTot)}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-500/10 text-zinc-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <h2 className="text-lg font-bold text-orange-500">{editing ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-white transition"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Nome *</label>
                <input value={form.nome || ''} onChange={(e) => updateField('nome', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Código</label>
                <div className="flex gap-2">
                  <input value={form.codigo || ''} onChange={(e) => updateField('codigo', e.target.value)}
                    className="flex-1 h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm font-mono focus:outline-none" />
                  <button type="button" onClick={() => setScanning(true)} className="h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-1" title="Escanear com a câmera">
                    <Camera className="h-4 w-4" />
                  </button>
                  <button onClick={genCode} className="h-10 px-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition">Gerar</button>
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-1">
                  <label className="text-xs font-bold text-orange-400 uppercase">Custo</label>
                  <input type="text" value={formatCurrency(form.custo || 0)} onChange={(e) => updateField('custo', e.target.value)}
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-orange-400 font-mono" />
                </div>
                <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-1">
                  <label className="text-xs font-bold text-blue-400 uppercase">Margem (%)</label>
                  <input type="number" step="0.01" value={form.margem || ''} onChange={(e) => updateField('margem', e.target.value)}
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-blue-400 font-mono" />
                </div>
                <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/30 space-y-1">
                  <label className="text-xs font-bold text-green-400 uppercase">Venda</label>
                  <input type="text" value={formatCurrency(form.preco_venda || 0)} onChange={(e) => updateField('preco_venda', e.target.value)}
                    className="w-full bg-transparent border-none p-0 focus:ring-0 text-green-400 font-mono" />
                </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-3 gap-2">
                <div className="p-2 border border-zinc-800 rounded bg-zinc-900 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Lucro/Un</p>
                  <p className="font-bold text-green-500">{formatCurrency(form.lucro_produto || 0)}</p>
                </div>
                <div className="p-2 border border-zinc-800 rounded bg-zinc-900 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Valor Est.</p>
                  <p className="font-bold text-zinc-300">{formatCurrency(form.valor_estoque || 0)}</p>
                </div>
                <div className="p-2 border border-zinc-800 rounded bg-zinc-900 text-center">
                  <p className="text-[10px] text-zinc-500 uppercase">Lucro Est.</p>
                  <p className="font-bold text-orange-500">{formatCurrency(form.lucro_estoque || 0)}</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Categoria</label>
                <input list="cats" value={form.categoria || ''} onChange={(e) => updateField('categoria', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none" />
                <datalist id="cats">
                  {categoriasExistentes.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Fornecedor</label>
                <input list="forns" value={form.fornecedor || ''} onChange={(e) => updateField('fornecedor', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none" />
                <datalist id="forns">
                  {fornecedores.map(f => <option key={f.nome} value={f.nome} />)}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Estoque Atual</label>
                <input type="number" value={form.estoque_atual || ''} onChange={(e) => updateField('estoque_atual', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase">Unidade</label>
                <input value={form.unidade || 'Und'} onChange={(e) => updateField('unidade', e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-sm focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
              <button onClick={() => setShowForm(false)} className="px-4 text-zinc-400 hover:text-white transition">Cancelar</button>
              <button onClick={handleSave} className="h-10 px-6 bg-orange-500 rounded-lg font-bold flex items-center gap-2 hover:bg-orange-600 transition">
                <Save className="h-4 w-4" /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {scanning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md bg-zinc-900 rounded-xl overflow-hidden relative">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-white font-bold">Escanear Código</h3>
              <button onClick={() => setScanning(false)} className="text-zinc-500"><X /></button>
            </div>
            <div id="reader" className="w-full"></div>
            <div className="p-4 text-center text-zinc-500 text-xs">
              Aponte a câmera para o código de barras
            </div>
          </div>
        </div>
      )}
    </div>
  );
}