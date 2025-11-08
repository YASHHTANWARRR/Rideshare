// server.js — full auth + trips + search + my-rides
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Configuration ----------
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_TOKEN_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || "30d";

// ---------- Postgres pool ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "rideshare",
  password: process.env.PGPASSWORD || "postgres",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
});

// refresh_tokens table (idempotent)
async function ensureRefreshTable() {
  const q = `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token TEXT PRIMARY KEY,
      uid INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ
    );`;
  await pool.query(q);
}
ensureRefreshTable().catch((e) => console.error("ensure refresh_tokens:", e));

// ---------- Utilities ----------
function respondError(res, code = 500, message = "internal server error") {
  return res.status(code).json({ ok: false, error: message });
}
function ok(res, payload = {}) {
  return res.json({ ok: true, ...payload });
}
function safeInt(val, fallback = null) {
  if (val === null || typeof val === "undefined") return fallback;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? fallback : n;
}
const ALLOWED_PREFERENCES = new Set(["ALL", "FEMALE_ONLY"]);
function validatePreference(p) {
  if (!p) return true;
  return ALLOWED_PREFERENCES.has(String(p));
}
function sanitizeAndLimitText(s, maxLen = 200) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim();
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}
function createAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// ---------- Rate limiting ----------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { ok: false, error: "Too many requests, please try again later." },
});

// ---------- Helpers ----------
function stopsToRoute(start, stops, dest) {
  const middle =
    stops && typeof stops === "string" && stops.length
      ? stops.split("|").map((s) => s.trim()).filter(Boolean)
      : [];
  const route = [];
  if (start) route.push(start);
  route.push(...middle);
  if (dest) route.push(dest);
  return route;
}
function safeDegree(val) {
  if (val === null || typeof val === "undefined") return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}
async function formatGroupByRow(g, viewer_uid = null) {
  const gid = g.gid;
  let membersRes;
  if (viewer_uid) {
    membersRes = await pool.query(
      `SELECT u.uid, u.roll_no, u.name, u.year, gm.role, gm.is_admin, gm.joined_at,
              user_connection_degree($2, u.uid) AS degree
       FROM group_members gm
       JOIN users u ON gm.uid = u.uid
       WHERE gm.gid = $1
       ORDER BY gm.joined_at ASC`,
      [gid, viewer_uid]
    );
  } else {
    membersRes = await pool.query(
      `SELECT u.uid, u.roll_no, u.name, u.year, gm.role, gm.is_admin, gm.joined_at,
              NULL::int AS degree
       FROM group_members gm
       JOIN users u ON gm.uid = u.uid
       WHERE gm.gid = $1
       ORDER BY gm.joined_at ASC`,
      [gid]
    );
  }

  const members = membersRes.rows.map((r) => ({
    uid: r.uid,
    roll_no: r.roll_no,
    name: r.name,
    year: r.year,
    role: r.role,
    is_admin: r.is_admin,
    joined_at: r.joined_at,
    degree: safeDegree(r.degree),
  }));

  const count = members.length;
  const capacity = g.capacity || 0;
  const seats_left = Math.max(0, capacity - count);

  return {
    gid: g.gid,
    route: stopsToRoute(g.start, g.stops, g.dest),
    seats_left,
    capacity,
    preference: g.preference,
    departure_date: g.departure_date,
    created_by: g.created_by,
    members,
  };
}

// ---------- Auth middleware ----------
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return respondError(res, 401, "missing token");
  const token = auth.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    return next();
  } catch (err) {
    return respondError(res, 401, "invalid or expired token");
  }
}

// ---------- Routes ----------

// Health
app.get("/", (_req, res) =>
  res.json({ ok: true, msg: "rideshare server running" })
);

// -------- AUTH --------

