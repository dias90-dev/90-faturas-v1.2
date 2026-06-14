import { createClient } from '@supabase/supabase-js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          created_at: string
        }
        Insert: {
          id: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          userId: string
          name: string
          nif: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          userId: string
          name: string
          nif?: string
          email?: string
          created_at?: string
        }
        Update: {
          id?: string
          userId?: string
          name?: string
          nif?: string
          email?: string
          created_at?: string
        }
      }
      products: {
        Row: {
          id: string
          userId: string
          name: string
          price: number
          created_at: string
        }
        Insert: {
          id?: string
          userId: string
          name: string
          price: number
          created_at?: string
        }
        Update: {
          id?: string
          userId?: string
          name?: string
          price?: number
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          userId: string
          num: string
          date: string
          type: string
          client: string
          total: number
          items: Json
          customFields: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          userId: string
          num: string
          date: string
          type: string
          client: string
          total: number
          items: Json
          customFields?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          userId?: string
          num?: string
          date?: string
          type?: string
          client?: string
          total?: number
          items?: Json
          customFields?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && supabaseUrl !== 'undefined' && supabaseAnonKey !== 'undefined') 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null as unknown as ReturnType<typeof createClient<Database>>;

if (!supabase) {
  console.warn('Supabase URL or Anon Key is missing. Supabase features will be disabled until configured.');
}
