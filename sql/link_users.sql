-- ==========================================
-- SEAMLESS LOGIN MIGRATION
-- ==========================================
-- Explicitly links known emails to their households.
-- This bypasses the "Join" screen for Nikhil & Zuzana.

DO $$
DECLARE
    v_n_email TEXT := 'nikshanbhag@gmail.com';
    v_z_email TEXT := 'zshanbhag@gmail.com'; -- Guessing Zuzana's email
    v_house_id UUID;
    v_n_user_id UUID;
    v_z_user_id UUID;
BEGIN
    -- 1. Find the target household
    SELECT id INTO v_house_id FROM households WHERE handle = 'shanbhag-26';
    
    IF v_house_id IS NULL THEN
        RAISE NOTICE 'Household shanbhag-26 not found. Skipping mapping.';
        RETURN;
    END IF;

    -- 2. Link Nikhil if he exists in auth.users
    SELECT id INTO v_n_user_id FROM auth.users WHERE email = v_n_email;
    IF v_n_user_id IS NOT NULL THEN
        INSERT INTO public.app_users (id, household_id)
        VALUES (v_n_user_id, v_house_id)
        ON CONFLICT (id) DO UPDATE SET household_id = EXCLUDED.household_id;
        RAISE NOTICE 'Linked Nikhil to shanbhag-26';
    END IF;

    -- 3. Link Zuzana if she exists in auth.users
    SELECT id INTO v_z_user_id FROM auth.users WHERE email = v_z_email;
    IF v_z_user_id IS NOT NULL THEN
        INSERT INTO public.app_users (id, household_id)
        VALUES (v_z_user_id, v_house_id)
        ON CONFLICT (id) DO UPDATE SET household_id = EXCLUDED.household_id;
        RAISE NOTICE 'Linked Zuzana to shanbhag-26';
    END IF;
END $$;
