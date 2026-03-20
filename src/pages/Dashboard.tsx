import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Receipt, Eye, EyeOff, 
  Package, ArrowUpRight, Printer, 
  Activity, ShoppingCart, Layers, Filter, 
  Calendar, Wallet, Zap, Target, BarChart3
} from 'lucide-react';
import { useVisibility } from '@/contexts/VisibilityContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { supabase } from '@/lib/supabase';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export default function Dashboard() {
  const { globalVisible, toggleGlobal } = useVisibility();
  const [localVisible, setLocalVisible] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState('mes');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [metrics, setMetrics] = useState({
    totalVendasCount: 0, valorTotal: 0, ticketMedio: 0, 
    produtosCadastrados: 0, lucroEstimado: 0, valorEmEstoque: 0 
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [topProdutos, setTopProdutos] = useState<any[]>([]);

  useEffect(() => {
    if (period !== 'personalizado' || (dataInicio && dataFim)) {
      loadData();
    }
  }, [period, dataInicio, dataFim]);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      let startDate: Date;
      let endDate = new Date();

      if (period === 'hoje') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      } else if (period === 'semana') {
        startDate = new Date();
        startDate.setDate(now.getDate() - 7);
      } else if (period === 'personalizado' && dataInicio && dataFim) {
        startDate = new Date(dataInicio);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(dataFim);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const { data: vendas } = await supabase
        .from('vendas')
        .select('id, total, criado_em') 
        .gte('criado_em', startDate.toISOString())
        .lte('criado_em', endDate.toISOString())
        .order('criado_em', { ascending: true });

      const { data: prods } = await supabase
        .from('produtos')
        .select('preco_custo, estoque_atual, nome, estoque_minimo');

      if (vendas && vendas.length > 0) {
        const idsVendas = vendas.map(v => v.id);
        const { data: itensVendidos } = await supabase
          .from('vendas_itens')
          .select('produto_nome, quantidade')
          .in('venda_id', idsVendas);

        const rankingMap: Record<string, number> = {};
        itensVendidos?.forEach(item => {
          rankingMap[item.produto_nome] = (rankingMap[item.produto_nome] || 0) + (item.quantidade || 0);
        });

        const sortedRanking = Object.entries(rankingMap)
          .map(([name, sales]) => ({ name, sales }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5);

        setTopProdutos(sortedRanking);
      } else {
        setTopProdutos([]);
      }

      const valorTotal = vendas?.reduce((s, v) => s + (Number(v.total) || 0), 0) || 0;
      const totalEstoque = prods?.reduce((acc, p) => acc + (Number(p.preco_custo || 0) * Number(p.estoque_atual || 0)), 0) || 0;

      setMetrics({
        totalVendasCount: vendas?.length || 0,
        valorTotal,
        ticketMedio: vendas?.length ? valorTotal / vendas.length : 0,
        produtosCadastrados: prods?.length || 0,
        lucroEstimado: valorTotal * 0.35,
        valorEmEstoque: totalEstoque
      });

      const grouped: any = {};
      vendas?.forEach(v => {
        const d = new Date(v.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        grouped[d] = (grouped[d] || 0) + Number(v.total);
      });

      const chartFormatted = Object.entries(grouped).map(([name, valor]) => ({ name, valor }));
      setChartData(chartFormatted.length > 0 ? chartFormatted : [{ name: '-', valor: 0 }]);
    } catch (e) { 
      console.error(e);
    } finally { 
      setLoading(false);
    }
  }

  const handlePrint = () => window.print();
  const isVisible = (id: string) => globalVisible && localVisible[id] !== false;

  const renderVal = (v: number, id: string, type: 'currency' | 'number' | 'percent' = 'currency') => {
    if (!isVisible(id)) return '••••••';
    if (type === 'percent') return `${v.toFixed(1)}%`;
    return type === 'currency' ? formatCurrency(v) : v.toString();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 min-h-screen bg-background text-foreground transition-colors duration-300 print:bg-white">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground uppercase">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
             <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
             <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Análise de Dados em Tempo Real</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-card p-1.5 rounded-2xl border border-border shadow-sm print:hidden">
          {period === 'personalizado' && (
            <div className="flex items-center gap-2 px-3 border-r border-border py-1 animate-in fade-in">
              <Calendar size={14} className="text-primary" />
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-transparent border-none text-[11px] font-bold outline-none text-foreground" />
              <span className="text-muted-foreground">/</span>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-transparent border-none text-[11px] font-bold outline-none text-foreground" />
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2">
            <Filter size={14} className="text-muted-foreground" />
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)} 
              className="bg-card border-none text-[11px] font-bold focus:ring-0 cursor-pointer outline-none uppercase text-foreground py-1"
            >
              <option value="hoje" className="bg-card">Hoje</option>
              <option value="semana" className="bg-card">7 Dias</option>
              <option value="mes" className="bg-card">Este Mês</option>
              <option value="personalizado" className="bg-card">Personalizado</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pr-1">
            <button onClick={toggleGlobal} className="p-2 hover:bg-secondary rounded-xl transition-colors text-muted-foreground">
              {globalVisible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-[11px] font-bold uppercase transition-transform active:scale-95 shadow-sm">
              <Printer size={15} /> Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* GRID DE MÉTRICAS - AGORA COM 5 INDICADORES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { id: 'faturamento', label: 'Receita Total', value: metrics.valorTotal, icon: DollarSign, color: 'text-emerald-500' },
          { id: 'lucro', label: 'Margem de Lucro', value: metrics.lucroEstimado, icon: TrendingUp, color: 'text-primary' },
          { id: 'margem_op', label: 'Margem Operacional', value: 35.0, icon: Layers, color: 'text-orange-500', type: 'percent' },
          { id: 'vendas_vol', label: 'Transações', value: metrics.totalVendasCount, icon: ShoppingCart, color: 'text-blue-500', type: 'number' },
          { id: 'ticket', label: 'Ticket Médio', value: metrics.ticketMedio, icon: BarChart3, color: 'text-amber-500' },
        ].map(card => (
          <div key={card.id} className="bg-card border border-border p-5 rounded-[24px] hover:shadow-md transition-all group relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <div className={`p-3 rounded-xl bg-secondary ${card.color} border border-border`}>
                <card.icon size={20} />
              </div>
              <button onClick={() => setLocalVisible(p => ({...p, [card.id]: !isVisible(card.id)}))} className="text-muted-foreground/30 hover:text-foreground transition-colors">
                {isVisible(card.id) ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            <div className="mt-4 relative z-10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{card.label}</p>
              <h3 className="text-xl font-bold tracking-tight mt-1">
                {renderVal(card.value, card.id, (card.type as any) || 'currency')}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* SEÇÃO DE ANÁLISE GRÁFICA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-[32px] p-6 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <Activity size={18} className="text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest">Performance de Vendas</h2>
            </div>
            <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
              <span className="text-[9px] font-bold text-primary uppercase">Sincronizado</span>
            </div>
          </div>
          
          <div className={`h-[320px] w-full transition-opacity duration-500 ${loading ? 'opacity-20' : 'opacity-100'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'currentColor', fontSize: 10, fontWeight: 600, opacity: 0.5}} dy={10} />
                <YAxis hide={!globalVisible} axisLine={false} tickLine={false} tick={{fill: 'currentColor', fontSize: 10, fontWeight: 600, opacity: 0.5}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1 }}
                  formatter={(value: number) => [formatCurrency(value), 'Valor']}
                />
                <Area type="monotone" dataKey="valor" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RANKING DE PRODUTOS */}
        <div className="bg-card border border-border rounded-[32px] p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <Target size={18} className="text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest">Produtos em Destaque</h2>
          </div>

          <div className="space-y-4 flex-1">
            {loading ? [1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-secondary animate-pulse rounded-2xl" />) : 
              topProdutos.map((prod, idx) => (
                <div key={idx} className="flex flex-col p-3 bg-secondary/40 rounded-2xl border border-border/50 group hover:border-primary/30 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[11px] font-bold uppercase truncate max-w-[150px]">{prod.name}</span>
                    <span className="text-[11px] font-black text-primary">{prod.sales} UN</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-1000" 
                      style={{ width: `${(prod.sales / topProdutos[0].sales) * 100}%` }} 
                    />
                  </div>
                </div>
              ))
            }
          </div>

          <div className="mt-6 p-4 bg-primary text-primary-foreground rounded-2xl flex items-center justify-between shadow-lg shadow-primary/20">
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase opacity-80">Volume Período</span>
              <span className="text-lg font-black leading-none">{metrics.totalVendasCount} Unidades</span>
            </div>
            <Zap size={20} fill="currentColor" />
          </div>
        </div>
      </div>
    </div>
  );
}