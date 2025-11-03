# algo_service.py
# DB loader + small utils used by algo.py
from dotenv import load_dotenv
load_dotenv()

import os
from typing import Dict, Any
from psycopg2 import pool
import psycopg2.extras
import threading
import atexit

# env
PGHOST = os.environ.get("PGHOST", "localhost")
PGPORT = int(os.environ.get("PGPORT", 5432))
PGDATABASE = os.environ.get("PGDATABASE", "rideshare")
PGUSER = os.environ.get("PGUSER", "postgres")
PGPASSWORD = os.environ.get("PGPASSWORD", "")
DATABASE_URL = os.environ.get("DATABASE_URL", None)

_pool_lock = threading.Lock()
_conn_pool = None

def get_pool():
    global _conn_pool
    with _pool_lock:
        if _conn_pool is None:
            if DATABASE_URL:
                _conn_pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL)
            else:
                _conn_pool = pool.SimpleConnectionPool(
                    1, 10,
                    host=PGHOST,
                    port=PGPORT,
                    database=PGDATABASE,
                    user=PGUSER,
                    password=PGPASSWORD
                )
        return _conn_pool

def _get_conn():
    p = get_pool()
    return p.getconn()

def _put_conn(conn):
    p = get_pool()
    p.putconn(conn)

def load_data() -> Dict[str, Any]:
    conn = _get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            cur.execute("SELECT uid, roll_no, name, email, gender, year, contact_number FROM users")
            users = cur.fetchall()

            cur.execute("SELECT gid, start, dest, stops, departure_date, capacity, preference, created_by FROM groups")
            groups = cur.fetchall()

            cur.execute("SELECT gid, uid, role, is_admin, joined_at FROM group_members")
            gm_rows = cur.fetchall()
            group_members = {}
            for r in gm_rows:
                gid = r['gid']
                if gid not in group_members:
                    group_members[gid] = []
                group_members[gid].append({
                    "uid": r['uid'],
                    "role": r.get('role'),
                    "is_admin": r.get('is_admin'),
                    "joined_at": r.get('joined_at')
                })

            # alias u1/u2 -> uid_a/uid_b for algo.py
            cur.execute("SELECT u1 AS uid_a, u2 AS uid_b FROM connections")
            conn_rows = cur.fetchall()
            connections = []
            for r in conn_rows:
                connections.append({"uid_a": r.get("uid_a"), "uid_b": r.get("uid_b")})

            return {"users": users, "groups": groups, "group_members": group_members, "connections": connections}
        finally:
            cur.close()
    finally:
        _put_conn(conn)

def close_pool():
    global _conn_pool
    with _pool_lock:
        if _conn_pool is not None:
            _conn_pool.closeall()
            _conn_pool = None

atexit.register(close_pool)

if __name__ == "__main__":
    import json
    d = load_data()
    print("Loaded:", {
        "users": len(d["users"]),
        "groups": len(d["groups"]),
        "group_members_entries": sum(len(v) for v in d["group_members"].values()) if d["group_members"] else 0,
        "connections": len(d["connections"])
    })
    print(json.dumps(d["users"][:3], default=str, indent=2))
