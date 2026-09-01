declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_SUPABASE_URL: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
    NEXT_PUBLIC_SITE_URL?: string;
    SUPABASE_SECRET_KEY: string;
    OPENCODE_GO_API_KEY: string;
    TELEGRAM_BOT_TOKEN: string;
    TELEGRAM_CHAT_ID: string;
    OPENCODE_MATCH_MODEL?: string;
    OPENCODE_DOCUMENT_MODEL?: string;
    JOB_SEARCH_INTERVAL_HOURS?: string;
    MATCH_NOTIFICATION_THRESHOLD?: string;
  }
}
