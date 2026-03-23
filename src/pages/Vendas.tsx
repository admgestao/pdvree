import { useState, useEffect } from 'react';
import { Search, X, Eye, Printer, List, Package, Briefcase, TrendingUp, DollarSign, PieChart } from 'lucide-react';
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
  vendedor_nome?: string;
}

interface VendaItem {
  id: string;
  venda_id: string;
  produto_id?: string;
  produto_nome: string;
  quantidade: number;
  preco: number;
  total: number;
  criado_em?: string;
  vendedor_nome?: string;
  produtos?: {
    preco_custo: number; 
  };
}

export default function Vendas() {
  const { toggleGlobal } = useVisibility();

  const [activeTab, setActiveTab] = useState<'vendas' | 'itens' | 'admin'>('vendas');
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [todosItens, setTodosItens] = useState<VendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedVenda, setSelectedVenda] = useState<Venda | null>(null);
  const [itensDetalhe, setItensDetalhe] = useState<VendaItem[]>([]);
  const [dadosEmpresa, setDadosEmpresa] = useState<any>(null);

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
      // Busca dados da empresa para o cabeçalho das impressões
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
      // Busca tudo em paralelo para otimizar
      const [resClientes, resFormas, resItens] = await Promise.all([
        supabase.from('pessoas').select('id, nome'),
        supabase.from('formas_pagamento').select('id, nome'),
        supabase.from('vendas_itens').select('*').in('venda_id', idsVendas)
      ]);

      const itensData = resItens.data || [];
      const produtoIds = [...new Set(itensData.map(i => i.produto_id).filter(Boolean))];

      let produtosData: any[] = [];
      let lotesData: any[] = [];

      // Busca os custos reais nos dois bancos de dados de produtos
      if (produtoIds.length > 0) {
        const [resProdutos, resLotes] = await Promise.all([
          supabase.from('produtos').select('id, custo').in('id', produtoIds),
          supabase.from('produto_lotes').select('produto_id, codigo_barras, custo').in('produto_id', produtoIds)
        ]);
        produtosData = resProdutos.data || [];
        lotesData = resLotes.data || [];
      }

      // 1. Mapeia e calcula o custo dinâmico para CADA item vendido
      const mappedItens = itensData.map(item => {
        let custoUn = 0;
        
        // Verifica se é lote pela regex
        const loteMatch = item.produto_nome?.match(/\(Lote:\s*(.*?)\)/);
        
        if (loteMatch && loteMatch[1]) {
          const codigoLote = loteMatch[1].trim();
          const lote = lotesData.find(l => l.produto_id === item.produto_id && l.codigo_barras === codigoLote);
          
          if (lote && lote.custo !== undefined && lote.custo !== null) {
            custoUn = Number(lote.custo);
          } else {
            // Fallback para o custo do produto
            const prod = produtosData.find(p => p.id === item.produto_id);
            custoUn = prod && prod.custo !== undefined ? Number(prod.custo) : 0;
          }
        } else {
          // Se não for lote, pega do produto normal
          const prod = produtosData.find(p => p.id === item.produto_id);
          custoUn = prod && prod.custo !== undefined ? Number(prod.custo) : 0;
        }

        const vendaPai = vendasData.find((v: any) => v.id === item.venda_id);
        return { 
          ...item, 
          criado_em: vendaPai?.criado_em,
          vendedor_nome: vendaPai?.vendedor_nome,
          produtos: { preco_custo: custoUn } // Armazena o custo calculado na mesma estrutura
        };
      });

      // 2. Mapeia as vendas aplicando a soma dos custos calculados
      const mappedVendas = vendasData.map((v: any) => {
        const itensDestaVenda = mappedItens.filter(i => i.venda_id === v.id);
        
        // Soma o custo (Custo unitário real * Quantidade vendida)
        const totalCustoCalculado = itensDestaVenda.reduce((acc, curr) => acc + (curr.produtos.preco_custo * curr.quantidade), 0);
        
        // Recalcula o lucro líquido baseando-se no custo dinâmico e na marcação de custo no lucro
        const valorCustoAdicional = Number(v.custo_adicional) || 0;
        const lucroCalculado = Number(v.total) - totalCustoCalculado - (v.custo_no_lucro ? 0 : valorCustoAdicional);

        return {
          ...v,
          cliente_nome: resClientes.data?.find(c => c.id === v.cliente_id)?.nome || 'Consumidor final',
          forma_nome: resFormas.data?.find(f => f.id === v.forma_pagamento_id)?.nome || 'Não informado',
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

  // Como já calculamos tudo na função load(), abrir o detalhe fica instantâneo!
  async function openDetail(v: Venda) {
    setSelectedVenda(v);
    const itens = todosItens.filter(i => i.venda_id === v.id);
    setItensDetalhe(itens);
  }

  function imprimirVenda(venda: Venda, itens: VendaItem[]) {
    const win = window.open('', '_blank');
    if (!win) return;

    const cabecalhoEmpresa = dadosEmpresa ? `
      <div style="text-align: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <h1 style="margin: 0; font-size: 18px;">${dadosEmpresa.nome_fantasia || dadosEmpresa.razao_social}</h1>
        <p style="margin: 2px 0; font-size: 12px;">${dadosEmpresa.endereco}, ${dadosEmpresa.numero} - ${dadosEmpresa.bairro}</p>
        <p style="margin: 2px 0; font-size: 12px;">${dadosEmpresa.cidade} - ${dadosEmpresa.contato}</p>
        ${dadosEmpresa.cnpj ? `<p style="margin: 2px 0; font-size: 12px;">CNPJ: ${dadosEmpresa.cnpj}</p>` : ''}
      </div>
    ` : '';

    win.document.write(`
      <html>
        <head><title>Venda</title><style>body { font-family: sans-serif; padding:20px } .linha { display:flex; justify-content:space-between; margin-bottom:5px } .obs { font-size: 12px; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px; }</style></head>
        <body>
          ${cabecalhoEmpresa}
          <h2 style="text-align: center;">Comprovante de Venda</h2>
          <p><b>Data:</b> ${formatDate(venda.criado_em)}</p>
          <p><b>Vendedor:</b> ${venda.vendedor_nome || '-'}</p>
          <p><b>Cliente:</b> ${venda.cliente_nome}</p>
          <hr/>
          ${itens.map(i => `<div class="linha"><span>${i.produto_nome} x${i.quantidade}</span><span>${formatCurrency(i.total)}</span></div>`).join('')}
          <hr/>
          ${venda.desconto > 0 ? `<div class="linha"><span>Desconto:</span><span>- ${formatCurrency(venda.desconto)}</span></div>` : ''}
          ${venda.custo_adicional > 0 ? `<div class="linha"><span>${venda.desc_custo_adicional || 'Adicional'}:</span><span>+ ${formatCurrency(venda.custo_adicional)}</span></div>` : ''}
          <hr/>
          <h3 style="text-align: right;">Total: ${formatCurrency(venda.total)}</h3>
          ${venda.observacao ? `<div class="obs"><b>Obs:</b> ${venda.observacao}</div>` : ''}
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
            th, td { border-bottom: 1px solid #ccc; padding: 6px 0; text-align: right; }
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
            <p><b>Pagamento:</b> ${venda.forma_nome}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Produto</th>
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
  const totalGeral = activeTab === 'itens' 
    ? filteredItens.reduce((s, i) => s + (Number(i.total) || 0), 0)
    : filteredVendas.reduce((s, v) => s + (Number(v.total) || 0), 0);

  const adminTotalReceita = filteredVendas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const adminTotalCusto = filteredVendas.reduce((s, v) => s + (Number(v.total_custo) || 0), 0);
  const adminTotalLucro = filteredVendas.reduce((s, v) => s + (Number(v.lucro_liquido) || 0), 0);
  // Soma apenas os custos que abatem do lucro para o indicador do topo
  const adminCustosAdd = filteredVendas.reduce((s, v) => s + (v.custo_no_lucro ? 0 : (Number(v.custo_adicional) || 0)), 0);
  const adminMargemOperacional = adminTotalReceita > 0 ? (adminTotalLucro / adminTotalReceita) * 100 : 0;

  function imprimirRelatorioGeral() {
    const win = window.open('', '_blank');
    if (!win) return;

    const isVendas = activeTab === 'vendas' || activeTab === 'admin';
    const titulo = isVendas ? 'Relatório de Vendas' : 'Relatório de Produtos Vendidos';
    const lista = isVendas ? filteredVendas : filteredItens;

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
          ${cabecalhoEmpresa}
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

  const isAdminTab = activeTab === 'admin';

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
              {adminCustosAdd > 0 && <span className="text-[10px] text-muted-foreground mb-1">(-${formatCurrency(adminCustosAdd)} extras)</span>}
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
                    <th className="p-3 text-left min-w-[200px]">Produto</th>
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
                <tr><td colSpan={8} className="p-10 text-center animate-pulse">Carregando dados...</td></tr>
              ) : (activeTab === 'itens' ? filteredItens : filteredVendas).map((item: any) => {
                const itemTotalCusto = Number(item.total_custo) || 0;
                const itemLucroLiquido = Number(item.lucro_liquido) || 0;

                return (
                  <tr 
                    key={item.id} 
                    onClick={() => (activeTab === 'vendas' || activeTab === 'admin') && openDetail(item)}
                    className="border-b border-border hover:bg-accent/30 cursor-pointer transition-colors"
                  >
                    <td className="p-3 text-[12px] font-medium opacity-90 whitespace-nowrap">
                      {formatDate(item.criado_em)}
                    </td>

                    {activeTab === 'vendas' && (
                      <>
                        <td className="p-3 font-medium text-muted-foreground">{item.vendedor_nome || '-'}</td>
                        <td className="p-3 font-medium">{item.cliente_nome}</td>
                        <td className="p-3 hidden md:table-cell">{item.forma_nome}</td>
                        <td className="p-3 text-right font-bold text-primary">{formatCurrency(item.total)}</td>
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
                        <td className="p-3 text-muted-foreground">{item.vendedor_nome || '-'}</td>
                        <td className="p-3 text-center">{item.quantidade}</td>
                        <td className="p-3 text-right">{formatCurrency(item.preco)}</td>
                        <td className="p-3 text-right font-bold">{formatCurrency(item.total)}</td>
                      </>
                    )}

                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        {activeTab === 'vendas' || activeTab === 'admin' ? (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openDetail(item); }} className="p-1.5 rounded hover:bg-accent"><Eye size={16}/></button>
                            <button onClick={(e) => { 
                              e.stopPropagation(); 
                              activeTab === 'admin' ? imprimirVendaAdmin(item, todosItens.filter(i => i.venda_id === item.id)) : imprimirVenda(item, todosItens.filter(i => i.venda_id === item.id)); 
                            }} className="p-1.5 rounded hover:bg-accent"><Printer size={16}/></button>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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

            <div className={`space-y-1 text-sm border-l-2 pl-3 ${isAdminTab ? 'border-blue-500' : 'border-primary'}`}>
              <p><b>Data:</b> {formatDate(selectedVenda.criado_em)}</p>
              <p><b>Vendedor:</b> {selectedVenda.vendedor_nome || '-'}</p>
              <p><b>Cliente:</b> {selectedVenda.cliente_nome}</p>
              <p><b>Pagamento:</b> {selectedVenda.forma_nome}</p>
            </div>

            <div className="max-h-[250px] overflow-y-auto space-y-2 py-2 pr-2">
              {itensDetalhe.map(i => {
                const custoUnitario = i.produtos?.preco_custo || 0;
                const lucroItem = i.total - (custoUnitario * i.quantidade);

                return (
                  <div key={i.id} className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                    <div className="flex flex-col">
                      <span>{i.produto_nome} <b className={isAdminTab ? 'text-blue-500' : 'text-primary'}>x{i.quantidade}</b></span>
                      {isAdminTab && (
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          Custo Un: <span className="text-orange-400">{formatCurrency(custoUnitario)}</span> | Venda Un: {formatCurrency(i.quantidade > 0 ? i.total / i.quantidade : 0)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="font-mono font-bold">{formatCurrency(i.total)}</span>
                      {isAdminTab && (
                        <span className="text-[10px] text-green-500 font-bold mt-0.5">
                          Lucro: {formatCurrency(lucroItem)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

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
                <div className={`flex justify-between font-bold ${selectedVenda.custo_no_lucro && isAdminTab ? 'text-green-500' : 'text-red-500'}`}>
                  <span>{selectedVenda.desc_custo_adicional || 'Custo Adicional'}:</span>
                  <span>{selectedVenda.custo_no_lucro && isAdminTab ? '+' : '+'} {formatCurrency(selectedVenda.custo_adicional)}</span>
                </div>
              )}
              
              {isAdminTab && (
                <>
                  <div className="flex justify-between text-orange-400 font-bold border-t border-border/30 pt-1 mt-1">
                    <span>Custo Total Estoque:</span>
                    <span>- {formatCurrency(Number(selectedVenda.total_custo) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-green-500 font-black pt-1">
                    <span>LUCRO LÍQUIDO FINAL:</span>
                    <span>{formatCurrency(Number(selectedVenda.lucro_liquido) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-blue-500 font-bold">
                    <span>Margem Operacional:</span>
                    <span>{selectedVenda.total > 0 ? ((Number(selectedVenda.lucro_liquido) || 0) / selectedVenda.total * 100).toFixed(2) : '0.00'}%</span>
                  </div>
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
              onClick={() => isAdminTab ? imprimirVendaAdmin(selectedVenda, itensDetalhe) : imprimirVenda(selectedVenda, itensDetalhe)}
              className={`w-full font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all text-white ${isAdminTab ? 'bg-blue-600' : 'bg-primary'}`}
            >
              <Printer size={18}/> {isAdminTab ? 'IMPRIMIR COMPROVANTE INTERNO' : 'IMPRIMIR COMPROVANTE'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}