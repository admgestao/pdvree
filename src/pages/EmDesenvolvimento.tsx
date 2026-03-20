import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const pageNames: Record<string, string> = {
  '/vendas': 'Vendas',
  '/orcamentos': 'Orçamentos',
  '/cadastro/pessoas': 'Cadastro de Pessoas',
  '/cadastro/produtos': 'Cadastro de Produtos',
  '/cadastro/empresa': 'Cadastro da Empresa',
  '/cadastro/pagamentos': 'Formas de Pagamento',
  '/financeiro/caixa': 'Caixa',
  '/financeiro/contas-pagar': 'Contas a Pagar',
  '/financeiro/contas-receber': 'Contas a Receber',
  '/trocas': 'Trocas e Devoluções',
  '/promocoes': 'Promoções',
  '/relatorios': 'Relatórios',
  '/mensagens': 'Mensagens',
  '/usuarios': 'Gerenciamento de Usuários',
  '/area-desenvolvedor': 'Área do Desenvolvedor',
};

export default function EmDesenvolvimento() {
  const location = useLocation();
  const pageName = pageNames[location.pathname] || 'Página';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 animate-fade-in">
      <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Construction className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-xl font-bold text-foreground mb-2">{pageName}</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Este módulo está em desenvolvimento e será implementado em breve.
        Todas as funcionalidades planejadas serão adicionadas progressivamente.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        Em construção
      </div>
    </div>
  );
}
