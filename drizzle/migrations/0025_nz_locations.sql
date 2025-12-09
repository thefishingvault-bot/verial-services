ALTER TABLE services ADD COLUMN IF NOT EXISTS region varchar(255);
ALTER TABLE services ADD COLUMN IF NOT EXISTS suburb varchar(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS region varchar(255);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suburb varchar(255);
