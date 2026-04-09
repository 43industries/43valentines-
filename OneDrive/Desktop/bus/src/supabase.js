import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client = null;

export function getSupabase() {
  if (!url || !anon) return null;
  if (!client) client = createClient(url, anon);
  return client;
}

export function isSupabaseConfigured() {
  return Boolean(url && anon);
}
