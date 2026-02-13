-- Migration 003: Add columns for manual sync execution tracking
-- Adds subscription_id, sync_type to schedule_executions
-- Adds server_id, sync_type to plex_schedule_executions

-- Add subscription_id column to schedule_executions (for manual syncs)
ALTER TABLE schedule_executions ADD COLUMN subscription_id INTEGER;

-- Add sync_type column to schedule_executions (for manual syncs)
ALTER TABLE schedule_executions ADD COLUMN sync_type VARCHAR;

-- Add server_id column to plex_schedule_executions (for manual syncs)
ALTER TABLE plex_schedule_executions ADD COLUMN server_id INTEGER;

-- Add sync_type column to plex_schedule_executions (for manual syncs)
ALTER TABLE plex_schedule_executions ADD COLUMN sync_type VARCHAR;
