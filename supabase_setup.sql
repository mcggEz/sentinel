-- Create soldiers table
CREATE TABLE IF NOT EXISTS soldiers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('Male', 'Female')),
  age INTEGER NOT NULL CHECK (age > 0),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  photo_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE soldiers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
CREATE POLICY "Allow all operations for authenticated users" ON soldiers
  FOR ALL USING (auth.role() = 'authenticated');

-- Create policy to allow all operations for anonymous users (for development)
CREATE POLICY "Allow all operations for anonymous users" ON soldiers
  FOR ALL USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_soldiers_updated_at
  BEFORE UPDATE ON soldiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
