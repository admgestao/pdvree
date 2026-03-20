import { useState, useEffect } from 'react';
import { supabase, logAction } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Building2, Save, Loader2 } from 'lucide-react';

interface EmpresaData {
  id?: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  contato: string;
  email: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
}

const EMPTY: EmpresaData = {
  cnpj: '', razao_social: '', nome_fantasia: '', contato: '',
  email: '', endereco: '', numero: '', bairro: '', cidade: '', cep: '',
};

export default function Empresa() {
  const { user } = useAuth();
  const [form, setForm] = useState<EmpresaData>(EMPTY);
  const [mesmoNome, setMesmoNome] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEmpresa();
  }, []);

  useEffect(() => {
    if (mesmoNome) setForm(f => ({ ...f, nome_fantasia: f.razao_social }));
  }, [mesmoNome, form.razao_social]);

  async function loadEmpresa() {
    try {
      const { data } = await supabase.from('empresa').select('*').limit(1).single();
      if (data) {
        setForm(data);
        if (data.nome_fantasia === data.razao_social) setMesmoNome(true);
      }
    } finally {
      setLoading(false);
    }
  }

  function formatCNPJ(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }

  function formatCEP(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.replace(/^(\d{5})(\d)/, '$1-$2');
  }

  function formatPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  }

  function set(field: keyof EmpresaData, value: string) {
    let v = value;
    if (field === 'cnpj') v = formatCNPJ(value);
    if (field === 'cep') v = formatCEP(value);
    if (field === 'contato') v = formatPhone(value);
    setForm(f => ({ ...f, [field]: v }));
  }

  async function handleSave() {
    if (!form.razao_social || !form.cnpj) {
      toast.error('CNPJ e Razão Social são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      delete (payload as any).id;

      if (form.id) {
        await supabase.from('empresa').update(payload).eq('id', form.id);
      } else {
        const { data } = await supabase.from('empresa').insert(payload).select().single();
        if (data) setForm(data);
      }

      await logAction(user?.id || '', 'empresa_salva', 'Dados da empresa atualizados');
      toast.success('Dados salvos com sucesso!');
    } catch {
      toast.error('Erro ao salvar no banco');
    }
    setSaving(false);
  }

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Cadastro da Empresa</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Razão Social</Label>
              <Input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Checkbox checked={mesmoNome} onCheckedChange={v => setMesmoNome(!!v)} id="mesmoNome" />
                <Label htmlFor="mesmoNome" className="text-xs">Nome Fantasia igual à Razão Social</Label>
              </div>
              <Input value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} disabled={mesmoNome} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contato</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.contato} onChange={e => set('contato', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Endereço</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2"><Label>Rua</Label><Input value={form.endereco} onChange={e => set('endereco', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Nº</Label><Input value={form.numero} onChange={e => set('numero', e.target.value)} /></div>
              <div className="space-y-2"><Label>CEP</Label><Input value={form.cep} onChange={e => set('cep', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Bairro</Label><Input value={form.bairro} onChange={e => set('bairro', e.target.value)} /></div>
              <div className="space-y-2"><Label>Cidade</Label><Input value={form.cidade} onChange={e => set('cidade', e.target.value)} /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Dados
        </Button>
      </div>
    </div>
  );
}