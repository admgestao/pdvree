import { useState, useEffect } from 'react';
import { Search, X, Eye, Printer, List, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ValueDisplay } from '@/components/ValueDisplay';
import { useVisibility } from '@/contexts/VisibilityContext';

interface Venda {
  id: string;
  cliente_id: string;
  usuario_id: string;
  subtotal: number;
  desconto: number;
  custo_adicional: number;
  desc_custo_adicional?: string;
  total: number;
  forma_pagamento_id: string;
  troco: number;
  observacao: string;
  criado_em: string;
  cliente_nome?: string;
  forma_nome?: string;
  vendedor_nome?: string;
}

interface VendaItem {
  id: string;
  venda_id: string;
  produto_nome: string;
  quantidade: number;
  preco: number;
  total: number;
  criado_em?: string;
  vendedor_nome?: string;
}

export default function Vendas() {
  const { toggleGlobal } = useVisibility();

  const [activeTab, setActiveTab] = useState<'vendas' | 'itens'>('vendas');
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [todosItens, setTodosItens] = useState<VendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<VendaItem[]>([]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  useEffect(() => {
    load();
  }, [startDate, endDate]);

  async function load() {
    setLoading(true);
    try {
      let queryVendas = supabase.from('vendas').select('*').order('criado_em', { ascending: false });
      if (startDate) queryVendas = queryVendas.gte('criado_em', startDate);
      if (endDate) queryVendas = queryVendas.lte('criado_em', endDate + 'T23:59:59');
      const { data: vendasData } = await queryVendas;

      const [resClientes, resFormas] = await Promise.all([
        supabase.from('pessoas').select('id, nome'),
        supabase.from('formas_pagamento').select('id, nome'),
      ]);

      const mappedVendas = (vendasData || []).map((v: any) => ({
        ...v,
        cliente_nome: resClientes.data?.find(c => c.id === v.cliente_id)?.nome || 'Consumidor final',
        forma_nome: resFormas.data?.find(f => f.id === v.forma_pagamento_id)?.nome || 'Não informado',
      }));
      setVendas(mappedVendas);

      if (mappedVendas.length > 0) {
        const idsVendas = mappedVendas.map(v => v.id);
        const { data: itensData } = await supabase
          .from('vendas_itens')
          .select('*')
          .in('venda_id', idsVendas);

        const mappedItens = (itensData || []).map(item => {
          const vendaPai = mappedVendas.find(v => v.id === item.venda_id);
          return { 
            ...item, 
            criado_em: vendaPai?.criado_em,
            vendedor_nome: vendaPai?.vendedor_nome 
          };
        });
        setTodosItens(mappedItens);
      } else {
        setTodosItens([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(v: Venda) {
    setSelectedVenda(v);
    const { data } = await supabase.from('vendas_itens').select('*').eq('venda_id', v.id);
    setItensDetalhe(data || []);
  }

  function imprimirVenda(venda: Venda, itens: VendaItem[]) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>Venda</title><style>body { font-family: sans-serif; padding:20px } .linha { display:flex; justify-content:space-between; margin-bottom:5px } .obs { font-size: 12px; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px; }</style></head>
        <body>
          <h2>Comprovante</h2>
          <p><b>Data:</b> ${formatDate(venda.criado_em)}</p>
          <p><b>Vendedor:</b> ${venda.vendedor_nome || '-'}</p>
          <p><b>Cliente:</b> ${venda.cliente_nome}</p>
          <hr/>
          ${itens.map(i => `<div class="linha"><span>${i.produto_nome} x${i.quantidade}</span><span>${formatCurrency(i.total)}</span></div>`).join('')}
          <hr/>
          ${venda.desconto > 0 ? `<div class="linha"><span>Desconto:</span><span>- ${formatCurrency(venda.desconto)}</span></div>` : ''}
          ${venda.custo_adicional > 0 ? `<div class="linha"><span>${venda.desc_custo_adicional || 'Adicional'}:</span><span>+ ${formatCurrency(venda.custo_adicional)}</span></div>` : ''}
          <hr/>
          <h3>Total: ${formatCurrency(venda.total)}</h3>
          ${venda.observacao ? `<div class="obs"><b>Obs:</b> ${venda.observacao}</div>` : ''}
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  const searchLower = search.toLowerCase();

  const filteredVendas = vendas.filter((v) =>
    v.cliente_nome?.toLowerCase().includes(searchLower) ||
    v.forma_nome?.toLowerCase().includes(searchLower) ||
    v.vendedor_nome?.toLowerCase().includes(searchLower) ||
    v.id.toLowerCase().includes(searchLower)
  );

  const filteredItens = todosItens.filter((i) => 
    i.produto_nome?.toLowerCase().includes(searchLower) ||
    i.vendedor_nome?.toLowerCase().includes(searchLower) ||
    i.venda_id.toLowerCase().includes(searchLower)
  );

  const totalGeral = activeTab === 'vendas' 
    ? filteredVendas.reduce((s, v) => s + (Number(v.total) || 0), 0)
    : filteredItens.reduce((s, i) => s + (Number(i.total) || 0), 0);

  function imprimirRelatorioGeral() {
    const win = window.open('', '_blank');
    if (!win) return;

    const isVendas = activeTab === 'vendas';
    const titulo = isVendas ? 'Relatório de Vendas' : 'Relatório de Produtos Vendidos';
    const lista = isVendas ? filteredVendas : filteredItens;

    let conteudoTabela = '';

    if (isVendas) {
      conteudoTabela = `
        <table style="width:100%; text-align:left; border-collapse: collapse; margin-top: 15px;">
          <tr style="border-bottom: 2px solid #333;">
            <th style="padding: 8px 0;">Data</th>
            <th style="padding: 8px 0;">Vendedor</th>
            <th style="padding: 8px 0;">Cliente</th>
            <th style="padding: 8px 0;">Pagamento</th>
            <th style="padding: 8px 0; text-align:right;">Total</th>
          </tr>
          ${lista.map((v: any) => `
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 8px 0;">${formatDate(v.criado_em)}</td>
              <td style="padding: 8px 0;">${v.vendedor_nome || '-'}</td>
              <td style="padding: 8px 0;">${v.cliente_nome}</td>
              <td style="padding: 8px 0;">${v.forma_nome}</td>
              <td style="padding: 8px 0; text-align:right;">${formatCurrency(v.total)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    } else {
      conteudoTabela = `
        <table style="width:100%; text-align:left; border-collapse: collapse; margin-top: 15px;">
          <tr style="border-bottom: 2px solid #333;">
            <th style="padding: 8px 0;">Data</th>
            <th style="padding: 8px 0;">Produto</th>
            <th style="padding: 8px 0;">Vendedor</th>
            <th style="padding: 8px 0; text-align:center;">Qtd</th>
            <th style="padding: 8px 0; text-align:right;">Subtotal</th>
          </tr>
          ${lista.map((i: any) => `
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 8px 0;">${formatDate(i.criado_em)}</td>
              <td style="padding: 8px 0;">${i.produto_nome}</td>
              <td style="padding: 8px 0;">${i.vendedor_nome || '-'}</td>
              <td style="padding: 8px 0; text-align:center;">${i.quantidade}</td>
              <td style="padding: 8px 0; text-align:right;">${formatCurrency(i.total)}</td>
            </tr>
          `).join('')}
        </table>
      `;
    }

    win.document.write(`
      <html>
        <head>
          <title>${titulo}</title>
          <style>body { font-family: sans-serif; padding: 30px; color: #333; }</style>
        </head>
        <body>
          <h2>${titulo}</h2>
          <p><b>Período:</b> ${startDate ? formatDate(startDate + 'T00:00:00') : 'Todo o período'} até ${endDate ? formatDate(endDate + 'T00:00:00') : 'Hoje'}</p>
          ${search ? `<p><b>Filtro aplicado:</b> "${search}"</p>` : ''}
          <hr/>
          ${conteudoTabela}
          <br/>
          <h3 style="text-align: right;">Total do Relatório: ${formatCurrency(totalGeral)}</h3>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
          <div className="flex bg-secondary p-1 rounded-lg mt-2 w-fit">
            <button 
              onClick={() => setActiveTab('vendas')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'vendas' ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-accent'}`}
            >
              VENDAS
            </button>
            <button 
              onClick={() => setActiveTab('itens')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'itens' ? 'bg-primary text-primary-foreground shadow-md' : 'hover:bg-accent'}`}
            >
              PRODUTOS VENDIDOS
            </button>
          </div>
        </div>

        <ValueDisplay
          id="total-geral-hist"
          value={formatCurrency(totalGeral)}
          className="font-bold text-2xl text-primary"
        />
      </div>

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
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 px-3 rounded-lg border border-input bg-secondary" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 px-3 rounded-lg border border-input bg-secondary" />
        
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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/50 border-b border-border">
              <th className="p-3 text-left">Data</th>
              {activeTab === 'vendas' ? (
                <>
                  <th className="p-3 text-left">Vendedor(a)</th>
                  <th className="p-3 text-left">Cliente</th>
                  <th className="p-3 text-left hidden md:table-cell">Pagamento</th>
                  <th className="p-3 text-right">Total</th>
                </>
              ) : (
                <>
                  <th className="p-3 text-left">Produto</th>
                  <th className="p-3 text-left">Vendedor(a)</th>
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
              <tr><td colSpan={7} className="p-10 text-center animate-pulse">Carregando dados...</td></tr>
            ) : (activeTab === 'vendas' ? filteredVendas : filteredItens).map((item: any) => (
              <tr 
                key={item.id} 
                onClick={() => activeTab === 'vendas' && openDetail(item)}
                className="border-b border-border hover:bg-accent/30 cursor-pointer"
              >
                <td className="p-3 text-[12px] font-medium opacity-90">
                  {formatDate(item.criado_em)}
                </td>

                {activeTab === 'vendas' ? (
                  <>
                    <td className="p-3 font-medium text-muted-foreground">{item.vendedor_nome || '-'}</td>
                    <td className="p-3 font-medium">{item.cliente_nome}</td>
                    <td className="p-3 hidden md:table-cell">{item.forma_nome}</td>
                    <td className="p-3 text-right font-bold text-primary">{formatCurrency(item.total)}</td>
                  </>
                ) : (
                  <>
                    <td className="p-3 font-medium">{item.produto_nome}</td>
                    <td className="p-3 text-muted-foreground">{item.vendedor_nome || '-'}</td>
                    <td className="p-3 text-center">{item.quantidade}</td>
                    <td className="p-3 text-right">{formatCurrency(item.preco)}</td>
                    <td className="p-3 text-right font-bold">{formatCurrency(item.total)}</td>
                  </>
                )}

                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    {activeTab === 'vendas' ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); openDetail(item); }} className="p-1.5 rounded hover:bg-accent"><Eye size={16}/></button>
                        <button onClick={(e) => { e.stopPropagation(); imprimirVenda(item, todosItens.filter(i => i.venda_id === item.id)); }} className="p-1.5 rounded hover:bg-accent"><Printer size={16}/></button>
                      </>
                    ) : (
                      <button onClick={(e) => {
                        e.stopPropagation();
                        const v = vendas.find(vend => vend.id === item.venda_id);
                        if(v) openDetail(v);
                      }} className="p-1.5 rounded hover:bg-accent"><List size={16}/></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedVenda && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-lg flex items-center gap-2"><Package size={20} className="text-primary"/> Detalhes</h2>
              <button onClick={() => setSelectedVenda(null)} className="p-1 hover:bg-accent rounded-full"><X /></button>
            </div>

            <div className="space-y-1 text-sm border-l-2 border-primary pl-3">
              <p><b>Data:</b> {formatDate(selectedVenda.criado_em)}</p>
              <p><b>Vendedor:</b> {selectedVenda.vendedor_nome || '-'}</p>
              <p><b>Cliente:</b> {selectedVenda.cliente_nome}</p>
              <p><b>Pagamento:</b> {selectedVenda.forma_nome}</p>
            </div>

            <div className="max-h-[200px] overflow-y-auto space-y-2 py-2">
              {itensDetalhe.map(i => (
                <div key={i.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                  <span>{i.produto_nome} <b className="text-primary">x{i.quantidade}</b></span>
                  <span className="font-mono">{formatCurrency(i.total)}</span>
                </div>
              ))}
            </div>

            {/* Composição do Valor Final */}
            <div className="space-y-1.5 border-t border-border/50 pt-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal Itens:</span>
                <span>{formatCurrency(selectedVenda.subtotal)}</span>
              </div>
              {selectedVenda.desconto > 0 && (
                <div className="flex justify-between text-emerald-500 font-bold">
                  <span>Desconto Aplicado:</span>
                  <span>- {formatCurrency(selectedVenda.desconto)}</span>
                </div>
              )}
              {selectedVenda.custo_adicional > 0 && (
                <div className="flex justify-between text-blue-500 font-bold">
                  <span>{selectedVenda.desc_custo_adicional || 'Custo Adicional'}:</span>
                  <span>+ {formatCurrency(selectedVenda.custo_adicional)}</span>
                </div>
              )}
              {selectedVenda.observacao && (
                <div className="mt-3 p-3 bg-secondary/50 rounded-xl text-xs text-muted-foreground border border-border/50">
                  <p className="font-black uppercase mb-1 text-[10px] text-primary">Observações do Pedido:</p>
                  {selectedVenda.observacao}
                </div>
              )}
            </div>

            <div className="bg-secondary p-4 rounded-xl flex justify-between items-center">
              <span className="font-bold text-muted-foreground">TOTAL FINAL</span>
              <span className="text-xl font-black text-primary">{formatCurrency(selectedVenda.total)}</span>
            </div>

            <button 
              onClick={() => imprimirVenda(selectedVenda, itensDetalhe)}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all"
            >
              <Printer size={18}/> IMPRIMIR COMPROVANTE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}