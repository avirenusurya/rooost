import { createClient } from '@supabase/supabase-js';
import type { Workspace } from './types';

// The publishable key is meant to ship to browsers. Row level security protects the data.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://iwbvnififwsvhctfonsq.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_2NLSn9sjVpB51z9mJ6qBcg_oA4qY5uI';

// Cloudflare's always-pass test key stands in during development, where the real key is refused.
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ??
  (import.meta.env.DEV ? '1x00000000000000000000AA' : '0x4AAAAAAF5c_Wp7OnSOZobr');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { detectSessionInUrl: false },
});

export type CloudUser = { id: string; email: string };
export type CloudRow = { data: unknown; version: number };

export async function sendCode(email: string, captchaToken: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { captchaToken } });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

/** Removes the login. The database then removes the saved workspace along with it. */
export async function deleteCloudAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

export async function fetchCloud(userId: string): Promise<CloudRow | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('data, version')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudRow | null;
}

export async function insertCloud(userId: string, workspace: Workspace): Promise<number> {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ user_id: userId, data: workspace })
    .select('version');
  if (error) throw error;
  return (data as { version: number }[])[0].version;
}

/** Saves only if nobody else has saved since. Returns null when someone has. */
export async function updateCloud(
  userId: string,
  workspace: Workspace,
  expectedVersion: number,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('workspaces')
    .update({
      data: workspace,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('version', expectedVersion)
    .select('version');
  if (error) throw error;
  const rows = data as { version: number }[];
  return rows.length > 0 ? rows[0].version : null;
}
