import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dllnzitdmhetxefajvjr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbG56aXRkbWhldHhlZmFqdmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODUwMzgsImV4cCI6MjA4OTI2MTAzOH0.dgN5ul6X43k1g402CEOP85t6vrN2NjC3HxTDbodYyTA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function logAction(usuario_id: string, acao: string, descricao?: string) {
  try {
    await supabase.from('logs_sistema').insert({
      usuario_id,
      acao,
      descricao: descricao || null,
    });
  } catch (e) {
    console.error('Erro ao registrar log:', e);
  }
}
