-- Add close_reason column and migrate stopped_out rows
ALTER TABLE trades ADD COLUMN close_reason TEXT;

-- Migrate existing stopped_out trades to closed + stop_loss
UPDATE trades SET close_reason = 'stop_loss', status = 'closed' WHERE status = 'stopped_out';
