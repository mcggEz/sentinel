-- Create system_logs table (drop if exists to avoid conflicts)
DROP TABLE IF EXISTS system_logs CASCADE;

-- Create new system_logs table with proper schema
CREATE TABLE system_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  level VARCHAR(20) NOT NULL CHECK (level IN ('ERROR', 'WARN', 'INFO', 'DEBUG')),
  tag VARCHAR(50),
  message TEXT NOT NULL,
  context JSONB,
  created_by VARCHAR(100) DEFAULT 'system'
);

-- Create indexes for better performance (only if they don't exist)
DO $$
BEGIN
  -- Create index for created_at if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_system_logs_created_at') THEN
    CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
  END IF;
  
  -- Create index for level if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_system_logs_level') THEN
    CREATE INDEX idx_system_logs_level ON system_logs(level);
  END IF;
  
  -- Create index for tag if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_system_logs_tag') THEN
    CREATE INDEX idx_system_logs_tag ON system_logs(tag);
  END IF;
END $$;

-- Enable Row Level Security
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON system_logs;
DROP POLICY IF EXISTS "Allow all operations for anonymous users" ON system_logs;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON system_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- Create policy to allow all operations for anonymous users (for development)
CREATE POLICY "Allow all operations for anonymous users" ON system_logs
  FOR ALL USING (true);

-- Insert some sample system logs
INSERT INTO system_logs (level, tag, message, context) VALUES
('INFO', 'SYSTEM', 'Sentinel Command Center initialized', '{"version": "1.0.0"}'),
('INFO', 'CAMERA', 'Camera started successfully', '{"action": "start"}'),
('INFO', 'HAND_DETECTION', 'Hand landmarks detected: 21 points', '{"landmarksCount": 21, "timestamp": "2024-01-01T00:00:00Z"}'),
('WARN', 'FACE_DETECTION', 'No face detected in current frame', '{"frameCount": 1}'),
('ERROR', 'CAMERA', 'Camera access denied', '{"error": "Permission denied"}');
