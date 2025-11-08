// server.js — RideShare (ESM, "type": "module")

// -------------------- Imports & Setup --------------------
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -------------------- Config --------------------
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";
const ACCESS_TOKEN_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES || "15m";
const REFRESH_TOKEN_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES || "30d";

// -------------------- Database --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// Ensure refresh_tokens exists (idempotent)
async function ensureRefreshTable() {
  const q = `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token TEXT PRIMARY KEY,
      uid INT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ
    );
  `;
  await pool.query(q);
}
ensureRefreshTable().catch((e) =>
  console.warn("refresh_tokens ensure error:", e?.message)
);

// -------------------- Utilities --------------------
function ok(res, data = {}) {
  return res.status(200).json({ ok: true, ...data });
}
function respondError(res, code = 500, message = "internal server error") {
  return res.status(code).json({ ok: false, error: message });
}
function safeInt(v, defVal = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defVal;
}
function validatePreference(pref) {
  const p = String(pref || "").toUpperCase();
  return ["ALL", "FEMALE_ONLY"].includes(p);
}
function normalizeCityName(s) {
  if (!s) return null;
  return String(s).replace(/[^a-zA-Z.\-\s]/g, "").replace(/\s+/g, " ").trim();
}
function createAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
}

// -------------------- Auth helpers --------------------
// Expect Authorization: Bearer <token> with payload { uid, ... }
function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const [, token] = h.split(" ");
    if (!token) return respondError(res, 401, "auth required");
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.uid) return respondError(res, 401, "invalid token");
    req.user = { uid: payload.uid };
    next();
  } catch {
    return respondError(res, 401, "unauthorized");
  }
}
// Optional helper (non-strict) to read uid if available
function readUser(req) {
  try {
    const h = req.headers.authorization || "";
    const [, token] = h.split(" ");
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET);
    return payload?.uid ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

// Basic rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { ok: false, error: "Too many requests, please try again later." },
});

// -------------------- City CSV Loader --------------------
let CITY_SET = new Set();
(function loadCityList() {
  try {
    const csvPath = path.join(__dirname, "cities", "cities_only.csv");
    const raw = fs.readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines[0] && /city/i.test(lines[0])) lines.shift(); // drop header if present
    lines.forEach((c) => CITY_SET.add(c.toLowerCase()));
    console.log("✅ Loaded cities:", CITY_SET.size);
  } catch (e) {
    console.warn("⚠️ City CSV not found. City validation disabled.", e.message);
  }
})();
function isValidCity(c) {
  if (!c) return false;
  if (CITY_SET.size === 0) return true; // fallback if CSV missing
  return CITY_SET.has(c.toLowerCase());
}

// -------------------- Group Formatting --------------------
async function formatGroupByRow(row, viewer_uid = null) {
  const gid = row.gid;
  const m = await pool.query(
    `SELECT gm.uid, u.name, u.gender
     FROM group_members gm
     LEFT JOIN users u ON u.uid = gm.uid
     WHERE gm.gid = $1
     ORDER BY gm.uid`,
    [gid]
  );
  const members = m.rows || [];
  const cnt = members.length;
  const seats_left = Math.max(0, (row.capacity || 0) - cnt);

  return {
    gid: row.gid,
    start: row.start,
    dest: row.dest,
    stops: row.stops ? row.stops.split("|") : [],
    departure_date: row.departure_date,
    capacity: row.capacity,
    preference: row.preference,
    created_by: row.created_by,
    members,
    seats_left,
    is_member:
      viewer_uid != null &&
      members.some((mm) => Number(mm.uid) === Number(viewer_uid)),
  };
}

// Helper SQL to compute positions of start/dest in route
const posSql = `
SELECT 
  array_position( 
    ARRAY[g.start] 
    || (CASE WHEN g.stops IS NULL OR g.stops='' THEN ARRAY[]::text[] ELSE regexp_split_to_array(g.stops, '\\|') END)
    || ARRAY[g.dest], $2
  ) AS pos_start,
  array_position( 
    ARRAY[g.start] 
    || (CASE WHEN g.stops IS NULL OR g.stops='' THEN ARRAY[]::text[] ELSE regexp_split_to_array(g.stops, '\\|') END)
    || ARRAY[g.dest], $3
  ) AS pos_dest
FROM groups g
WHERE g.gid = $1
`;

// -------------------- Routes --------------------

// Health
app.get("/", (_req, res) => ok(res, { message: "RideShare backend OK" }));

