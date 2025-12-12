-- Text search index for title + description
CREATE INDEX IF NOT EXISTS services_search_tsv_idx
  ON services USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Case-insensitive suburb filter support
CREATE INDEX IF NOT EXISTS services_suburb_lower_idx
  ON services (lower(suburb));

-- Pagination sorting
CREATE INDEX IF NOT EXISTS services_created_at_idx
  ON services (created_at);
