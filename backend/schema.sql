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
  u1 INT REFERENCES users(uid) NOT NULL,
  u2 INT REFERENCES users(uid) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT connections_no_self CHECK (u1 <> u2)
);

CREATE UNIQUE INDEX IF NOT EXISTS connections_undirected_unique
  ON connections (LEAST(u1, u2), GREATEST(u1, u2));

CREATE INDEX IF NOT EXISTS connections_u1_idx ON connections(u1);
CREATE INDEX IF NOT EXISTS connections_u2_idx ON connections(u2);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  uid INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

CREATE OR REPLACE FUNCTION user_connection_degree(a INT, b INT) RETURNS INT AS $$
  WITH RECURSIVE bfs(node, depth, path) AS (
    SELECT a::int, 0, ARRAY[a::int]
    UNION ALL
    SELECT
      CASE WHEN c.u1 = bfs.node THEN c.u2 ELSE c.u1 END,
      bfs.depth + 1,
      bfs.path || CASE WHEN c.u1 = bfs.node THEN c.u2 ELSE c.u1 END
    FROM bfs
    JOIN connections c
      ON c.u1 = bfs.node OR c.u2 = bfs.node
    WHERE NOT (CASE WHEN c.u1 = bfs.node THEN c.u2 ELSE c.u1 END = ANY(bfs.path))
  )
  SELECT MIN(depth) FROM bfs WHERE node = b;
$$ LANGUAGE SQL STABLE;

