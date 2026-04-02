import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Plus, Search, ArrowDownLeft, ArrowUpRight,
  Lock, Calendar, User as UserIcon, X, Unlock, AlignLeft,
  LucideIcon, Activity, Scissors, Filter, ChevronDown, ChevronUp,
  Printer, BarChart3
} from 'lucide-react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ValueDisplay } from '@/components/ValueDisplay';
import { toast } from 'sonner';

interface Movimento {
  id: string;
  usuario_id: string;
  tipo: string;
  valor: number;
  descricao: string;
  criado_em: string;
}

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDatePresets = () => {
  const today = getTodayString();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  const last7Days = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  })();
  const thisMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();
  const lastMonth = (() => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth(), 0);
    return {
      start: firstDay.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0]
    };
  })();

  return { today, yesterday, last7Days, thisMonth, lastMonth };
};

const TIPOS_MOVIMENTO = ['todos', 'abertura', 'entrada', 'saida', 'sangria', 'fechamento'];

export default function Caixa() {
  const { user } = useAuth();
  const [movimentosOriginais, setMovimentosOriginais] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showFiltros, setShowFiltros] = useState(false);

  const [tipo, setTipo] = useState('abertura');
  const [valor, setValor] = useState(0);
  const [descricao, setDescricao] = useState('');

  const [dateRange, setDateRange] = useState({
    start: getTodayString(),
    end: getTodayString()
  });
  const [filterUser, setFilterUser] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [filterDescricao, setFilterDescricao] = useState('');

  const currentUserName = user?.name || user?.nome_completo || user?.nome_usuario || 'Sistema';

  const [statusCaixa, setStatusCaixa] = useState({ 
    aberto: false, 
    precisaAbrir: false, 
    loaded: false 
  });

  useEffect(() => {
    async function checkStatus() {
      const { data } = await supabase
        .from('caixa_movimentos')
        .select('tipo, criado_em')
        .eq('usuario_id', currentUserName)
        .in('tipo', ['abertura', 'fechamento'])
        .order('criado_em', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const isAberto = data[0].tipo.toLowerCase().trim() === 'abertura';
        setStatusCaixa({ aberto: isAberto, precisaAbrir: false, loaded: true });
      } else {
        setStatusCaixa({ aberto: false, precisaAbrir: true, loaded: true });
      }
    }
    checkStatus();
  }, [currentUserName, showForm]);

  const isObrigatorio = statusCaixa.precisaAbrir && tipo === 'abertura';

  useEffect(() => {
    if (statusCaixa.loaded && statusCaixa.precisaAbrir) {
      setShowForm(true);
      setTipo('abertura');
    }
  }, [statusCaixa]);

  useEffect(() => {
    load();
  }, [dateRange]);

  async function load() {
    setLoading(true);
    try {
      let query = supabase
        .from('caixa_movimentos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (dateRange.start)
        query = query.gte('criado_em', `${dateRange.start}T00:00:00`);
      if (dateRange.end)
        query = query.lte('criado_em', `${dateRange.end}T23:59:59`);

      const { data } = await query;
      setMovimentosOriginais(data || []);
    } catch (error) {
      console.error('Erro ao carregar caixa:', error);
    } finally {
      setLoading(false);
    }
  }

  const movimentosFiltrados = useMemo(() => {
    return movimentosOriginais.filter((m) => {
      const matchUser = filterUser
        ? m.usuario_id.toLowerCase().includes(filterUser.toLowerCase())
        : true;
      const matchTipo = filterTipo === 'todos'
        ? true
        : m.tipo.toLowerCase().trim() === filterTipo;
      const matchDesc = filterDescricao
        ? m.descricao?.toLowerCase().includes(filterDescricao.toLowerCase())
        : true;
      return matchUser && matchTipo && matchDesc;
    });
  }, [movimentosOriginais, filterUser, filterTipo, filterDescricao]);

  const usuariosUnicos = useMemo(() => {
    const set = new Set(movimentosOriginais.map(m => m.usuario_id).filter(Boolean));
    return Array.from(set).sort();
  }, [movimentosOriginais]);

  const filtrosAtivos = [
    filterUser !== '',
    filterTipo !== 'todos',
    filterDescricao !== '',
    dateRange.start !== getTodayString() || dateRange.end !== getTodayString()
  ].filter(Boolean).length;

  async function handleSave() {
    if (valor <= 0 && tipo !== 'fechamento') {
      toast.error('Informe um valor válido');
      return;
    }

    const payload = {
      tipo,
      valor: Number(valor) || 0,
      descricao: descricao.trim() || tipo,
      usuario_id: currentUserName,
      criado_em: new Date().toISOString(),
    };

    const { error } = await supabase.from('caixa_movimentos').insert(payload);
    if (error) {
      toast.error('Erro ao registrar: ' + error.message);
      return;
    }

    await logAction(
      currentUserName,
      `caixa_${tipo}`,
      `Valor: R$ ${valor} | Desc: ${payload.descricao}`
    );

    toast.success(`${tipo.toUpperCase()} registrado com sucesso!`);
    setShowForm(false);
    setValor(0);
    setDescricao('');
    load();
  }

  // ─── LÓGICA CORRIGIDA DO DASHBOARD ───────────────────────────────────────
  
  // 1. ABERTURA: Pega APENAS a primeira abertura (mais antiga) do período filtrado
  const aberturasDoPeriodo = movimentosOriginais
    .filter(m => m.tipo.toLowerCase().trim() === 'abertura')
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());

  const valorAbertura = aberturasDoPeriodo.length > 0 
    ? Number(aberturasDoPeriodo[0].valor) 
    : 0;

  // 2. ENTRADAS: Soma todas as entradas do período
  const totalEntradas = movimentosOriginais
    .filter(m => m.tipo.toLowerCase().trim() === 'entrada')
    .reduce((s, m) => s + Number(m.valor), 0);

  // 3. SAÍDAS: Soma todas as saídas do período
  const totalSaidas = movimentosOriginais
    .filter(m => m.tipo.toLowerCase().trim() === 'saida')
    .reduce((s, m) => s + Number(m.valor), 0);

  // 4. SANGRIAS: Soma todas as sangrias do período
  const totalSangrias = movimentosOriginais
    .filter(m => m.tipo.toLowerCase().trim() === 'sangria')
    .reduce((s, m) => s + Number(m.valor), 0);

  // 5. SALDO: Primeira Abertura + Entradas - Saídas - Sangrias
  const saldo = valorAbertura + totalEntradas - totalSaidas - totalSangrias;

  const presets = getDatePresets();
  const handlePreset = (preset: string) => {
    switch (preset) {
      case 'hoje': setDateRange({ start: presets.today, end: presets.today }); break;
      case 'ontem': setDateRange({ start: presets.yesterday, end: presets.yesterday }); break;
      case '7dias': setDateRange({ start: presets.last7Days, end: presets.today }); break;
      case 'mes': setDateRange({ start: presets.thisMonth, end: presets.today }); break;
      case 'mesPassado': setDateRange({ start: presets.lastMonth.start, end: presets.lastMonth.end }); break;
      case 'tudo': setDateRange({ start: '', end: '' }); break;
    }
  };

  const limparFiltros = () => {
    setFilterUser('');
    setFilterTipo('todos');
    setFilterDescricao('');
    handlePreset('hoje');
  };

  function imprimirRelatorio() {
    const win = window.open('', '_blank');
    if (!win) return;

    const fBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const periodoLabel = dateRange.start === dateRange.end
      ? `Dia: ${new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR')}`
      : `Período: ${new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR')} até ${new Date(dateRange.end + 'T12:00:00').toLocaleDateString('pt-BR')}`;

    win.document.write(`
      <html>
        <head>
          <title>Relatório de Caixa</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #333; font-size: 13px; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
            .resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
            .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
            .card-label { font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; }
            .card-value { font-size: 18px; font-weight: 900; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f4f4f4; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
            td { padding: 9px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
            .badge-abertura { background: #dcfce7; color: #166534; }
            .badge-entrada { background: #dbeafe; color: #1e40af; }
            .badge-saida { background: #fee2e2; color: #991b1b; }
            .badge-sangria { background: #fef9c3; color: #854d0e; }
            .badge-fechamento { background: #fef3c7; color: #92400e; }
            @media print { body { padding: 10px; } }
          </style>
        </head>
        <body>
          <h1>Relatório de Fluxo de Caixa</h1>
          <p class="sub">
            ${periodoLabel}
            ${filterUser ? ` | Usuário: ${filterUser}` : ' | Todos os usuários'}
            ${filterTipo !== 'todos' ? ` | Tipo: ${filterTipo.toUpperCase()}` : ''}
            ${filterDescricao ? ` | Descrição: "${filterDescricao}"` : ''}
          </p>

          <div class="resumo">
            <div class="card">
              <div class="card-label">Abertura Inicial</div>
              <div class="card-value" style="color:#166534">${fBRL(valorAbertura)}</div>
            </div>
            <div class="card">
              <div class="card-label">Entradas</div>
              <div class="card-value" style="color:#1e40af">${fBRL(totalEntradas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Saídas</div>
              <div class="card-value" style="color:#991b1b">${fBRL(totalSaidas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Sangrias</div>
              <div class="card-value" style="color:#854d0e">${fBRL(totalSangrias)}</div>
            </div>
            <div class="card">
              <div class="card-label">Saldo Final</div>
              <div class="card-value" style="color:${saldo >= 0 ? '#166534' : '#991b1b'}">${fBRL(saldo)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Usuário</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th style="text-align:right">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${movimentosFiltrados.map((m) => `
                <tr>
                  <td>${formatDate(m.criado_em)}</td>
                  <td>${m.usuario_id}</td>
                  <td><span class="badge badge-${m.tipo.toLowerCase().trim()}">${m.tipo}</span></td>
                  <td>${m.descricao && m.descricao !== m.tipo ? m.descricao : '—'}</td>
                  <td style="text-align:right; font-weight:bold">${fBRL(Number(m.valor))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-top: 30px; text-align: center; color: #666; font-size: 11px;">
            Total de registros: ${movimentosFiltrados.length} | Gerado em ${new Date().toLocaleString('pt-BR')}
          </div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  }

  const iconMap: Record<string, LucideIcon> = {
    abertura: Unlock,
    sangria: Scissors,
    fechamento: Lock,
    entrada: ArrowUpRight,
    saida: ArrowDownLeft,
  };

  const fBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const getTipoConfig = (tipo: string) => {
    const configs = {
      abertura: {
        row: 'bg-green-500/5 border-l-4 border-l-green-500 hover:bg-green-500/10',
        icon: 'bg-green-500/20 border-green-500/40 text-green-500',
        text: 'text-green-500',
        badge: 'bg-green-500/10 text-green-600 border-green-500/20',
        sinal: ''
      },
      fechamento: {
        row: 'bg-amber-500/5 border-l-4 border-l-amber-500 hover:bg-amber-500/10',
        icon: 'bg-amber-500/20 border-amber-500/40 text-amber-500',
        text: 'text-amber-500',
        badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        sinal: ''
      },
      entrada: {
        row: 'hover:bg-primary/5',
        icon: 'bg-primary/10 border-primary/20 text-primary',
        text: 'text-primary',
        badge: 'bg-primary/10 text-primary border-primary/20',
        sinal: '+'
      },
      saida: {
        row: 'hover:bg-red-500/5',
        icon: 'bg-red-500/10 border-red-500/20 text-red-500',
        text: 'text-red-500',
        badge: 'bg-red-500/10 text-red-600 border-red-500/20',
        sinal: '-'
      },
      sangria: {
        row: 'hover:bg-yellow-500/5',
        icon: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
        text: 'text-yellow-500',
        badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
        sinal: '-'
      }
    };
    return configs[tipo.toLowerCase().trim()] || configs.entrada;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen text-foreground">

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="text-primary h-6 w-6" /> Fluxo de Caixa
            </h1>
            {statusCaixa.aberto ? (
              <span className="px-3 py-1 rounded-full text-[10px] font-black bg-green-500/10 text-green-500 border border-green-500/20 animate-pulse">
                CAIXA ABERTO
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse">
                CAIXA FECHADO
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-[11px] mt-1 uppercase tracking-wider">
            Gestão de entradas, saídas e conferência
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={imprimirRelatorio}
            disabled={movimentosFiltrados.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-black transition-all disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">IMPRIMIR</span>
          </button>
          <button
            onClick={() => {
              setTipo(statusCaixa.aberto ? 'entrada' : 'abertura');
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-black transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" /> NOVA MOVIMENTAÇÃO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-green-500/30 p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Abertura</p>
            <div className="h-7 w-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Unlock className="h-3.5 w-3.5 text-green-500" />
            </div>
          </div>
          <ValueDisplay id="valor-abertura" value={fBRL(valorAbertura)} className="text-xl font-black text-green-500 mt-1" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Primeira abertura do período</p>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Entradas</p>
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>
          <ValueDisplay id="total-entradas" value={fBRL(totalEntradas)} className="text-xl font-black text-primary mt-1" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Vendas + depósitos</p>
        </div>

        <div className="bg-card border border-border p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Saídas</p>
            <div className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <ArrowDownLeft className="h-3.5 w-3.5 text-red-500" />
            </div>
          </div>
          <ValueDisplay id="total-saidas" value={fBRL(totalSaidas)} className="text-xl font-black text-red-400 mt-1" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Pagamentos / despesas</p>
        </div>

        <div className="bg-card border border-yellow-500/30 p-4 rounded-2xl shadow-sm flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Sangrias</p>
            <div className="h-7 w-7 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Scissors className="h-3.5 w-3.5 text-yellow-500" />
            </div>
          </div>
          <ValueDisplay id="total-sangrias" value={fBRL(totalSangrias)} className="text-xl font-black text-yellow-500 mt-1" />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Retiradas do caixa</p>
        </div>

        <div className={`col-span-2 lg:col-span-1 p-4 rounded-2xl shadow-sm flex flex-col gap-1 border ${saldo >= 0 ? 'bg-primary/5 border-primary/30' : 'bg-red-500/5 border-red-500/30'}`}>
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Saldo do Período</p>
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center border ${saldo >= 0 ? 'bg-primary/10 border-primary/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <Activity className={`h-3.5 w-3.5 ${saldo >= 0 ? 'text-primary' : 'text-red-500'}`} />
            </div>
          </div>
          <ValueDisplay id="saldo-atual" value={fBRL(saldo)} className={`text-xl font-black mt-1 ${saldo >= 0 ? 'text-primary' : 'text-red-500'}`} />
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Abertura + Entradas − Saídas − Sangrias</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowFiltros(!showFiltros)}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Filter className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black uppercase tracking-tight">Filtros e Busca Avançada</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {filtrosAtivos > 0
                  ? `${filtrosAtivos} filtro(s) ativo(s) — ${movimentosFiltrados.length} de ${movimentosOriginais.length} registros`
                  : `Mostrando todos os ${movimentosOriginais.length} registros do período`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {filtrosAtivos > 0 && (
              <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center">
                {filtrosAtivos}
              </span>
            )}
            {showFiltros
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </div>
        </button>

        {showFiltros && (
          <div className="border-t border-border p-4 space-y-4 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Filtros Rápidos de Período
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'hoje', label: 'Hoje' },
                  { key: 'ontem', label: 'Ontem' },
                  { key: '7dias', label: 'Últimos 7 dias' },
                  { key: 'mes', label: 'Este mês' },
                  { key: 'mesPassado', label: 'Mês passado' },
                  { key: 'tudo', label: 'Todo o histórico' }
                ].map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handlePreset(preset.key)}
                    className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent border border-border text-[10px] font-bold transition-all"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase">Período Personalizado</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg text-xs p-2 text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-xs font-bold text-muted-foreground">ATÉ</span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))}
                    className="flex-1 bg-secondary/50 border border-border rounded-lg text-xs p-2 text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase flex items-center gap-1">
                  <UserIcon className="h-3 w-3" /> Usuário
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    placeholder="Buscar usuário..."
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg text-xs pl-9 pr-3 py-2.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                {usuariosUnicos.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setFilterUser('')}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${filterUser === '' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'}`}
                    >
                      Todos
                    </button>
                    {usuariosUnicos.slice(0, 5).map((u) => (
                      <button
                        key={u}
                        onClick={() => setFilterUser(u)}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${filterUser === u ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'}`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" /> Tipo de Movimento
                </label>
                <div className="flex flex-wrap gap-1">
                  {TIPOS_MOVIMENTO.map((t) => {
                    const cores = {
                      todos: 'bg-secondary border-border text-muted-foreground',
                      abertura: 'bg-green-500/10 border-green-500/30 text-green-600',
                      entrada: 'bg-primary/10 border-primary/30 text-primary',
                      saida: 'bg-red-500/10 border-red-500/30 text-red-600',
                      sangria: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600',
                      fechamento: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
                    };
                    const ativo = filterTipo === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setFilterTipo(t)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all ${ativo ? cores[t] + ' ring-1 ring-offset-1 ring-offset-card' : 'bg-secondary border-border text-muted-foreground hover:bg-accent'}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase flex items-center gap-1">
                  <Search className="h-3 w-3" /> Descrição
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    placeholder="Buscar na descrição..."
                    value={filterDescricao}
                    onChange={(e) => setFilterDescricao(e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg text-xs pl-9 pr-3 py-2.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {filtrosAtivos > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 flex-wrap">
                  {filterUser && (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-card border border-border px-2 py-1 rounded-lg">
                      <UserIcon className="h-3 w-3 text-primary" /> {filterUser}
                      <button onClick={() => setFilterUser('')} className="ml-1 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterTipo !== 'todos' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-card border border-border px-2 py-1 rounded-lg">
                      <Filter className="h-3 w-3 text-primary" /> {filterTipo.toUpperCase()}
                      <button onClick={() => setFilterTipo('todos')} className="ml-1 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterDescricao && (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-card border border-border px-2 py-1 rounded-lg">
                      <Search className="h-3 w-3 text-primary" /> "{filterDescricao}"
                      <button onClick={() => setFilterDescricao('')} className="ml-1 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                </div>
                <button onClick={limparFiltros} className="flex items-center gap-1 text-[10px] font-black text-destructive hover:underline shrink-0">
                  <X className="h-3 w-3" /> Limpar tudo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            Movimentações
            {filtrosAtivos > 0 && (
              <span className="ml-2 text-primary">({movimentosFiltrados.length} registros filtrados)</span>
            )}
          </p>
          {movimentosFiltrados.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {dateRange.start === dateRange.end
                ? new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
                : `${new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR')} → ${new Date(dateRange.end + 'T12:00:00').toLocaleDateString('pt-BR')}`
              }
            </p>
          )}
        </div>

        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : movimentosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Wallet className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhum movimento encontrado</p>
            <p className="text-xs mt-1 opacity-60">
              Ajuste os filtros acima para buscar movimentações específicas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {movimentosFiltrados.map((m) => {
              const cfg = getTipoConfig(m.tipo);
              const IconComp = iconMap[m.tipo.toLowerCase().trim()] ?? ArrowUpRight;

              return (
                <div key={m.id} className={`p-4 flex items-center justify-between transition-colors ${cfg.row}`}>
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${cfg.icon}`}>
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                          {m.tipo}
                        </span>
                        {m.descricao && m.descricao !== m.tipo && (
                          <span className="text-[11px] text-muted-foreground italic">
                            — {m.descricao}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-primary/80">{m.usuario_id}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(m.criado_em).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    <span className={`text-sm font-black tabular-nums ${cfg.text}`}>
                      {cfg.sinal && `${cfg.sinal} `}{fBRL(Number(m.valor))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className={`fixed inset-0 ${isObrigatorio ? 'z-[9999] bg-background/95' : 'z-50 bg-background/80'} backdrop-blur-md flex items-center justify-center p-4`}>
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-lg font-black flex items-center gap-2 uppercase tracking-tighter ${isObrigatorio ? 'text-green-500' : 'text-foreground'}`}>
                {isObrigatorio
                  ? <Lock className="text-green-500 h-5 w-5" />
                  : <Plus className="text-primary h-5 w-5" />}
                {isObrigatorio ? 'Abertura Obrigatória do Caixa' : 'Novo Registro'}
              </h2>
              {!isObrigatorio && (
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button disabled={statusCaixa.aberto && !isObrigatorio} onClick={() => setTipo('abertura')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'abertura' ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-500/20' : 'bg-secondary border-border text-muted-foreground hover:border-green-500/50'}`}>
                  Abertura
                </button>
                <button disabled={!statusCaixa.aberto || isObrigatorio} onClick={() => setTipo('fechamento')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'fechamento' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-secondary border-border text-muted-foreground hover:border-amber-500/50'}`}>
                  Fechamento
                </button>
                <button disabled={!statusCaixa.aberto || isObrigatorio} onClick={() => setTipo('sangria')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'sangria' ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-secondary border-border text-muted-foreground hover:border-yellow-500/50'}`}>
                  Sangria
                </button>
                <button disabled={!statusCaixa.aberto || isObrigatorio} onClick={() => setTipo('entrada')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'entrada' ? 'bg-primary/20 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:border-primary/50'}`}>
                  Entrada
                </button>
                <button disabled={!statusCaixa.aberto || isObrigatorio} onClick={() => setTipo('saida')}
                  className={`col-span-2 py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'saida' ? 'bg-red-600 border-red-500 text-white' : 'bg-secondary border-border text-muted-foreground hover:border-red-500/50'}`}>
                  Saída
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">
                  Valor do Lançamento
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-primary font-bold text-sm">R$</span>
                  <input
                    type="number" step="0.01" value={valor || ''}
                    onChange={(e) => setValor(Number(e.target.value))}
                    placeholder="0,00"
                    className="w-full bg-secondary border border-border rounded-2xl py-3 pl-10 pr-4 text-foreground font-black text-lg outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-1">
                  <AlignLeft className="h-3 w-3" /> Descrição Opcional
                </label>
                <textarea
                  value={descricao} onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Troco inicial, Pagamento fornecedor..."
                  rows={2}
                  className="w-full bg-secondary border border-border rounded-2xl py-3 px-4 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                />
              </div>

              <div className={`pt-4 grid gap-3 ${isObrigatorio ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {!isObrigatorio && (
                  <button onClick={() => setShowForm(false)}
                    className="py-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-muted-foreground text-xs font-black uppercase border border-border">
                    Descartar
                  </button>
                )}
                <button onClick={handleSave}
                  className={`py-4 rounded-2xl bg-primary text-primary-foreground text-xs font-black uppercase transition-all shadow-lg shadow-primary/20 ${isObrigatorio ? 'animate-pulse' : ''}`}>
                  {isObrigatorio ? 'Realizar Abertura Agora' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
