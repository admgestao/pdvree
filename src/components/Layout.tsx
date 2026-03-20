import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { VisibilityProvider } from '@/contexts/VisibilityContext';

export function Layout() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  return (
    <VisibilityProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-12 flex items-center border-b border-border px-2 shrink-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </header>
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </VisibilityProvider>
  );
}
