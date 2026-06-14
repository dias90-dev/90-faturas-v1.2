import { supabase } from './supabase';
import type { Database } from './supabase';

type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
type InvoiceInsert = Database['public']['Tables']['invoices']['Insert'];

export async function saveInvoiceToSupabase(invoice: any) {
  if (!supabase || !supabase.auth) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const invoiceData: InvoiceInsert = {
    id: invoice.id,
    userId: user.id,
    num: invoice.num,
    date: invoice.date,
    type: invoice.type,
    client: invoice.client,
    total: invoice.total,
    items: invoice.items,
    customFields: invoice.customFields || [],
    updated_at: new Date().toISOString()
  };

  const { error } = await (supabase as any)
    .from('invoices')
    .upsert(invoiceData);

  if (error) {
    console.error('Error saving invoice to Supabase:', error);
    throw error;
  }
}

export async function deleteInvoiceFromSupabase(id: string) {
  if (!supabase) return;
  const { error } = await (supabase as any)
    .from('invoices')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting invoice from Supabase:', error);
    throw error;
  }
}

export async function fetchInvoicesFromSupabase() {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching invoices from Supabase:', error);
    return [];
  }

  return (data as any[]).map(item => ({
    id: item.id,
    num: item.num,
    date: item.date,
    type: item.type,
    client: item.client,
    total: Number(item.total),
    items: item.items as any[],
    customFields: item.customFields as any[]
  }));
}

// Customers management
export async function saveCustomerToSupabase(customer: { name: string; nif?: string; email?: string }) {
  if (!supabase || !supabase.auth) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await (supabase as any)
    .from('customers')
    .insert({
      userId: user.id,
      ...customer
    } as any);

  if (error) throw error;
}

// Products management
export async function saveProductToSupabase(product: { name: string; price: number }) {
  if (!supabase || !supabase.auth) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await (supabase as any)
    .from('products')
    .insert({
      userId: user.id,
      ...product
    } as any);

  if (error) throw error;
}
