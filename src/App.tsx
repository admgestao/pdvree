import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Layout } from "@/components/Layout";
import { supabase } from "@/lib/supabase";

// Importações das páginas
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import PDV from "@/pages/PDV";
import Orcamentos from "@/pages/Orcamentos";
import Vendas from "@/pages/Vendas";
import Produtos from "@/pages/Produtos";
import Pessoas from "@/pages/Pessoas";
import FormasPagamento from "@/pages/FormasPagamento";
import Caixa from "@/pages/Caixa";
import ContasPagar from "@/pages/ContasPagar";
import ContasReceber from "@/pages/ContasReceber";
import Promocoes from "@/pages/Promocoes";
import Empresa from "@/pages/Empresa";
import Usuarios from "@/pages/Usuarios";
import Trocas from "@/pages/Trocas";
import Mensagens from "@/pages/Mensagens";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

interface CaixaStatus {
  loading: boolean;
  caixaAberto: boolean;
  jaFezAbertura: boolean;
}

// Componente para proteger as rotas com verificação de caixa
const PrivateRoute = ({ 
  children, 
  allowWithoutCaixa = false,
  onlyWhenCaixaOpen = false 
}: { 
  children: React.ReactNode;
  allowWithoutCaixa?: boolean;
  onlyWhenCaixaOpen?: boolean;
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [caixaStatus, setCaixaStatus] = useState<CaixaStatus>({
    loading: true,
    caixaAberto: false,
    jaFezAbertura: false
  });

  const session = localStorage.getItem('pdv_user_session');
  const sessionUser = session ? JSON.parse(session) : null;
  const currentUserName = user?.name || user?.nome_completo || sessionUser?.name || sessionUser?.nome_completo;

  useEffect(() => {
    async function verificarStatusCaixa() {
      if (!currentUserName) {
        setCaixaStatus({ loading: false, caixaAberto: false, jaFezAbertura: false });
        return;
      }

      try {
        // Busca o último movimento de abertura/fechamento do usuário específico
        const { data, error } = await supabase
          .from('caixa_movimentos')
          .select('tipo')
          .eq('usuario_id', currentUserName)
          .in('tipo', ['abertura', 'fechamento'])
          .order('criado_em', { ascending: false })
          .limit(1);

        if (error) throw error;

        const ultimoMovimento = data && data.length > 0 ? data[0].tipo.toLowerCase().trim() : null;
        const jaFezAbertura = ultimoMovimento !== null;
        const caixaAberto = ultimoMovimento === 'abertura';

        setCaixaStatus({
          loading: false,
          caixaAberto,
          jaFezAbertura
        });
      } catch (error) {
        console.error("Erro ao verificar status do caixa:", error);
        setCaixaStatus({ loading: false, caixaAberto: false, jaFezAbertura: false });
      }
    }

    if (currentUserName) {
      verificarStatusCaixa();
    }
  }, [currentUserName, location.pathname]);

  if (loading || (currentUserName && caixaStatus.loading)) return null;

  if (!user && !session) {
    return <Navigate to="/login" replace />;
  }

  // Regra 1: Se nunca fez abertura, só pode acessar a tela de Caixa
  if (!allowWithoutCaixa && !caixaStatus.jaFezAbertura) {
    if (location.pathname !== '/financeiro/caixa') {
      return <Navigate to="/financeiro/caixa" replace />;
    }
  }

  // Regra 2: PDV só funciona com caixa aberto
  if (onlyWhenCaixaOpen && !caixaStatus.caixaAberto) {
    return <Navigate to="/financeiro/caixa" replace />;
  }

  // Regra 3: Após fechamento, pode acessar outras telas (exceto PDV)
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Routes>
              {/* Rota de Login aberta */}
              <Route path="/login" element={<Login />} />

              {/* Rotas protegidas */}
              <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
                {/* Telas gerais - exigem que já tenha feito abertura */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/vendas" element={<Vendas />} />
                <Route path="/orcamentos" element={<Orcamentos />} />
                <Route path="/cadastro/pessoas" element={<Pessoas />} />
                <Route path="/cadastro/produtos" element={<Produtos />} />
                <Route path="/cadastro/empresa" element={<Empresa />} />
                <Route path="/cadastro/pagamentos" element={<FormasPagamento />} />
                <Route path="/financeiro/contas-pagar" element={<ContasPagar />} />
                <Route path="/financeiro/contas-receber" element={<ContasReceber />} />
                <Route path="/promocoes" element={<Promocoes />} />
                <Route path="/trocas" element={<Trocas />} />
                <Route path="/mensagens" element={<Mensagens />} />
                <Route path="/usuarios" element={<Usuarios />} />

                {/* PDV - só acessa com caixa ABERTO */}
                <Route 
                  path="/pdv" 
                  element={
                    <PrivateRoute onlyWhenCaixaOpen>
                      <PDV />
                    </PrivateRoute>
                  } 
                />

                {/* Caixa - sempre acessível após login */}
                <Route 
                  path="/financeiro/caixa" 
                  element={
                    <PrivateRoute allowWithoutCaixa>
                      <Caixa />
                    </PrivateRoute>
                  } 
                />
              </Route>
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
