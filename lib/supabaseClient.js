import { createBrowserClient } from '@supabase/ssr';

let client;

export default function getSupabaseClient() {
    if (!client) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        }

        client = createBrowserClient(supabaseUrl, supabaseAnonKey);
    }

    return client;
}

export { getSupabaseClient };

