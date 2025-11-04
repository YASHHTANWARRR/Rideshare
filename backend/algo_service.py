from dotenv import load_dotenv
load_dotenv()

import os
import logging
import threading
import atexit
from typing import Dict, Any
from flask import Flask, request, jsonify
from flask_cors import CORS
from psycopg2 import pool
import psycopg2.extras

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

PGHOST = os.environ.get("PGHOST")
PGPORT = int(os.environ.get("PGPORT", 5432)) if os.environ.get("PGPORT") else 5432
PGDATABASE = os.environ.get("PGDATABASE", os.environ.get("DB_NAME", "rideshare"))
PGUSER = os.environ.get("PGUSER")
PGPASSWORD = os.environ.get("PGPASSWORD")
DATABASE_URL = os.environ.get("DATABASE_URL")

_pool_lock = threading.Lock()
_conn_pool = None

def get_pool():
    global _conn_pool
    with _pool_lock:
        if _conn_pool is None:
            if DATABASE_URL:
                logger.info("Creating connection pool from DATABASE_URL")
                _conn_pool = pool.SimpleConnectionPool(1, 10, dsn=DATABASE_URL)
            else:
                logger.info("Creating connection pool from PGHOST/PGUSER/PGDATABASE")
                _conn_pool = pool.SimpleConnectionPool(
                    1, 10,
                    host=PGHOST or "localhost",
                    port=PGPORT,
                    database=PGDATABASE,
                    user=PGUSER or "postgres",
                    password=PGPASSWORD or ""
                )
        return _conn_pool

def _get_conn():
    p = get_pool()
    return p.getconn()

def _put_conn(conn):
    p = get_pool()
    p.putconn(conn)

def close_pool():
    global _conn_pool
    with _pool_lock:
        if _conn_pool is not None:
            try:
                _conn_pool.closeall()
            except Exception as e:
                logger.exception("Error closing pool: %s", e)
            _conn_pool = None

atexit.register(close_pool)

def load_data() -> Dict[str, Any]:
    conn = _get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            cur.execute("SELECT uid, roll_no, name, email, gender, year, contact_number FROM users")
            users = cur.fetchall() or []
            cur.execute("SELECT gid, start, dest, stops, departure_date, capacity, preference, created_by FROM groups")
            groups = cur.fetchall() or []
            cur.execute("SELECT gid, uid, role, is_admin, joined_at FROM group_members")
            gm_rows = cur.fetchall() or []
            group_members = {}
            for r in gm_rows:
                gid = r['gid']
                group_members.setdefault(gid, []).append({
                    "uid": r['uid'],
                    "role": r.get('role'),
                    "is_admin": r.get('is_admin'),
                    "joined_at": r.get('joined_at')
                })
            cur.execute("SELECT u1 AS uid_a, u2 AS uid_b FROM connections")
            conn_rows = cur.fetchall() or []
            connections = [{"uid_a": r.get("uid_a"), "uid_b": r.get("uid_b")} for r in conn_rows]
            return {"users": users, "groups": groups, "group_members": group_members, "connections": connections}
        finally:
            cur.close()
    finally:
        _put_conn(conn)

app = Flask(__name__)
CORS(app, origins=os.getenv("CORS_ORIGIN", "*"))
_cached_data = {"data": None, "loaded_at": None}

@app.route("/health", methods=["GET"])
def health():
    try:
        conn = _get_conn()
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        finally:
            try:
                cur.close()
            except Exception:
                pass
            _put_conn(conn)
    except Exception as e:
        logger.exception("DB health check failed")
        return jsonify({"ok": False, "error": "db_unavailable", "details": str(e)}), 500
    model_loaded = bool(_cached_data["data"])
    return jsonify({"ok": True, "model_loaded": model_loaded}), 200

@app.route("/reload-model", methods=["POST"])
def reload_model():
    try:
        d = load_data()
        _cached_data["data"] = d
        import time
        _cached_data["loaded_at"] = time.time()
        logger.info("Data reloaded: users=%d groups=%d", len(d.get("users", [])), len(d.get("groups", [])))
        return jsonify({"ok": True, "msg": "data reloaded", "users": len(d.get("users", []))}), 200
    except Exception as e:
        logger.exception("reload_model failed")
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/predict", methods=["POST"])
def predict():
    try:
        payload = request.get_json(force=True, silent=True)
        if payload is None:
            return jsonify({"ok": False, "error": "empty json body"}), 400
        if _cached_data["data"] is None:
            try:
                _cached_data["data"] = load_data()
            except Exception as e:
                logger.exception("predict: failed to load data")
                return jsonify({"ok": False, "error": "failed_to_load_data", "details": str(e)}), 500
        resp = {
            "ok": True,
            "received": payload,
            "db_summary": {
                "users": len(_cached_data["data"].get("users", [])),
                "groups": len(_cached_data["data"].get("groups", [])),
            }
        }
        return jsonify(resp), 200
    except Exception as e:
        logger.exception("predict unhandled error")
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    try:
        _cached_data["data"] = load_data()
        logger.info("Initial data loaded (users=%d)", len(_cached_data["data"].get("users", [])))
    except Exception as e:
        logger.warning("Initial data load failed: %s", e)
    app.run(host="0.0.0.0", port=port, debug=debug)
