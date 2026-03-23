import { useState, useEffect } from 'react'; // [cite: 1]
import { supabase } from '@/lib/supabase'; // [cite: 1]
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // [cite: 2]
import { Input } from '@/components/ui/input'; // [cite: 2]
import { Button } from '@/components/ui/button'; // [cite: 3]
import { toast } from 'sonner'; // [cite: 3]
import { Lock, Loader2 } from 'lucide-react'; // [cite: 3]
import { useAuth } from '@/contexts/AuthContext'; // [cite: 4]
// Importação dos componentes de Select (ajuste o caminho se necessário)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Login() {
  const [nomeUsuario, setNomeUsuario] = useState(''); // [cite: 4]
  const [senha, setSenha] = useState(''); // [cite: 5]
  const [loading, setLoading] = useState(false); // [cite: 5]
  const [listaUsuarios, setListaUsuarios] = useState([]); // Novo estado para o Select
  const { setUser } = useAuth(); // [cite: 5]

  // Carrega os usuários cadastrados ao iniciar a tela
  useEffect(() => {
    async function buscarUsuarios() {
      const { data, error } = await supabase
        .from('usuarios')
        .select('nome_usuario, nome_completo')
        .order('nome_completo', { ascending: true });

      if (!error && data) {
        setListaUsuarios(data);
      }
    }
    buscarUsuarios();
  }, []);

  async function handleLogin() { // [cite: 6]
    setLoading(true); // [cite: 6]
    
    const u = nomeUsuario.trim(); // [cite: 6]
    const s = senha.trim(); // [cite: 6]

    // REGRA MASTER: Libera tudo definindo role como 'admin' e 'developer' 
    if (u === 'planex' && s === '2411') { // 
      const masterSession = { // 
        id: '999',
        name: 'Planex Master',
        nome_usuario: 'planex',
        nome_completo: 'Planex Master',
        role: 'admin',      // Para o AuthContext entender como admin 
        isAdmin: true, 
        // Para a Sidebar liberar os filtros [cite: 8]
        isDeveloper: true,  // Para a Área do Desenvolvedor [cite: 8]
        funcao: 'admin' // [cite: 8]
      };
      
      localStorage.setItem('pdv_user_session', JSON.stringify(masterSession)); // [cite: 9]
      if (setUser) setUser(masterSession); // [cite: 9]
      
      toast.success('Acesso Master Liberado!'); // [cite: 9]
      setTimeout(() => { window.location.href = '/'; }, 500); // [cite: 9]
      return; // [cite: 9]
    }

    try {
      const { data, error } = await supabase // [cite: 10]
        .from('usuarios')
        .select('*') // [cite: 10]
        .eq('nome_usuario', u) // [cite: 10]
        .eq('senha', s) // [cite: 10]
        .single(); // [cite: 10]

      if (error || !data) { // [cite: 11]
        toast.error('Usuário ou senha incorretos'); // [cite: 11]
        setLoading(false); // [cite: 11]
        return; // [cite: 11]
      }

      // Mapeia os dados do banco para o padrão que a Sidebar espera [cite: 12]
      const userSession = { // [cite: 12]
        ...data, // [cite: 12]
        name: data.nome_completo, // [cite: 12]
        role: data.funcao || 'Usuário' // [cite: 12, 13]
      };

      localStorage.setItem('pdv_user_session', JSON.stringify(userSession)); // [cite: 13]
      if (setUser) setUser(userSession); // [cite: 13]
      
      toast.success(`Bem-vindo, ${data.nome_completo}!`); // [cite: 13]
      setTimeout(() => { window.location.href = '/'; }, 500); // [cite: 14]
      
    } catch (err) {
      toast.error('Erro de conexão com o banco'); // [cite: 14]
      setLoading(false); // [cite: 15]
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4"> {/* [cite: 15] */}
      <Card className="w-full max-w-md shadow-lg"> {/* [cite: 15] */}
        <CardHeader className="flex flex-col items-center"> {/* [cite: 15] */}
          <div className="h-12 w-12 bg-orange-600 rounded-xl flex items-center justify-center mb-2"> {/* [cite: 15] */}
            <Lock className="text-white" /> {/* [cite: 15] */}
          </div>
          <CardTitle className="text-2xl font-bold">Acesso ao Sistema</CardTitle> {/* [cite: 15] */}
          <CardDescription>Selecione seu usuário e digite a senha</CardDescription> {/* [cite: 16] */}
        </CardHeader>
        <CardContent className="space-y-4"> {/* [cite: 16] */}
          
          {/* LISTA SUSPENSA DE USUÁRIOS */}
          <Select onValueChange={setNomeUsuario} value={nomeUsuario}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o Usuário" />
            </SelectTrigger>
            <SelectContent>
              {/* Opção Master inclusa manualmente */}
              <SelectItem value="planex">Planex Master</SelectItem>
              {/* Usuários vindos do banco */}
              {listaUsuarios.map((u) => (
                <SelectItem key={u.nome_usuario} value={u.nome_usuario}>
                  {u.nome_completo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input 
            type="password" 
            placeholder="Senha" 
            value={senha} 
            onChange={e => setSenha(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} // 
          />
    
          <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={handleLogin} disabled={loading}> {/* [cite: 18] */}
            {loading ? <Loader2 className="animate-spin" /> : 'Entrar no Sistema'} {/* [cite: 19] */}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
} // [cite: 20]