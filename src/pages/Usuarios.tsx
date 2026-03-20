import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, logAction } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Settings, Plus, Trash2, Edit2, X, Save, Shield, Loader2, Eye, EyeOff } from 'lucide-react';

interface CustomUser {
  id: string;
  nome_usuario: string;
  senha: string;
  nome_completo: string;
  cargo: 'operador' | 'gerente';
  permissoes: string[];
  funcao?: string; // Adicionado para compatibilidade com o AuthContext
}

const ALL_MENUS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pdv', label: 'PDV' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'pessoas', label: 'Pessoas' },
  { key: 'produtos', label: 'Produtos' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'pagamentos', label: 'Formas de Pagamento' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'contas-pagar', label: 'Contas a Pagar' },
  { key: 'contas-receber', label: 'Contas a Receber' },
  { key: 'orcamentos', label: 'Orçamentos' },
  { key: 'trocas', label: 'Trocas e Devoluções' },
  { key: 'promocoes', label: 'Promoções' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'mensagens', label: 'Mensagens' },
];

export default function Usuarios() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<CustomUser[]>([]);
  const [editing, setEditing] = useState<CustomUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const emptyUser: CustomUser = { 
    id: '', 
    nome_usuario: '', 
    senha: '', 
    nome_completo: '', 
    cargo: 'operador', 
    permissoes: [],
    funcao: 'operador'
  };

  useEffect(() => { 
    fetchUsers(); 
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('usuarios').select('*').order('nome_completo');
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }

  // Se o AuthContext estiver correto, isAdmin será true para o usuário 'planex'
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Shield className="h-12 w-12" />
        <p className="text-lg font-medium">Acesso restrito a administradores</p>
      </div>
    );
  }

  function handleNew() {
    setEditing({ ...emptyUser, id: crypto.randomUUID() });
    setShowForm(true);
  }

  function handleEdit(u: CustomUser) {
    setEditing({ ...u });
    setShowForm(true);
  }

  async function handleDelete(u: CustomUser) {
    if (u.nome_usuario === 'planex') {
      toast.error('O usuário mestre não pode ser excluído');
      return;
    }
    if (!confirm(`Deseja excluir o usuário ${u.nome_completo}?`)) return;
    
    const { error } = await supabase.from('usuarios').delete().eq('id', u.id);
    if (error) {
      toast.error('Erro ao excluir');
      return;
    }
    setUsers(users.filter(usr => usr.id !== u.id));
    logAction(user?.id || '', 'usuario_excluido', `Usuário ${u.nome_completo} excluído`);
    toast.success('Usuário excluído');
  }

  async function handleSave() {
    if (!editing?.nome_completo || !editing?.nome_usuario || !editing?.senha) {
      toast.error('Preencha Nome, Usuário e Senha');
      return;
    }

    // Sincroniza o campo 'funcao' com o 'cargo' para manter o AuthContext funcionando
    const userData = {
      ...editing,
      funcao: editing.cargo === 'gerente' ? 'admin' : 'operador'
    };

    const { error } = await supabase.from('usuarios').upsert(userData);

    if (error) {
      toast.error('Erro ao salvar no banco');
      console.error("Erro:", error);
      return;
    }

    toast.success('Usuário salvo com sucesso!');
    setShowForm(false);
    setEditing(null);
    fetchUsers();
    logAction(user?.id || '', 'usuario_salvo', `Usuário ${editing.nome_completo} salvo`);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
            <p className="text-sm text-muted-foreground">Controle de acesso dos funcionários</p>
          </div>
        </div>
        {!showForm && (
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-1" /> Novo Usuário</Button>
        )}
      </div>

      {showForm && editing && (
        <Card className="border-primary/20 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <CardTitle className="text-base font-bold">Dados do Usuário</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}><X className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={editing.nome_completo} onChange={e => setEditing({ ...editing, nome_completo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Cargo / Nível</Label>
                <Select value={editing.cargo} onValueChange={v => setEditing({ ...editing, cargo: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="gerente">Gerente / Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Login (Usuário)</Label>
                <Input value={editing.nome_usuario} onChange={e => setEditing({ ...editing, nome_usuario: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Input type={showPassword ? 'text' : 'password'} value={editing.senha} onChange={e => setEditing({ ...editing, senha: e.target.value })} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <Label className="text-base font-bold">Permissões de Menus</Label>
                <Button variant="ghost" size="sm" onClick={() => {
                  const all = editing.permissoes.length === ALL_MENUS.length;
                  setEditing({ ...editing, permissoes: all ? [] : ALL_MENUS.map(m => m.key) });
                }} className="text-xs">Alternar Todos</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_MENUS.map(m => (
                  <div key={m.key} className="flex items-center gap-2 border p-2 rounded-md bg-muted/30 hover:bg-accent/50 transition-colors">
                    <Checkbox 
                      checked={editing.permissoes.includes(m.key)} 
                      onCheckedChange={() => {
                        const perms = editing.permissoes.includes(m.key)
                          ? editing.permissoes.filter(p => p !== m.key)
                          : [...editing.permissoes, m.key];
                        setEditing({ ...editing, permissoes: perms });
                      }} 
                      id={m.key} 
                    />
                    <label htmlFor={m.key} className="text-sm cursor-pointer select-none">{m.label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-primary hover:bg-primary/90"><Save className="h-4 w-4 mr-2" /> Gravar Usuário</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome_completo}</TableCell>
                    <TableCell className="text-muted-foreground">{u.nome_usuario}</TableCell>
                    <TableCell className="capitalize">{u.cargo}</TableCell>
                    <TableCell className="text-right flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(u)} title="Editar"><Edit2 className="h-4 w-4" /></Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDelete(u)} 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}