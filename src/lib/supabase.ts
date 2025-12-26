import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'https://example.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY || 'example-key'

if (!process.env.SUPABASE_URL) {
    console.warn('SUPABASE_URL is missing. Using placeholder.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
