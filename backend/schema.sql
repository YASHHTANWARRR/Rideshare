-- schema.sql
-- Tables for rideshare app

CREATE TABLE IF NOT EXISTS users (
  uid SERIAL PRIMARY KEY,
  roll_no VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(256) NOT NULL,
  email VARCHAR(256) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  gender CHAR(1),
  year INT,
  contact_number VARCHAR(32),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  gid SERIAL PRIMARY KEY,
  start TEXT,
  dest TEXT,
  stops TEXT,
  departure_date TIMESTAMP WITH TIME ZONE,
  capacity INT DEFAULT 4,
  preference VARCHAR(32) DEFAULT 'ALL',
  created_by INT REFERENCES users(uid),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  gid INT REFERENCES groups(gid),
  uid INT REFERENCES users(uid),
  role VARCHAR(32),
  is_admin BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (gid, uid)
);

CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  u1 INT REFERENCES users(uid),
  u2 INT REFERENCES users(uid),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- refresh_tokens: server also creates it, but keeping here is fine (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  uid INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- helper function: user_connection_degree
-- NOTE: mark STABLE (not IMMUTABLE) because it reads tables.
CREATE OR REPLACE FUNCTION user_connection_degree(a INT, b INT) RETURNS INT AS $$
  WITH RECURSIVE conn(path, last) AS (
    SELECT ARRAY[a], a
    UNION
    SELECT path || u2, u2
    FROM conn
    JOIN connections c ON c.u1 = conn.last
    JOIN users u2 ON u2.uid = c.u2
    WHERE NOT u2.uid = ANY(path)
  )
  SELECT array_length(path,1)-1 FROM conn WHERE last = b LIMIT 1;
$$ LANGUAGE SQL STABLE;
