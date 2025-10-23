import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gfnvmrqq.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmbnZtcnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI0NzQ4MDAsImV4cCI6MjA0ODA1MDgwMH0.example'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Soldier {
  id: number;
  name: string;
  position: string;
  sex: 'Male' | 'Female';
  age: number;
  status: 'Active' | 'Inactive';
  photo_data: string | null; // Can now handle large base64 strings
  created_at: string;
  updated_at: string;
}