// Register
app.post("/register", authLimiter, async (req, res) => {
  try {
    const raw = req.body || {};
    const name = sanitizeAndLimitText(raw.name, 120);
    const rollNo = sanitizeAndLimitText(raw.rollNo, 60);
    const email = sanitizeAndLimitText(raw.email, 200);
    const password = raw.password;
    const gender = raw.gender ? String(raw.gender).toUpperCase() : null;
    const year = safeInt(raw.year, null);
    const contact_number = sanitizeAndLimitText(raw.contact_number, 30);

    if (!name || !rollNo || !email || !password)
      return respondError(res, 400, "name, rollNo, email and password required");
    if (!email.toLowerCase().endsWith("@thapar.edu"))
      return respondError(res, 400, "please use your thapar.edu email");
    if (gender && !["M", "F"].includes(gender))
      return respondError(res, 400, "gender must be 'M' or 'F'");
    if (year !== null && (year < 1 || year > 6))
      return respondError(res, 400, "year must be between 1 and 6");

    const hashed = await bcrypt.hash(password, 10);
    const q = `
      INSERT INTO users (roll_no, name, email, password, gender, year, contact_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING uid, roll_no, name, email, gender, year, contact_number
    `;
    const vals = [
      rollNo,
      name,
      email.toLowerCase(),
      hashed,
      gender,
      year,
      contact_number,
    ];
    const r = await pool.query(q, vals);

    const user = r.rows[0];
    const accessToken = createAccessToken({
      uid: user.uid,
      roll_no: user.roll_no,
    });
    const refreshToken = jwt.sign({ uid: user.uid }, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES,
    });

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await pool.query(
      `INSERT INTO refresh_tokens (token, uid, expires_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [refreshToken, user.uid, expiresAt]
    );

    return ok(res, { user, accessToken, refreshToken });
  } catch (err) {
    if (err && err.code === "23505")
      return respondError(res, 400, "roll_no or email already exists");
    console.error("register error:", err);
    return respondError(res, 500, "server error");
  }
});

// Login
app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return respondError(res, 400, "email and password required");
    const emailNorm = String(email).toLowerCase();

    const r = await pool.query(
      `SELECT uid, roll_no, name, email, password, gender, year, contact_number
       FROM users WHERE email = $1 LIMIT 1`,
      [emailNorm]
    );
    if (r.rowCount === 0) return respondError(res, 401, "invalid credentials");

    const row = r.rows[0];
    const match = await bcrypt.compare(password, row.password);
    if (!match) return respondError(res, 401, "invalid credentials");

    const accessToken = createAccessToken({
      uid: row.uid,
      roll_no: row.roll_no,
    });
    const refreshToken = jwt.sign({ uid: row.uid }, JWT_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES,
    });
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await pool.query(
      `INSERT INTO refresh_tokens (token, uid, expires_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [refreshToken, row.uid, expiresAt]
    );

    return ok(res, {
      user: {
        uid: row.uid,
        roll_no: row.roll_no,
        name: row.name,
        email: row.email,
        gender: row.gender,
        year: row.year,
        contact_number: row.contact_number,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("login error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// Refresh access token
app.post("/token/refresh", authLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return respondError(res, 400, "refreshToken required");
    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_SECRET);
    } catch {
      return respondError(res, 401, "invalid refresh token");
    }
    const r = await pool.query(
      `SELECT token, uid, expires_at FROM refresh_tokens WHERE token = $1 LIMIT 1`,
      [refreshToken]
    );
    if (r.rowCount === 0)
      return respondError(res, 401, "refresh token not found");
    if (r.rows[0].expires_at && new Date(r.rows[0].expires_at) < new Date())
      return respondError(res, 401, "refresh token expired");

    const accessToken = createAccessToken({ uid: r.rows[0].uid });
    return ok(res, { accessToken });
  } catch (err) {
    console.error("refresh token error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// Logout (revoke refresh token)
app.post("/logout", requireAuth, async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return respondError(res, 400, "refreshToken required");
    await pool.query(`DELETE FROM refresh_tokens WHERE token = $1`, [
      refreshToken,
    ]);
    return ok(res, { msg: "logged out" });
  } catch (err) {
    console.error("logout error:", err);
    return respondError(res, 500, "server error");
  }
});

// -------- TRIPS / GROUPS --------

// Create Trip
app.post("/create-trip", requireAuth, async (req, res) => {
  const creator_uid = req.user && req.user.uid;
  try {
    const raw = req.body || {};
    const start = sanitizeAndLimitText(raw.start, 120);
    const dest = sanitizeAndLimitText(raw.dest, 120);
    let stopsStr = null;
    if (Array.isArray(raw.stops))
      stopsStr = raw.stops
        .map((s) => sanitizeAndLimitText(s, 120))
        .filter(Boolean)
        .join("|");
    else if (typeof raw.stops === "string")
      stopsStr = sanitizeAndLimitText(raw.stops, 1000);

    const capacity = safeInt(raw.capacity, 4);
    const preference = raw.preference
      ? String(raw.preference).toUpperCase()
      : "ALL";
    const departure = raw.departure || null;
    const auto_join_creator =
      raw.auto_join_creator === false ? false : true;

    if (!creator_uid || !start || !dest)
      return respondError(res, 400, "authenticated user, start and dest required");
    if (!validatePreference(preference))
      return respondError(res, 400, "invalid preference");
    if (capacity <= 0 || capacity > 200)
      return respondError(res, 400, "capacity must be between 1 and 200");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertQ = `
        INSERT INTO groups (start, dest, stops, departure_date, capacity, preference, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
      const r = await client.query(insertQ, [
        start,
        dest,
        stopsStr,
        departure,
        capacity,
        preference,
        creator_uid,
      ]);
      const g = r.rows[0];

      if (auto_join_creator) {
        await client.query(
          `INSERT INTO group_members (gid, uid) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [g.gid, creator_uid]
        );
      }

      await client.query("COMMIT");
      const formatted = await formatGroupByRow(g, creator_uid);
      return ok(res, { gid: g.gid, group: formatted });
    } catch (tErr) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("create-trip tx error:", tErr);
      return respondError(res, 500, "could not create group");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("create-trip outer error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// Join Group
app.post("/join-group", requireAuth, async (req, res) => {
  const uid = req.user && req.user.uid;
  try {
    const { gid } = req.body || {};
    const gidInt = safeInt(gid, null);
    if (!uid || !gidInt)
      return respondError(res, 400, "authenticated uid and gid required");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const gq = await client.query(
        `SELECT gid, capacity FROM groups WHERE gid = $1 FOR UPDATE`,
        [gidInt]
      );
      if (gq.rowCount === 0) {
        await client.query("ROLLBACK");
        return respondError(res, 404, "group not found");
      }
      const capacity = gq.rows[0].capacity;

      const membersRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM group_members WHERE gid = $1`,
        [gidInt]
      );
      const current = parseInt(membersRes.rows[0].cnt || 0, 10);
      if (current >= capacity) {
        await client.query("ROLLBACK");
        return respondError(res, 400, "group is full");
      }

      await client.query(
        `INSERT INTO group_members (gid, uid) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [gidInt, uid]
      );

      await client.query("COMMIT");

      const r = await pool.query(`SELECT * FROM groups WHERE gid = $1`, [
        gidInt,
      ]);
      const formatted = await formatGroupByRow(r.rows[0], uid);
      return ok(res, { group: formatted });
    } catch (tErr) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("join-group tx error:", tErr);
      return respondError(res, 500, "internal server error");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("join-group outer error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// Group details (public)
app.get("/group/:gid", async (req, res) => {
  try {
    const gid = safeInt(req.params.gid, null);
    if (!gid) return respondError(res, 400, "invalid gid");
    const viewer_uid = req.query.viewer_uid
      ? safeInt(req.query.viewer_uid, null)
      : null;
    const r = await pool.query(`SELECT * FROM groups WHERE gid = $1 LIMIT 1`, [
      gid,
    ]);
    if (r.rowCount === 0) return respondError(res, 404, "group not found");
    const formatted = await formatGroupByRow(r.rows[0], viewer_uid);
    return ok(res, { group: formatted });
  } catch (err) {
    console.error("group/:gid error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// Search groups (±60 min time window when departure provided)
app.post("/search-groups", async (req, res) => {
  try {
    const { start, dest, preference, max_size, viewer_uid } = req.body || {};
    const TIME_WINDOW_MINS = 60;

    const rawDeparture =
      req.body && req.body.departure
        ? String(req.body.departure).trim()
        : null;
    let desiredDeparture = null;
    if (rawDeparture) {
      const parsed = new Date(rawDeparture);
      if (Number.isNaN(parsed.getTime()))
        return respondError(res, 400, "invalid departure datetime");
      desiredDeparture = parsed;
    }

    const params = [];
    const whereClauses = [];

    if (start) {
      params.push(`%${sanitizeAndLimitText(start, 120)}%`);
      whereClauses.push(
        `(g.start ILIKE $${params.length} OR g.stops ILIKE $${params.length} OR g.dest ILIKE $${params.length})`
      );
    }
    if (dest) {
      params.push(`%${sanitizeAndLimitText(dest, 120)}%`);
      whereClauses.push(
        `(g.dest ILIKE $${params.length} OR g.stops ILIKE $${params.length} OR g.start ILIKE $${params.length})`
      );
    }
    if (typeof preference !== "undefined" && String(preference).trim() !== "") {
      if (!validatePreference(preference))
        return respondError(res, 400, "invalid preference value");
      params.push(preference);
      whereClauses.push(`g.preference = $${params.length}`);
    }
    if (max_size) {
      const ms = parseInt(max_size, 10);
      if (!Number.isNaN(ms) && ms > 0) {
        params.push(ms);
        whereClauses.push(
          `((g.capacity - COALESCE(m.cnt,0)) >= $${params.length})`
        );
      }
    }

    let sql = `
      SELECT g.*, COALESCE(m.cnt,0) AS members_count,
             (g.capacity - COALESCE(m.cnt,0)) AS seats_left
      FROM groups g
      LEFT JOIN (SELECT gid, COUNT(*) AS cnt FROM group_members GROUP BY gid) m
      ON g.gid = m.gid
    `;
    if (whereClauses.length) sql += " WHERE " + whereClauses.join(" AND ");
    sql += " ORDER BY departure_date NULLS LAST, gid DESC LIMIT 200";

    const gRes = await pool.query(sql, params);
    const candidates = gRes.rows || [];

    if (!start && !dest && !desiredDeparture) {
      const formattedAll = await Promise.all(
        candidates.map((g) => formatGroupByRow(g, viewer_uid || null))
      );
      formattedAll.sort((a, b) => {
        if (a.departure_date && b.departure_date) {
          const ta = new Date(a.departure_date).getTime();
          const tb = new Date(b.departure_date).getTime();
          if (ta !== tb) return ta - tb;
        } else if (a.departure_date && !b.departure_date) return -1;
        else if (!a.departure_date && b.departure_date) return 1;
        return (b.seats_left || 0) - (a.seats_left || 0);
      });
      return ok(res, { matches: formattedAll });
    }

    const startTerm = start ? String(start).trim().toLowerCase() : null;
    const destTerm = dest ? String(dest).trim().toLowerCase() : null;

    const posSql = `
      WITH route AS (
        SELECT array_remove(
          ARRAY[lower(g.start)] ||
          coalesce(regexp_split_to_array(lower(g.stops),'\\s*\\|\\s*'), ARRAY[]::text[]) ||
          ARRAY[lower(g.dest)], ''
        ) AS route_arr
        FROM groups g WHERE g.gid = $1
      )
      SELECT
        (SELECT MIN(i) FROM generate_subscripts(route_arr,1) gi(i)
          WHERE route_arr[gi.i] ILIKE '%' || $2 || '%') AS pos_start,
        (SELECT MIN(i) FROM generate_subscripts(route_arr,1) gi(i)
          WHERE route_arr[gi.i] ILIKE '%' || $3 || '%') AS pos_dest
      FROM route;`;

    const filtered = [];
    const windowMs = TIME_WINDOW_MINS * 60 * 1000;
    for (const g of candidates) {
      const s = startTerm || "";
      const d = destTerm || "";
      const r = await pool.query(posSql, [g.gid, s, d]);
      if (r.rowCount === 0) continue;
      const row = r.rows[0];
      const posStart = row.pos_start;
      const posDest = row.pos_dest;

      let okRoute = false;
      if (startTerm && destTerm) okRoute = posStart !== null && posDest !== null && posStart < posDest;
      else if (startTerm) okRoute = posStart !== null;
      else if (destTerm) okRoute = posDest !== null;
      else okRoute = true;
      if (!okRoute) continue;

      if (desiredDeparture) {
        if (!g.departure_date) continue;
        const diffMs = Math.abs(new Date(g.departure_date) - desiredDeparture);
        if (diffMs > windowMs) continue;
      }
      filtered.push(g);
    }

    let formatted = await Promise.all(
      filtered.map((g) => formatGroupByRow(g, viewer_uid || null))
    );

    if (desiredDeparture) {
      formatted.sort((a, b) => {
        const ta = a.departure_date
          ? Math.abs(new Date(a.departure_date) - desiredDeparture)
          : Number.MAX_SAFE_INTEGER;
        const tb = b.departure_date
          ? Math.abs(new Date(b.departure_date) - desiredDeparture)
          : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return (b.seats_left || 0) - (a.seats_left || 0);
      });
    } else {
      formatted.sort((a, b) => {
        if (a.departure_date && b.departure_date) {
          const ta = new Date(a.departure_date).getTime();
          const tb = new Date(b.departure_date).getTime();
          if (ta !== tb) return ta - tb;
        } else if (a.departure_date && !b.departure_date) return -1;
        else if (!a.departure_date && b.departure_date) return 1;
        return (b.seats_left || 0) - (a.seats_left || 0);
      });
    }

    return ok(res, { matches: formatted });
  } catch (err) {
    console.error("search-groups error:", err);
    return respondError(res, 500, "internal server error");
  }
});

// My Rides (created + joined; grouped into upcoming/past)
app.get("/my-rides", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const now = new Date();

    const created = await pool.query(
      `SELECT * FROM groups WHERE created_by = $1
       ORDER BY departure_date NULLS LAST, gid DESC`,
      [uid]
    );
    const joined = await pool.query(
      `SELECT g.* FROM groups g
       JOIN group_members gm ON gm.gid = g.gid
       WHERE gm.uid = $1
       ORDER BY g.departure_date NULLS LAST, g.gid DESC`,
      [uid]
    );

    const split = (rows) =>
      rows.reduce(
        (acc, g) => {
          (g.departure_date && new Date(g.departure_date) >= now
            ? acc.upcoming
            : acc.past
          ).push(g);
          return acc;
        },
        { upcoming: [], past: [] }
      );

    const cr = split(created.rows);
    const jr = split(joined.rows);

    const [cu, cp, ju, jp] = await Promise.all([
      Promise.all(cr.upcoming.map((g) => formatGroupByRow(g, uid))),
      Promise.all(cr.past.map((g) => formatGroupByRow(g, uid))),
      Promise.all(jr.upcoming.map((g) => formatGroupByRow(g, uid))),
      Promise.all(jr.past.map((g) => formatGroupByRow(g, uid))),
    ]);

    return ok(res, {
      created: { upcoming: cu, past: cp },
      joined: { upcoming: ju, past: jp },
    });
  } catch (e) {
    console.error("/my-rides error:", e);
    return respondError(res, 500, "internal server error");
  }
});

// Connect two users (public utility)
app.post("/connect", async (req, res) => {
  try {
    const { u1, u2 } = req.body || {};
    if (!u1 || !u2 || Number(u1) === Number(u2))
      return respondError(res, 400, "invalid u1/u2");
    await pool.query(
      "INSERT INTO connections (u1,u2) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [Number(u1), Number(u2)]
    );
    return ok(res, { msg: "connection added" });
  } catch (err) {
    console.error("connect error:", err);
    return respondError(res, 500, "server error");
  }
});

// ---------- Graceful shutdown ----------
async function shutdown() {
  try {
    await pool.end();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---------- Start server ----------
app.listen(PORT, () =>
  console.log(`rideshare server listening on port ${PORT}`)
);
