import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Send, CheckCircle2, Circle, StickyNote, 
  ClipboardCheck, Trash2, User, Bell, 
  Search, Plus, MessageSquare, Clock, AlertTriangle,
  LayoutDashboard, CheckCircle, ListTodo, MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';

const CORES = [
  { id: 'padrao', bg: 'bg-zinc-900/50', border: 'border-zinc-800', accent: 'bg-zinc-700', text: 'text-zinc-400', label: 'Normal' },
  { id: 'urgente', bg: 'bg-red-500/5', border: 'border-red-500/20', accent: 'bg-red-600', text: 'text-red-500', label: 'Urgente' },
  { id: 'sucesso', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', accent: 'bg-emerald-600', text: 'text-emerald-500', label: 'Resolvido' },
  { id: 'info', bg: 'bg-blue-500/5', border: 'border-blue-500/20', accent: 'bg-blue-600', text: 'text-blue-500', label: 'Informativo' },
];

export default function Mensagens() {
  const [itens, setItens] = useState<any[]>([]);
  const [novoItem, setNovoItem] = useState('');
  const [tipo, setTipo] = useState<'mensagem' | 'tarefa'>('mensagem');
  const [destinatario, setDestinatario] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [filtro, setFiltro] = useState<'todos' | 'mensagem' | 'tarefa'>('todos');
  const [busca, setBusca] = useState('');

  const obterAutor = () => {
    const session = localStorage.getItem('pdv_user_session');
    if (session) {
      const user = JSON.parse(session);
      return user.nome_completo || user.nome_usuario || 'Admin';
    }
    return 'Admin';
  };

  useEffect(() => {
    buscarMural();
    const channel = supabase.channel('mural').on('postgres_changes', 
      { event: '*', schema: 'public', table: 'mural_comunicacao' }, () => buscarMural()
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function buscarMural() {
    const { data } = await supabase.from('mural_comunicacao').select('*').order('criado_em', { ascending: false });
    setItens(data || []);
  }

  // Estatísticas para os cards do topo
  const stats = useMemo(() => {
    const pendentes = itens.filter(i => i.tipo === 'tarefa' && !i.concluida).length;
    const recados = itens.filter(i => i.tipo === 'mensagem').length;
    const urgentes = itens.filter(i => i.cor === 'urgente' && !i.concluida).length;
    return { pendentes, recados, urgentes };
  }, [itens]);

  async function enviarItem() {
    if (!novoItem.trim()) {
      toast.error("O conteúdo não pode estar vazio");
      return;
    }

    const { error } = await supabase.from('mural_comunicacao').insert([{
      autor: obterAutor(),
      destinatario: destinatario || 'Todos',
      conteudo: novoItem,
      tipo: tipo,
      cor: cor.id,
      concluida: false
    }]);

    if (!error) {
      setNovoItem('');
      setDestinatario('');
      setCor(CORES[0]);
      toast.success("Publicado com sucesso!");
    }
  }

  async function alternarTarefa(id: string, concluida: boolean) {
    await supabase.from('mural_comunicacao').update({ 
      concluida: !concluida, 
      finalizada_por: obterAutor() 
    }).eq('id', id);
  }

  async function excluir(id: string) {
    const { error } = await supabase.from('mural_comunicacao').delete().eq('id', id);
    if (!error) toast.success("Item removido");
  }

  const itensFiltrados = itens.filter(i => {
    const matchesFiltro = filtro === 'todos' || i.tipo === filtro;
    const matchesBusca = i.conteudo.toLowerCase().includes(busca.toLowerCase()) || 
                        i.autor.toLowerCase().includes(busca.toLowerCase());
    return matchesFiltro && matchesBusca;
  });

  return (
    <div className="h-[calc(100vh-3rem)] overflow-y-auto bg-[#09090b] text-zinc-100 p-4 lg:p-8 scrollbar-thin scrollbar-thumb-zinc-800">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER & STATS */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
          <div className="lg:col-span-1">
            <h1 className="text-3xl font-black italic tracking-tighter uppercase flex items-center gap-2">
              <LayoutDashboard className="text-orange-600" /> Mural
            </h1>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mt-1">Painel de Operações</p>
          </div>
          
          <div className="grid grid-cols-3 gap-3 lg:col-span-3">
            <div className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center gap-3">
              <div className="bg-orange-500/10 p-2 rounded-lg"><MessageSquare size={18} className="text-orange-500"/></div>
              <div><p className="text-lg font-black leading-none">{stats.recados}</p><p className="text-[10px] text-zinc-500 uppercase font-bold">Recados</p></div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center gap-3">
              <div className="bg-blue-500/10 p-2 rounded-lg"><ListTodo size={18} className="text-blue-500"/></div>
              <div><p className="text-lg font-black leading-none">{stats.pendentes}</p><p className="text-[10px] text-zinc-500 uppercase font-bold">Pendentes</p></div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center gap-3">
              <div className="bg-red-500/10 p-2 rounded-lg"><AlertTriangle size={18} className="text-red-500"/></div>
              <div><p className="text-lg font-black leading-none">{stats.urgentes}</p><p className="text-[10px] text-zinc-500 uppercase font-bold">Críticos</p></div>
            </div>
          </div>
        </div>

        {/* BARRA DE FERRAMENTAS */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
            <input 
              type="text" 
              placeholder="Pesquisar no mural..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-orange-600 outline-none transition-all"
            />
          </div>
          
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            {(['todos', 'mensagem', 'tarefa'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                  filtro === f ? 'bg-orange-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f === 'todos' ? 'Ver Tudo' : f === 'mensagem' ? 'Avisos' : 'Tarefas'}
              </button>
            ))}
          </div>
        </div>

        {/* EDITOR DE PUBLICAÇÃO */}
        <div className={`p-1 rounded-[24px] bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-800 ${cor.id !== 'padrao' ? 'from-orange-600/50' : ''}`}>
          <div className="bg-[#0c0c0e] rounded-[22px] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button onClick={() => setTipo('mensagem')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 ${tipo === 'mensagem' ? 'bg-orange-600 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                  <MessageSquare size={12}/> Recado
                </button>
                <button onClick={() => setTipo('tarefa')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2 ${tipo === 'tarefa' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                  <ClipboardCheck size={12}/> Tarefa
                </button>
              </div>
              <div className="flex gap-2">
                {CORES.map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => setCor(c)}
                    className={`h-4 w-4 rounded-full ${c.accent} transition-transform ${cor.id === c.id ? 'scale-150 ring-2 ring-white/20' : 'opacity-40 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>

            <textarea 
              value={novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              placeholder="Escreva algo importante para a equipe..."
              className="w-full bg-transparent border-none focus:ring-0 text-xl font-medium placeholder:text-zinc-800 resize-none h-20"
            />

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-zinc-900">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800 w-full md:w-64">
                  <User size={14} className="text-zinc-600" />
                  <input 
                    type="text" 
                    value={destinatario}
                    onChange={(e) => setDestinatario(e.target.value)}
                    placeholder="PARA QUEM? (EX: TODOS)"
                    className="bg-transparent border-none focus:ring-0 text-[10px] font-black uppercase w-full outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={enviarItem}
                className="w-full md:w-auto bg-white text-black font-black px-10 py-3 rounded-xl uppercase text-xs hover:bg-orange-600 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Publicar Agora <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* GRID DE MENSAGENS */}
        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
          {itensFiltrados.map((item) => (
            <div 
              key={item.id} 
              className={`break-inside-avoid relative group flex flex-col p-6 rounded-[24px] border transition-all duration-300 hover:shadow-2xl hover:shadow-orange-950/10 ${
                item.concluida ? 'bg-zinc-950/40 border-zinc-900 grayscale opacity-50' : 
                `${CORES.find(c => c.id === item.cor)?.bg || 'bg-zinc-900/40'} ${CORES.find(c => c.id === item.cor)?.border || 'border-zinc-800'}`
              }`}
            >
              {/* INDICADOR LATERAL DE COR */}
              <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full ${CORES.find(c => c.id === item.cor)?.accent || 'bg-zinc-700'}`} />

              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center bg-zinc-950 border border-zinc-800 text-[10px] font-black uppercase text-orange-500`}>
                    {item.autor.substring(0,2)}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-tighter leading-none">
                      {item.autor} <span className="text-zinc-600 mx-1">➔</span> {item.destinatario}
                    </p>
                    <p className="text-[9px] text-zinc-500 font-bold uppercase mt-1 flex items-center gap-1">
                      <Clock size={10} /> {new Date(item.criado_em).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => excluir(item.id)}
                  className="p-2 rounded-lg bg-zinc-950/50 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                >
                  <Trash2 size={14}/>
                </button>
              </div>

              <div className="flex-1 px-1">
                {item.tipo === 'tarefa' ? (
                  <div className="flex gap-4 items-start cursor-pointer" onClick={() => alternarTarefa(item.id, item.concluida)}>
                    <div className={`mt-1 transition-all ${item.concluida ? 'text-emerald-500 scale-110' : 'text-zinc-700'}`}>
                      {item.concluida ? <CheckCircle size={22} fill="currentColor" className="text-emerald-500/20" /> : <Circle size={22} />}
                    </div>
                    <p className={`text-sm font-semibold leading-relaxed ${item.concluida ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>
                      {item.conteudo}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-300 leading-relaxed font-medium">
                    {item.conteudo}
                  </p>
                )}
              </div>

              {item.concluida && (
                <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between">
                  <span className="text-[8px] font-black text-emerald-600 uppercase">Status: Finalizado</span>
                  <span className="text-[8px] font-bold text-zinc-600 uppercase">Por: {item.finalizada_por}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}