import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Plus, Search, DollarSign, ArrowDownLeft, ArrowUpRight,
  Lock, Calendar, User as UserIcon, X, Activity, Unlock, AlignLeft,
  LucideIcon
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

// Função para gerar data local no formato correto
const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Caixa() {
  const { user } = useAuth();
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [tipo, setTipo] = useState('abertura');
  const [valor, setValor] = useState(0);
  const [descricao, setDescricao] = useState('');

  const [filterUser, setFilterUser] = useState('');
  const [dateRange, setDateRange] = useState({
    start: getTodayString(), // Usando função local para data correta
    end: getTodayString()
  });

  const currentUserName = user?.name || user?.nome_completo || user?.nome_usuario || 'Sistema';

  // Calcula o status do caixa baseado no último movimento de abertura/fechamento do usuário
  const statusCaixa = useMemo(() => {
    // Busca movimentos do usuário logado, apenas abertura e fechamento
    const movsUsuario = movimentos.filter(m => 
      m.usuario_id === currentUserName && 
      ['abertura', 'fechamento'].includes(m.tipo.toLowerCase().trim())
    );

    // Ordena por data decrescente e pega o último
    const ultimoMovimento = movsUsuario
      .sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())[0];

    const jaFezAbertura = !!ultimoMovimento;
    const caixaAberto = ultimoMovimento?.tipo.toLowerCase().trim() === 'abertura';
    const precisaAbrir = !jaFezAbertura;

    return { jaFezAbertura, caixaAberto, precisaAbrir };
  }, [movimentos, currentUserName]);

  const { caixaAberto, precisaAbrir } = statusCaixa;
  const isObrigatorio = precisaAbrir && tipo === 'abertura';

  useEffect(() => { 
    load(); 
  }, [filterUser, dateRange]);

  useEffect(() => {
    // Se precisar abrir o caixa, força o modal
    if (!loading && precisaAbrir) {
      setShowForm(true);
      setTipo('abertura');
    }
  }, [loading, precisaAbrir]);

  async function load() {
    setLoading(true);
    try {
      let query = supabase
        .from('caixa_movimentos')
        .select('*')
        .order('criado_em', { ascending: false });

      if (dateRange.start) {
        query = query.gte('criado_em', `${dateRange.start}T00:00:00`);
      }
      if (dateRange.end) {
        query = query.lte('criado_em', `${dateRange.end}T23:59:59`);
      }
      if (filterUser) {
        query = query.ilike('usuario_id', `%${filterUser}%`);
      }

      const { data } = await query;
      setMovimentos(data || []);
    } catch (error) {
      console.error("Erro ao carregar caixa:", error);
    } finally {
      setLoading(false);
    }
  }

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
      criado_em: new Date().toISOString(), // CORREÇÃO: Força envio da data/hora local correta
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

  const totalEntradas = movimentos
    .filter(m => ['abertura', 'entrada'].includes(m.tipo.toLowerCase().trim()))
    .reduce((s, m) => s + Number(m.valor), 0);

  const totalSaidas = movimentos
    .filter(m => ['sangria', 'saida', 'fechamento'].includes(m.tipo.toLowerCase().trim()))
    .reduce((s, m) => s + Number(m.valor), 0);

  const saldo = totalEntradas - totalSaidas;

  const iconMap: Record<string, LucideIcon> = {
    abertura: Unlock,
    sangria: ArrowDownLeft,
    fechamento: Lock,
    entrada: ArrowUpRight,
    saida: ArrowDownLeft
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen text-foreground transition-all duration-300">

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
               <Wallet className="text-primary h-6 w-6" /> Fluxo de Caixa
            </h1>
            {caixaAberto ? (
              <span className="px-3 py-1 rounded-full text-[10px] font-black bg-green-500/10 text-green-500 border border-green-500/20 animate-pulse">
                CAIXA ABERTO
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse">
                CAIXA FECHADO
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-[11px] mt-1 uppercase tracking-wider">Gestão de entradas, saídas e conferência</p>
        </div>

        <button
          onClick={() => {
            setTipo(caixaAberto ? 'entrada' : 'abertura');
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-black transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" /> NOVA MOVIMENTAÇÃO
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entradas / Abertura</p>
            <ArrowUpRight className="h-4 w-4 text-primary" />
          </div>
          <ValueDisplay id="total-entradas" value={`R$ ${totalEntradas.toFixed(2)}`} className="text-xl font-black text-foreground" />
        </div>

        <div className="bg-card border border-border p-5 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saídas / Sangrias</p>
            <ArrowDownLeft className="h-4 w-4 text-red-500" />
          </div>
          <ValueDisplay id="total-saidas" value={`R$ ${totalSaidas.toFixed(2)}`} className="text-xl font-black text-foreground" />
        </div>

        <div className={`bg-card border p-5 rounded-2xl transition-all shadow-sm ${saldo >= 0 ? 'border-primary/20' : 'border-red-500/20'}`}>
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saldo em Caixa</p>
            <Activity className={`h-4 w-4 ${saldo >= 0 ? 'text-primary' : 'text-red-500'}`} />
          </div>
          <ValueDisplay id="saldo-atual" value={`R$ ${saldo.toFixed(2)}`} className={`text-xl font-black ${saldo >= 0 ? 'text-primary' : 'text-red-400'}`} />
        </div>
      </div>

      <div className="bg-card border border-border p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Período
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="bg-secondary/50 border border-border rounded-lg text-xs p-2 text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-xs font-bold">ATÉ</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="bg-secondary/50 border border-border rounded-lg text-xs p-2 text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
            <UserIcon className="h-3 w-3" /> Filtrar Usuário
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Ex: Admin, João..."
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg text-xs pl-9 pr-3 py-2.5 text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <button
          onClick={() => { 
            setFilterUser(''); 
            const today = getTodayString();
            setDateRange({ start: today, end: today }); 
          }}
          className="bg-secondary hover:bg-secondary/80 p-2.5 rounded-lg transition-colors border border-border"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {movimentos.map((m) => {
              const tipoNormalizado = m.tipo.toLowerCase().trim();
              const IconComp = iconMap[tipoNormalizado] || DollarSign;
              const isEntry = ['abertura', 'entrada'].includes(tipoNormalizado);

              let rowStyle = "hover:bg-muted/30";
              let iconStyle = "bg-primary/10 border-primary/20 text-primary";
              let textStyle = "text-primary";

              if (tipoNormalizado === 'abertura') {
                rowStyle = "bg-green-500/5 border-l-4 border-l-green-500 shadow-[inset_0_0_15px_rgba(34,197,94,0.1)]";
                iconStyle = "bg-green-500/20 border-green-500/40 text-green-500";
                textStyle = "text-green-500";
              } else if (tipoNormalizado === 'fechamento') {
                rowStyle = "bg-amber-500/5 border-l-4 border-l-amber-500 shadow-[inset_0_0_15px_rgba(245,158,11,0.1)]";
                iconStyle = "bg-amber-500/20 border-amber-500/40 text-amber-500";
                textStyle = "text-amber-500";
              } else if (tipoNormalizado === 'entrada') {
                iconStyle = "bg-green-500/10 border-green-500/20 text-green-500";
                textStyle = "text-green-500";
              } else if (tipoNormalizado === 'saida') {
                iconStyle = "bg-red-500/10 border-red-500/20 text-red-500";
                textStyle = "text-red-500";
              } else if (tipoNormalizado === 'sangria') {
                iconStyle = "bg-yellow-500/10 border-yellow-500/20 text-yellow-500";
                textStyle = "text-yellow-500";
              }

              return (
                <div key={m.id} className={`p-4 flex items-center justify-between transition-colors group ${rowStyle}`}>
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${iconStyle}`}>
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-tight text-foreground">{m.tipo}</span>
                        {m.descricao && m.descricao !== m.tipo && (
                          <span className="text-[10px] text-muted-foreground font-medium italic">— {m.descricao}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold text-primary/80">{m.usuario_id}</span>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(m.criado_em).toLocaleString('pt-BR', {
                            timeZone: 'America/Sao_Paulo', // MELHORIA: Força exibição no fuso horário brasileiro
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-black tabular-nums ${textStyle}`}>
                      {isEntry ? '+' : '-'} {Number(m.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
              <h2 className={`text-lg font-black text-foreground flex items-center gap-2 uppercase tracking-tighter ${isObrigatorio ? 'text-green-500' : ''}`}>
                {isObrigatorio ? <Lock className="text-green-500 h-5 w-5" /> : <Plus className="text-primary h-5 w-5" />}
                {isObrigatorio ? 'Abertura Obrigatória do Caixa' : 'Novo Registro'}
              </h2>
              {!isObrigatorio && (
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={caixaAberto && !isObrigatorio}
                  onClick={() => setTipo('abertura')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'abertura' ? 'bg-green-600 text-white border-green-500 shadow-lg shadow-green-500/20' : 'bg-secondary border-border text-muted-foreground'}`}
                >Abertura</button>

                <button
                  disabled={!caixaAberto || isObrigatorio}
                  onClick={() => setTipo('fechamento')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'fechamento' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-secondary border-border text-muted-foreground'}`}
                >Fechamento</button>

                <button
                  disabled={!caixaAberto || isObrigatorio}
                  onClick={() => setTipo('sangria')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'sangria' ? 'bg-yellow-600 border-yellow-500 text-white' : 'bg-secondary border-border text-muted-foreground'}`}
                >Sangria</button>

                <button
                  disabled={!caixaAberto || isObrigatorio}
                  onClick={() => setTipo('entrada')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tipo === 'entrada' ? 'bg-green-600/20 border-green-500 text-green-500' : 'bg-secondary border-border text-muted-foreground'}`}
                >Entrada</button>

                <button
                  disabled={!caixaAberto || isObrigatorio}
                  onClick={() => setTipo('saida')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all disabled:opacity-30 disabled:cursor-not-allowed col-span-2 ${tipo === 'saida' ? 'bg-red-600 border-red-500 text-white' : 'bg-secondary border-border text-muted-foreground'}`}
                >Saída</button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Valor do Lançamento</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-primary font-bold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={valor || ''}
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
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Troco inicial, Pagamento fornecedor..."
                  rows={2}
                  className="w-full bg-secondary border border-border rounded-2xl py-3 px-4 text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                />
              </div>

              <div className={`pt-4 grid ${isObrigatorio ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                {!isObrigatorio && (
                  <button
                    onClick={() => setShowForm(false)}
                    className="py-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-muted-foreground text-xs font-black uppercase border border-border"
                  >Descartar</button>
                )}
                <button
                  onClick={handleSave}
                  className={`py-4 rounded-2xl bg-primary text-primary-foreground text-xs font-black uppercase transition-all shadow-lg shadow-primary/20 ${isObrigatorio && 'animate-pulse'}`}
                >{isObrigatorio ? 'Realizar Abertura Agora' : 'Confirmar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
