import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Receipt, Eye, EyeOff, 
  Package, AlertTriangle, ArrowUpRight, 
  ChevronRight, Archive, Activity, ShoppingCart,
  Layers, Filter, Calendar
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

interface DashMetrics {
  totalVendasCount: number;
  valorTotal: number;
  ticketMedio: number;
  produtosCadastrados: number;
  estoqueBaixo: number;
  lucroEstimado: number;
  valorEmEstoque: number;
}

export default function Dashboard() {
  const { globalVisible, toggleGlobal } = useVisibility();
  const [localVisible, setLocalVisible] = useState<Record<string, boolean>>({});
  const [period, setPeriod] = useState('mes');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashMetrics>({
    totalVendasCount: 0, valorTotal: 0, ticketMedio: 0, 
    produtosCadastrados: 0, estoqueBaixo: 0, lucroEstimado: 0,
    valorEmEstoque: 0 
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
          .slice(0, 6);
        
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
        estoqueBaixo: prods?.filter(p => (p.estoque_atual || 0) <= (p.estoque_minimo || 5)).length || 0,
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

  const isVisible = (id: string) => globalVisible && localVisible[id] !== false;
  const renderVal = (v: number, id: string, type: 'currency' | 'number' = 'currency') => {
    if (!isVisible(id)) return '••••••';
    return type === 'currency' ? formatCurrency(v) : v.toString();
  };

  return (
    <div className="p-4 md:p-8 space-y-8 min-h-screen bg-[#050505] text-white font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)]" />
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80">Live Engine</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter flex items-center gap-3 italic uppercase">
             PERFORMANCE
          </h1>
          <p className="text-muted-foreground text-xs font-medium mt-1 opacity-50">
            Análise estratégica de faturamento e fluxo operacional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-zinc-900/50 p-2 rounded-3xl border border-white/5 backdrop-blur-xl">
          {period === 'personalizado' && (
            <div className="flex items-center gap-2 px-2 border-r border-white/10 mr-2 py-1 animate-in slide-in-from-left-2">
              <Calendar size={14} className="text-primary" />
              <input 
                type="date" 
                value={dataInicio} 
                onChange={(e) => setDataInicio(e.target.value)}
                className="bg-transparent border-none text-[10px] font-bold uppercase outline-none focus:ring-0"
              />
              <span className="text-white/20 text-[10px] font-black">/</span>
              <input 
                type="date" 
                value={dataFim} 
                onChange={(e) => setDataFim(e.target.value)}
                className="bg-transparent border-none text-[10px] font-bold uppercase outline-none focus:ring-0"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button 
              onClick={toggleGlobal} 
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black transition-all ${globalVisible ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground'}`}
            >
              {globalVisible ? <Eye size={14} /> : <EyeOff size={14} />} {globalVisible ? 'VISÍVEL' : 'OCULTO'}
            </button>
            
            <div className="h-8 w-[1px] bg-white/10 mx-1" />

            <div className="relative flex items-center gap-2 px-3">
              <Filter size={14} className="text-muted-foreground" />
              <select 
                value={period} 
                onChange={(e) => setPeriod(e.target.value)} 
                className="bg-transparent border-none text-[10px] font-black focus:ring-0 cursor-pointer outline-none uppercase tracking-widest text-foreground pr-8"
              >
                <option value="hoje" className="bg-zinc-950">Hoje</option>
                <option value="semana" className="bg-zinc-950">7 Dias</option>
                <option value="mes" className="bg-zinc-950">Mês Vigente</option>
                <option value="personalizado" className="bg-zinc-950">Personalizado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* METRIC GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { id: 'faturamento', label: 'Faturamento Total', value: metrics.valorTotal, icon: DollarSign, color: 'text-emerald-400', type: 'currency' },
          { id: 'lucro', label: 'Lucro Estimado', value: metrics.lucroEstimado, icon: TrendingUp, color: 'text-primary', type: 'currency' },
          { id: 'vendas_vol', label: 'Volume de Vendas', value: metrics.totalVendasCount, icon: ShoppingCart, color: 'text-blue-400', type: 'number' },
          { id: 'ticket', label: 'Ticket Médio', value: metrics.ticketMedio, icon: Receipt, color: 'text-amber-400', type: 'currency' },
        ].map(card => (
          <div key={card.id} className="bg-[#0f0f0f] border border-white/5 p-7 rounded-[32px] hover:border-primary/40 transition-all duration-500 group relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <div className={`p-4 rounded-2xl bg-white/5 ${card.color} border border-white/5 shadow-inner`}>
                <card.icon size={22} />
              </div>
              <button onClick={() => setLocalVisible(p => ({...p, [card.id]: !isVisible(card.id)}))} className="opacity-20 hover:opacity-100 transition-opacity p-2">
                {isVisible(card.id) ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
            
            <div className="mt-6 relative z-10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">{card.label}</p>
              <h3 className={`text-3xl font-black tabular-nums tracking-tighter ${loading ? 'animate-pulse opacity-20' : ''}`}>
                {renderVal(card.value, card.id, card.type as any)}
              </h3>
            </div>
            <card.icon size={120} className={`absolute -right-8 -bottom-8 opacity-[0.02] group-hover:opacity-[0.05] transition-all duration-700 group-hover:scale-110 ${card.color}`} />
          </div>
        ))}
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-[#0f0f0f] border border-white/5 rounded-[40px] p-8 shadow-2xl">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
                <Activity size={18} className="text-primary" /> Fluxo de Vendas
              </h2>
              <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase opacity-40">Desempenho financeiro temporal</p>
            </div>
            {!loading && (
              <div className="px-4 py-2 bg-primary/5 border border-primary/20 rounded-2xl">
                <span className="text-[10px] font-black text-primary uppercase tracking-tighter flex items-center gap-2">
                  <Layers size={12} /> {chartData.length} Pontos Processados
                </span>
              </div>
            )}
          </div>
          
          <div className={`h-[380px] w-full transition-all duration-700 ${loading ? 'opacity-10 scale-95' : 'opacity-100 scale-100'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#ffffff" opacity={0.03} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#666', fontSize: 10, fontWeight: 700}} 
                  dy={15} 
                />
                <YAxis 
                   hide={!globalVisible}
                   axisLine={false} 
                   tickLine={false} 
                   tick={{fill: '#666', fontSize: 10, fontWeight: 700}}
                />
                <Tooltip 
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                  contentStyle={{ 
                    backgroundColor: '#111', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '20px', 
                    padding: '12px 16px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                  }} 
                  itemStyle={{ color: 'hsl(var(--primary))', fontSize: '12px', fontWeight: '900' }}
                  formatter={(value: number) => [formatCurrency(value), 'FATURAMENTO']}
                />
                <Area 
                  type="monotone" 
                  dataKey="valor" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={5} 
                  fill="url(#chartGradient)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RANKING */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-[40px] p-8 flex flex-col relative overflow-hidden">
          <div className="mb-10">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white flex items-center gap-3">
              <Package size={18} className="text-primary" /> Ranking de Saída
            </h2>
            <p className="text-[10px] text-muted-foreground font-bold mt-1 uppercase opacity-40">Produtos mais vendidos no período</p>
          </div>

          <div className="space-y-5 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-[70px] w-full bg-white/5 animate-pulse rounded-[20px]" />
              ))
            ) : topProdutos.length > 0 ? (
              topProdutos.map((prod, idx) => {
                const maxSales = topProdutos[0].sales;
                const percentage = (prod.sales / maxSales) * 100;
                
                return (
                  <div key={idx} className="relative group p-4 rounded-[24px] bg-zinc-900/30 border border-white/[0.02] hover:bg-zinc-900/60 transition-all">
                    <div className="flex justify-between items-center relative z-10 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-primary/40 italic">#0{idx + 1}</span>
                        <p className="text-xs font-black uppercase tracking-tight truncate max-w-[140px]">{prod.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-black text-white">{prod.sales}</span>
                        <span className="text-[8px] font-bold text-muted-foreground ml-1 uppercase">UN</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                       <div 
                        className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${percentage}%` }}
                       />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-20 py-20 text-center">
                <Archive size={40} strokeWidth={1} className="mb-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Nenhum dado encontrado</p>
              </div>
            )}
          </div>
          
          <button className="mt-8 group flex items-center justify-center gap-2 w-full py-5 bg-white/5 hover:bg-primary text-[10px] font-black uppercase tracking-[0.2em] rounded-[24px] transition-all duration-500 hover:text-black">
            Extrair Relatório <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* ALERTAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className={`col-span-1 lg:col-span-2 p-1 rounded-[32px] transition-all ${metrics.estoqueBaixo > 0 ? 'bg-gradient-to-r from-red-500/20 to-transparent animate-pulse' : 'bg-white/5'}`}>
          <div className="bg-[#0b0b0b] rounded-[30px] p-7 flex items-center justify-between group cursor-pointer border border-white/5">
            <div className="flex items-center gap-6">
              <div className={`p-5 rounded-[22px] shadow-2xl ${metrics.estoqueBaixo > 0 ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-zinc-900 text-zinc-600'}`}>
                <AlertTriangle size={28} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-tighter text-white">Status do Estoque</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-1">
                  {metrics.estoqueBaixo > 0 
                    ? `Atenção: ${metrics.estoqueBaixo} produtos operando abaixo da margem de segurança.` 
                    : 'Todos os níveis de estoque estão operando dentro da normalidade.'}
                </p>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full border border-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
              <ChevronRight size={20} />
            </div>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-[32px] p-8 flex flex-col justify-center group hover:bg-primary transition-all duration-500 cursor-pointer">
           <p className="text-[10px] font-black text-primary group-hover:text-black uppercase tracking-[0.2em] mb-2">Saúde da Operação</p>
           <h4 className="text-2xl font-black text-white group-hover:text-black leading-none mb-1">
            {renderVal(metrics.ticketMedio, 'ticket')}
           </h4>
           <p className="text-[10px] font-bold text-muted-foreground group-hover:text-black/60 uppercase">Ticket médio por transação</p>
        </div>
      </div>
    </div>
  );
}