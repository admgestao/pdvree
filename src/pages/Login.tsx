import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

  async function handleLogin() {
    setLoading(true);
    
    const u = nomeUsuario.trim();
    const s = senha.trim();

    // REGRA MASTER: Libera tudo definindo role como 'admin' e 'developer'
    if (u === 'planex' && s === '2411') {
      const masterSession = {
        id: '999',
        name: 'Planex Master',
        nome_usuario: 'planex',
        nome_completo: 'Planex Master',
        role: 'admin',      // Para o AuthContext entender como admin
        isAdmin: true,      // Para a Sidebar liberar os filtros
        isDeveloper: true,  // Para a Área do Desenvolvedor
        funcao: 'admin'
      };

      localStorage.setItem('pdv_user_session', JSON.stringify(masterSession));
      if (setUser) setUser(masterSession);
      
      toast.success('Acesso Master Liberado!');
      setTimeout(() => { window.location.href = '/'; }, 500);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('nome_usuario', u)
        .eq('senha', s)
        .single();

      if (error || !data) {
        toast.error('Usuário ou senha incorretos');
        setLoading(false);
        return;
      }

      // Mapeia os dados do banco para o padrão que a Sidebar espera
      const userSession = {
        ...data,
        name: data.nome_completo, 
        role: data.funcao || 'Usuário'
      };

      localStorage.setItem('pdv_user_session', JSON.stringify(userSession));
      if (setUser) setUser(userSession);
      
      toast.success(`Bem-vindo, ${data.nome_completo}!`);
      setTimeout(() => { window.location.href = '/'; }, 500);
      
    } catch (err) {
      toast.error('Erro de conexão com o banco');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="flex flex-col items-center">
          <div className="h-12 w-12 bg-orange-600 rounded-xl flex items-center justify-center mb-2">
            <Lock className="text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Acesso ao Sistema</CardTitle>
          <CardDescription>Digite suas credenciais para entrar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input 
            placeholder="Usuário" 
            value={nomeUsuario} 
            onChange={e => setNomeUsuario(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <Input 
            type="password" 
            placeholder="Senha" 
            value={senha} 
            onChange={e => setSenha(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={handleLogin} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}