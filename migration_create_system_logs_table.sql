-- Create system_logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  level VARCHAR(20) NOT NULL CHECK (level IN ('ERROR', 'WARN', 'INFO', 'DEBUG')),
  tag VARCHAR(50),
  message TEXT NOT NULL,
  context JSONB,
  created_by VARCHAR(100) DEFAULT 'system'
);

-- Create indexes for better performance
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_tag ON system_logs(tag);

-- Enable Row Level Security
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

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
