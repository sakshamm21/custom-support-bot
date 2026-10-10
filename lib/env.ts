function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => process.env.SUPABASE_URL || req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  openrouterKey: () => req("OPENROUTER_API_KEY"),
  adminPassword: () => req("ADMIN_PASSWORD"),
  embedModel: () => process.env.EMBED_MODEL || "openai/text-embedding-3-small",
  appUrl: () => process.env.APP_URL || "",
};
