-- Lifestyle Execution App Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE task_frequency AS ENUM ('daily', 'every_2_days', 'weekly', 'custom');
CREATE TYPE task_status AS ENUM ('completed', 'missed', 'pending');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL
);

-- Goals table
CREATE TABLE public.goals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    deadline DATE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Tasks (Lead Measures) table
CREATE TABLE public.tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    frequency task_frequency NOT NULL,
    custom_days INTEGER, -- for custom frequency (every N days)
    start_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL
);

-- Task logs table (tracks completion/missed status)
CREATE TABLE public.task_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
    due_date DATE NOT NULL,
    status task_status DEFAULT 'pending',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    UNIQUE(task_id, due_date)
);

-- Weekly reviews table
CREATE TABLE public.weekly_reviews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
    review_date DATE NOT NULL,
    stayed_on_track BOOLEAN,
    reflection_text TEXT,
    improvement_notes TEXT,
    auto_suggestions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('America/New_York'::text, now()) NOT NULL,
    UNIQUE(user_id, goal_id, review_date)
);

-- Row Level Security (RLS) Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON public.users
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can manage own goals" ON public.goals
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage tasks for own goals" ON public.tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.goals 
            WHERE goals.id = tasks.goal_id 
            AND goals.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own task logs" ON public.task_logs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tasks 
            JOIN public.goals ON goals.id = tasks.goal_id
            WHERE tasks.id = task_logs.task_id 
            AND goals.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own weekly reviews" ON public.weekly_reviews
    FOR ALL USING (auth.uid() = user_id);

-- Functions for automatic user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('America/New_York'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.goals
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.task_logs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to automatically mark overdue tasks as missed (run daily via cron)
CREATE OR REPLACE FUNCTION public.mark_overdue_tasks_as_missed()
RETURNS void AS $$
BEGIN
    -- Mark pending tasks as missed if their due_date has passed
    UPDATE public.task_logs 
    SET status = 'missed', 
        updated_at = timezone('America/New_York'::text, now())
    WHERE status = 'pending' 
    AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate task logs for active tasks
CREATE OR REPLACE FUNCTION public.generate_task_logs_for_date(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
    task_record RECORD;
    last_completion_date DATE;
    days_since_start INTEGER;
    should_create_log BOOLEAN;
BEGIN
    FOR task_record IN 
        SELECT t.*, g.user_id 
        FROM public.tasks t
        JOIN public.goals g ON g.id = t.goal_id
        WHERE t.is_active = TRUE 
        AND g.is_archived = FALSE
        AND t.start_date <= target_date
    LOOP
        should_create_log := FALSE;
        
        -- Calculate if task should have a log for target_date based on frequency
        CASE task_record.frequency
            WHEN 'daily' THEN
                should_create_log := TRUE;
            WHEN 'every_2_days' THEN
                -- Find last completion or start from start_date
                SELECT COALESCE(MAX(due_date), task_record.start_date - 1) 
                INTO last_completion_date
                FROM public.task_logs 
                WHERE task_id = task_record.id AND status = 'completed';
                
                should_create_log := (target_date - last_completion_date) >= 2;
            WHEN 'weekly' THEN
                days_since_start := target_date - task_record.start_date;
                should_create_log := (days_since_start % 7 = 0) AND days_since_start >= 0;
            WHEN 'custom' THEN
                SELECT COALESCE(MAX(due_date), task_record.start_date - 1) 
                INTO last_completion_date
                FROM public.task_logs 
                WHERE task_id = task_record.id AND status = 'completed';
                
                should_create_log := (target_date - last_completion_date) >= task_record.custom_days;
        END CASE;
        
        -- Create log if needed and doesn't already exist
        IF should_create_log THEN
            INSERT INTO public.task_logs (task_id, due_date, status)
            VALUES (task_record.id, target_date, 'pending')
            ON CONFLICT (task_id, due_date) DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX idx_goals_user_id ON public.goals(user_id);
CREATE INDEX idx_goals_deadline ON public.goals(deadline);
CREATE INDEX idx_tasks_goal_id ON public.tasks(goal_id);
CREATE INDEX idx_task_logs_task_id ON public.task_logs(task_id);
CREATE INDEX idx_task_logs_due_date ON public.task_logs(due_date);
CREATE INDEX idx_task_logs_status ON public.task_logs(status);
CREATE INDEX idx_weekly_reviews_user_id ON public.weekly_reviews(user_id);
CREATE INDEX idx_weekly_reviews_date ON public.weekly_reviews(review_date);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated; 