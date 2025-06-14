import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = 'https://ycgvvealqmxsenbadstb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZ3Z2ZWFscW14c2VuYmFkc3RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5MjMwOTksImV4cCI6MjA2NTQ5OTA5OX0.aaqFtUik32YNN10ALGAyqhTuYB7QS7PEMPFmvAGgbRI'

console.log('✅ Supabase configured:', supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey) 