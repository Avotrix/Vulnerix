-- Add org_name to tech_stack unique identity
ALTER TABLE tech_stack DROP CONSTRAINT IF EXISTS uq_tech_stack_entry;
ALTER TABLE tech_stack ADD CONSTRAINT uq_tech_stack_entry UNIQUE (email_id, org_name, vendor, product_name, version);
