-- Phase 6: Add explicit WITH CHECK to interaction_attachments and copilot_conversations
-- Functionally equivalent (Postgres falls back to USING), but explicit is best practice.

DROP POLICY IF EXISTS "Users can manage own attachments" ON interaction_attachments;
CREATE POLICY "Users can manage own attachments" ON interaction_attachments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own copilot conversations" ON copilot_conversations;
CREATE POLICY "Users can manage own copilot conversations" ON copilot_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
