import {
  LayoutDashboard, ShoppingCart, FileText, Users, Package, Building2,
  CreditCard, Wallet, ArrowDownUp, TrendingDown,
  TrendingUp, Tag, MessageSquare, Settings, Code, LogOut,
  ChevronDown, Store,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, THEMES, ThemeId } from '@/contexts/ThemeContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NavLink } from '@/components/NavLink';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const menuGroups = [
  {
    label: 'Principal',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'PDV', url: '/pdv', icon: ShoppingCart },
      { title: 'Vendas', url: '/vendas', icon: Store },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { title: 'Pessoas', url: '/cadastro/pessoas', icon: Users },
      { title: 'Produtos', url: '/cadastro/produtos', icon: Package },
      { title: 'Empresa', url: '/cadastro/empresa', icon: Building2 },
      { title: 'Formas de Pagamento', url: '/cadastro/pagamentos', icon: CreditCard },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { title: 'Caixa', url: '/financeiro/caixa', icon: Wallet },
      { title: 'Contas a Pagar', url: '/financeiro/contas-pagar', icon: TrendingDown },
      { title: 'Contas a Receber', url: '/financeiro/contas-receber', icon: TrendingUp },
    ],
  },
  {
    label: 'Operações',
    items: [
      { title: 'Orçamentos', url: '/orcamentos', icon: FileText },
      { title: 'Trocas e Devoluções', url: '/trocas', icon: ArrowDownUp },
      { title: 'Promoções', url: '/promocoes', icon: Tag },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { title: 'Mensagens', url: '/mensagens', icon: MessageSquare },
    ],
  },
];

const systemItems = [
  { title: 'Usuários', url: '/usuarios', icon: Settings, adminOnly: true },
  { title: 'Área Desenvolvedor', url: '/area-desenvolvedor', icon: Code, devOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isDeveloper } = useAuth();
  const { theme, setTheme } = useTheme();

  const isActive = (path: string) => location.pathname === path;

  const handleLogoutWithCheck = async () => {
    try {
      // Usando a mesma lógica de data do PDV para consistência
      const hoje = new Date().toLocaleDateString('en-CA');
      
      const { data, error } = await supabase
        .from('caixa_movimentos')
        .select('tipo')
        .gte('criado_em', `${hoje}T00:00:00`)
        .lte('criado_em', `${hoje}T23:59:59`)
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Lógica robusta: verifica o ÚLTIMO movimento do dia
      const ultimoMovimento = data && data.length > 0 ? data[0].tipo : null;

      if (ultimoMovimento === 'abertura') {
        const confirmar = window.confirm(
          "ATENÇÃO: O caixa ainda está aberto!\n\nVocê deve realizar o fechamento antes de sair.\n\nDeseja ir para a tela de Caixa agora?"
        );

        if (confirmar) {
          navigate('/financeiro/caixa');
          return;
        }
        // Se o usuário clicar em "Cancelar" no confirm, ele NÃO desloga.
        return; 
      }

      // Se o último movimento for 'fechamento' ou não houver movimentos (caixa nem abriu)
      await logout();
      navigate('/login');
    } catch (error) {
      console.error("Erro ao verificar caixa:", error);
      // Em caso de erro crítico de rede, permitimos o logout para não prender o usuário
      await logout();
      navigate('/login');
    }
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Store className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">PlanexPDV</p>
              <p className="text-[10px] text-muted-foreground">Sistema de Vendas</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Store className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin scrollbar-thumb-zinc-800">
        {menuGroups.map((group) => (
          <Collapsible key={group.label} defaultOpen>
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  {!collapsed && group.label}
                  {!collapsed && <ChevronDown className="h-3 w-3" />}
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive(item.url)}
                          tooltip={collapsed ? item.title : undefined}
                        >
                          <NavLink
                            to={item.url}
                            end
                            className="transition-colors"
                            activeClassName="bg-accent text-accent-foreground font-medium"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {!collapsed && 'Sistema'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems
                .filter((item) => {
                  if (user?.nome_usuario === 'planex') return true;
                  if (item.adminOnly && isAdmin) return true;
                  if (item.devOnly && isDeveloper) return true;
                  return false;
                })
                .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink
                        to={item.url}
                        end
                        className="transition-colors"
                        activeClassName="bg-accent text-accent-foreground font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Tema
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as ThemeId)}
                    title={t.label}
                    className={`h-7 w-7 rounded-md text-xs flex items-center justify-center transition-all
                      ${theme === t.id ? 'ring-2 ring-primary scale-110' : 'hover:scale-105 opacity-60 hover:opacity-100'}
                    `}
                  >
                    {t.icon}
                  </button>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-border/50">
        {!collapsed && (
          <div className="flex items-center justify-between w-full gap-2 px-1">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">
                {user?.name || user?.nome_completo || 'Usuário'} 
              </span>
              <span className="text-[10px] text-muted-foreground capitalize truncate">
                {user?.nome_usuario === 'planex' ? 'Acesso Master' : (user?.role || 'Acesso Padrão')}
              </span>
            </div>
            
            <button
              onClick={handleLogoutWithCheck}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              title="Sair do Sistema"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        {collapsed && (
          <button
            onClick={handleLogoutWithCheck}
            className="w-full flex justify-center p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}