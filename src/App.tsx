import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Layout } from "@/components/Layout";

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

// Componente para proteger as rotas
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const session = localStorage.getItem('pdv_user_session');

  if (loading) return null;

  if (!user && !session) {
    return <Navigate to="/login" replace />;
  }

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
                <Route path="/" element={<Dashboard />} />
                <Route path="/pdv" element={<PDV />} />
                <Route path="/vendas" element={<Vendas />} />
                <Route path="/orcamentos" element={<Orcamentos />} />
                <Route path="/cadastro/pessoas" element={<Pessoas />} />
                <Route path="/cadastro/produtos" element={<Produtos />} />
                <Route path="/cadastro/empresa" element={<Empresa />} />
                <Route path="/cadastro/pagamentos" element={<FormasPagamento />} />
                <Route path="/financeiro/caixa" element={<Caixa />} />
                <Route path="/financeiro/contas-pagar" element={<ContasPagar />} />
                <Route path="/financeiro/contas-receber" element={<ContasReceber />} />
                <Route path="/promocoes" element={<Promocoes />} />
                <Route path="/trocas" element={<Trocas />} />
                <Route path="/mensagens" element={<Mensagens />} />
                <Route path="/usuarios" element={<Usuarios />} />
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