-- Nexus CRM Cloud Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates all tables with RLS policies for multi-user support

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  how_we_met TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  keep_in_touch_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_updated_at ON contacts(user_id, updated_at);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contacts" ON contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TAGS
-- ============================================================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tags_user_id ON tags(user_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CONTACT_TAGS (junction)
-- ============================================================
CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

CREATE INDEX idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_tags" ON contact_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_groups_user_id ON groups(user_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own groups" ON groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CONTACT_GROUPS (junction)
-- ============================================================
CREATE TABLE contact_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, group_id)
);

CREATE INDEX idx_contact_groups_contact ON contact_groups(contact_id);
CREATE INDEX idx_contact_groups_group ON contact_groups(group_id);

ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_groups" ON contact_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INTERACTIONS
-- ============================================================
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('meeting', 'call', 'email', 'note', 'coffee', 'event', 'other')),
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interactions_contact ON interactions(contact_id);
CREATE INDEX idx_interactions_user_date ON interactions(user_id, date DESC);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own interactions" ON interactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  completed BOOLEAN NOT NULL DEFAULT false,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'weekly', 'monthly', 'quarterly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_user_due ON reminders(user_id, due_date);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reminders" ON reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SETTINGS
-- ============================================================
CREATE TABLE settings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================
CREATE TABLE custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT '',
  field_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_fields_contact ON custom_fields(contact_id);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own custom_fields" ON custom_fields FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- IMPORTANT DATES
-- ============================================================
CREATE TABLE important_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_important_dates_contact ON important_dates(contact_id);

ALTER TABLE important_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own important_dates" ON important_dates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update on row change)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_tags_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_interactions_updated_at BEFORE UPDATE ON interactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_custom_fields_updated_at BEFORE UPDATE ON custom_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_important_dates_updated_at BEFORE UPDATE ON important_dates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
