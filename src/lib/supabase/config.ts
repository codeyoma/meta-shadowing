export type SupabasePublicEnvironment = {
  url: string;
  publishableKey: string;
};

export function readSupabasePublicEnvironment(): SupabasePublicEnvironment | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return url && publishableKey ? { url, publishableKey } : null;
}
