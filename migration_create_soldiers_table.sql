-- Drop existing table if it exists
DROP TABLE IF EXISTS soldiers CASCADE;

-- Create new soldiers table with proper schema
CREATE TABLE soldiers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  sex VARCHAR(10) NOT NULL CHECK (sex IN ('Male', 'Female')),
  age INTEGER NOT NULL CHECK (age > 0 AND age < 120),
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  photo_data VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX idx_soldiers_name ON soldiers(name);
CREATE INDEX idx_soldiers_status ON soldiers(status);
CREATE INDEX idx_soldiers_created_at ON soldiers(created_at);

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

-- Insert some sample data
INSERT INTO soldiers (name, position, sex, age, status, photo_data) VALUES
('John Doe', 'Sergeant', 'Male', 28, 'Active', 'JD'),
('Jane Smith', 'Lieutenant', 'Female', 32, 'Active', 'JS'),
('Mike Johnson', 'Corporal', 'Male', 25, 'Active', 'MJ');
