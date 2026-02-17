-- Add episode_id column to episode_cache table for proper episode tracking
-- This allows tracking individual episodes by their Xtream ID instead of relying on series-level cache

ALTER TABLE episode_cache ADD COLUMN episode_id INTEGER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS ix_episode_cache_episode_id ON episode_cache(episode_id);
CREATE INDEX IF NOT EXISTS ix_episode_cache_series_episode ON episode_cache(series_id, episode_id);
