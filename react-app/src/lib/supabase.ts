import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Same anon keys that ship in the legacy HTML. These are publishable by design;
// data access is controlled by Supabase Row Level Security, not secrecy.
const ROADYS_SB_URL = 'https://yyhnnalsqzyghjqtfisy.supabase.co';
const ROADYS_SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5aG5uYWxzcXp5Z2hqcXRmaXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDE4NzksImV4cCI6MjA4OTQxNzg3OX0.misOc3tEQD0GBOsjNkv6Im8wUmlfXhiX97DflpgaqAc';

let client: SupabaseClient | null = null;

export function getRoadysSB(): SupabaseClient {
  if (!client) {
    client = createClient(ROADYS_SB_URL, ROADYS_SB_ANON);
  }
  return client;
}