// --------- Cities (optional public endpoints) ---------
app.get("/cities", (_req, res) => {
  const list = Array.from(CITY_SET)
    .sort()
    .map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
  return ok(res, { cities: list });
});
app.get("/cities/search", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return ok(res, { results: [] });
  const results = Array.from(CITY_SET)
    .filter((c) => c.includes(q))
    .slice(0, 20)
    .map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()));
  return ok(res, { results });
});

// --------- AUTH ---------
app.post("/register", authLimiter, async (req, res) => {
  try {
    const raw = req.body || {};
    const name = String(raw.name || "").trim();
    const rollNo = String(raw.rollNo || "").trim();
    const email = String(raw.email || "").trim().toLowerCase();
    const password = String(raw.password || "");
    const gender = raw.gender ? String(raw.gender).toUpperCase() : null;
    const year = safeInt(raw.year, null);
    const contact_number = raw.contact_number
      ? String(raw.contact_number).trim()
      : null;

    if (!name || !rollNo || !email || !password)
      return respondError(res, 400, "name, rollNo, email and password required");
    if (!/@thapar\.edu$/i.test(email))
      return respondError(res, 400, "please use your thapar.edu email");
    if (gender && !["M", "F"].includes(gender))
      return respondError(res, 400, "gender must be 'M' or 'F'");
    if (year !== null && (year < 1 || year > 6))
      return respondError(res, 400, "year must be between 1 and 6");
    if (password.length < 8)
      return respondError(res, 400, "password must be at least 8 characters");

    const hashed = await bcrypt.hash(password, 10);
    const q = `
      INSERT INTO users (roll_no, name, email, password, gender, year, contact_number)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING uid, roll_no, name, email, gender, year, contact_number
    `;
    const vals = [rollNo, name, email, hashed, gender, year, contact_number];
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
    const match = await bcrypt.compare(String(password), row.password);
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

// --------- TRIPS / GROUPS ---------

// Create Trip (strict city sanitize/validate)
app.post("/create-trip", requireAuth, async (req, res) => {
  const creator_uid = req.user && req.user.uid;
  try {
    const raw = req.body || {};

    const startNorm = normalizeCityName(raw.start);
    const destNorm = normalizeCityName(raw.dest);
    if (!creator_uid || !startNorm || !destNorm)
      return respondError(
        res,
        400,
        "authenticated user, start and dest required"
      );
    if (!isValidCity(startNorm))
      return respondError(res, 400, "Invalid start city");
    if (!isValidCity(destNorm))
      return respondError(res, 400, "Invalid destination city");

    // stops sanitize + validate + de-dup + exclude start/dest
    let stopsStr = null;
    const sLower = startNorm.toLowerCase(),
      dLower = destNorm.toLowerCase();
    const seen = new Set();
    const rawStops = Array.isArray(raw.stops)
      ? raw.stops
      : typeof raw.stops === "string"
      ? raw.stops.split(",")
      : [];
    const cleanedStops = rawStops
      .map(normalizeCityName)
      .filter((x) => x && isValidCity(x))
      .filter((x) => {
        const v = x.toLowerCase();
        if (v === sLower || v === dLower) return false;
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
    if (cleanedStops.length) stopsStr = cleanedStops.join("|");

    const capacity = safeInt(raw.capacity, 4);
    const preference = raw.preference
      ? String(raw.preference).toUpperCase()
      : "ALL";
    const departure = raw.departure || null;
    const auto_join_creator =
      raw.auto_join_creator === false ? false : true;

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
        startNorm,
        destNorm,
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

// Search Groups (FemaleOnly privacy + day / ±window)
app.post("/search-groups", async (req, res) => {
  try {
    const viewer = readUser(req);
    const viewer_uid = viewer?.uid || null;

    const {
      start: startTermRaw,
      dest: destTermRaw,
      preference,
      max_size,
      departure, // ISO string
      scope: scopeRaw, // "day" | ""
      time_window_mins,
    } = req.body || {};

    const startTerm = startTermRaw ? normalizeCityName(startTermRaw) : null;
    const destTerm = destTermRaw ? normalizeCityName(destTermRaw) : null;

    let desiredDeparture = null;
    if (departure) {
      const d = new Date(departure);
      if (!isNaN(d.getTime())) desiredDeparture = d;
    }

    const scope = String(scopeRaw || "").toLowerCase(); // "day" | ""
    const clientWin = parseInt(time_window_mins, 10);
    const WINDOW_MINS =
      Number.isFinite(clientWin) && clientWin > 0 ? clientWin : 60;

    // pull broad candidates first
    const pref = preference ? String(preference).toUpperCase() : null;
    let baseSql = `SELECT * FROM groups`;
    const where = [];
    const params = [];

    if (pref && validatePreference(pref)) {
      where.push(`preference = $${params.length + 1}`);
      params.push(pref);
    }
    if (safeInt(max_size, null)) {
      where.push(`capacity >= $${params.length + 1}`);
      params.push(safeInt(max_size, 1));
    }
    if (where.length) baseSql += ` WHERE ` + where.join(" AND ");
    baseSql += ` ORDER BY departure_date NULLS LAST, gid DESC LIMIT 500`;

    const gRes = await pool.query(baseSql, params);
    let candidates = gRes.rows || [];

    // FemaleOnly: hide for male viewers
    let viewerGender = null;
    if (viewer_uid) {
      const ug = await pool.query(`SELECT gender FROM users WHERE uid=$1`, [
        viewer_uid,
      ]);
      viewerGender = (ug.rows[0]?.gender || "").toUpperCase();
    }
    if (viewerGender === "M") {
      candidates = candidates.filter(
        (g) => String(g.preference).toUpperCase() !== "FEMALE_ONLY"
      );
    }

    // route/time filter
    const filtered = [];
    const windowMs = WINDOW_MINS * 60 * 1000;

    for (const g of candidates) {
      // route order: ensure start before dest when both provided
      if (startTerm || destTerm) {
        const pos = await pool.query(posSql, [
          g.gid,
          startTerm || "",
          destTerm || "",
        ]);
        const r = pos.rows?.[0] || {};
        const posStart = r.pos_start;
        const posDest = r.pos_dest;

        let okMatch = false;
        if (startTerm && destTerm)
          okMatch = posStart !== null && posDest !== null && posStart < posDest;
        else if (startTerm) okMatch = posStart !== null;
        else if (destTerm) okMatch = posDest !== null;
        if (!okMatch) continue;
      }

      // time logic
      if (desiredDeparture) {
        if (!g.departure_date) continue;
        const depMs = new Date(g.departure_date).getTime();

        if (scope === "day") {
          const d0 = new Date(desiredDeparture);
          const dayStart = new Date(
            d0.getFullYear(),
            d0.getMonth(),
            d0.getDate()
          ).getTime();
          const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
          if (depMs < dayStart || depMs > dayEnd) continue;
        } else {
          const want = desiredDeparture.getTime();
          if (depMs < want - windowMs || depMs > want + windowMs) continue;
        }
      }

      filtered.push(g);
    }

    const formatted = await Promise.all(
      filtered.map((g) => formatGroupByRow(g, viewer_uid))
    );
    return ok(res, { groups: formatted });
  } catch (e) {
    console.error("/search-groups error:", e);
    return respondError(res, 500, "internal server error");
  }
});

// Join Group (block creator; FemaleOnly blocks M; capacity check)
app.post("/join-group", requireAuth, async (req, res) => {
  const uid = req.user.uid;
  const gidInt = safeInt(req.body?.gid, null);
  if (!gidInt) return respondError(res, 400, "invalid gid");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const gq = await client.query(
      `SELECT gid, capacity, preference, created_by 
       FROM groups 
       WHERE gid = $1 FOR UPDATE`,
      [gidInt]
    );
    if (gq.rowCount === 0) {
      await client.query("ROLLBACK");
      return respondError(res, 404, "group not found");
    }

    // creator cannot join own group
    if (Number(gq.rows[0].created_by) === Number(uid)) {
      await client.query("ROLLBACK");
      return respondError(res, 400, "creator cannot join own group");
    }

    // FemaleOnly: block Male from joining
    const pref = String(gq.rows[0].preference || "ALL").toUpperCase();
    if (pref === "FEMALE_ONLY") {
      const ug = await client.query(`SELECT gender FROM users WHERE uid=$1`, [
        uid,
      ]);
      if ((ug.rows[0]?.gender || "").toUpperCase() === "M") {
        await client.query("ROLLBACK");
        return respondError(res, 403, "female-only group");
      }
    }

    // capacity check
    const membersRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM group_members WHERE gid = $1`,
      [gidInt]
    );
    const current = parseInt(membersRes.rows[0].cnt || 0, 10);
    const capacity = gq.rows[0].capacity;
    if (current >= capacity) {
      await client.query("ROLLBACK");
      return respondError(res, 400, "group is full");
    }

    await client.query(
      `INSERT INTO group_members (gid, uid) 
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [gidInt, uid]
    );

    await client.query("COMMIT");
    return ok(res, { joined: true, gid: gidInt });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("/join-group error:", e);
    return respondError(res, 500, "internal server error");
  } finally {
    client.release();
  }
});

// My Rides (Created + Joined; Upcoming/Past)
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

// -------------------- Start Server --------------------
app.listen(PORT, () => {
  console.log("RideShare server running on port", PORT);
});
