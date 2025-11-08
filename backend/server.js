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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// -------------------- Database --------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// -------------------- Utilities --------------------
function ok(res, data) {
  return res.status(200).json({ ok: true, ...data });
}
function respondError(res, code, message) {
  return res.status(code).json({ ok: false, error: message });
}
function safeInt(v, defVal) {
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

// -------------------- Auth --------------------
// Expect Authorization: Bearer <token> with payload { uid, ... }
function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const [, token] = h.split(" ");
    if (!token) return respondError(res, 401, "auth required");

    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (!payload?.uid) return respondError(res, 401, "invalid token");
    req.user = { uid: payload.uid };
    next();
  } catch (e) {
    return respondError(res, 401, "unauthorized");
  }
}

// Optional helper (non-strict) to read uid if available
function readUser(req) {
  try {
    const h = req.headers.authorization || "";
    const [, token] = h.split(" ");
    if (!token) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    return payload?.uid ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

// -------------------- City CSV Loader --------------------
let CITY_SET = new Set();
(function loadCityList() {
  try {
    const csvPath = path.join(__dirname, "cities", "cities_only.csv");
    const raw = fs.readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines[0]?.toLowerCase() === "city_name") lines.shift();
    lines.forEach((c) => CITY_SET.add(c.toLowerCase()));
    console.log("Loaded", CITY_SET.size, "cities");
  } catch (e) {
    console.warn(
      "City CSV not found/failed to load. City validation disabled.",
      e.message
    );
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
app.get("/", (req, res) => ok(res, { message: "RideShare backend OK" }));

// Create Trip
app.post("/create-trip", requireAuth, async (req, res) => {
  const creator_uid = req.user && req.user.uid;
  const raw = req.body || {};

  const startNorm = normalizeCityName(raw.start);
  const destNorm  = normalizeCityName(raw.dest);
  if (!creator_uid || !startNorm || !destNorm)
    return respondError(res, 400, "authenticated user, start and dest required");
  if (!isValidCity(startNorm))
    return respondError(res, 400, "Invalid start city");
  if (!isValidCity(destNorm))
    return respondError(res, 400, "Invalid destination city");

  // stops: sanitize + validate + de-dup + exclude start/dest
  let stopsStr = null;
  const sLower = startNorm.toLowerCase(), dLower = destNorm.toLowerCase();
  const seen = new Set();
  const rawStops = Array.isArray(raw.stops)
    ? raw.stops
    : (typeof raw.stops === "string" ? raw.stops.split(",") : []);

  const cleanedStops = rawStops
    .map(normalizeCityName)
    .filter((x) => x && isValidCity(x))
    .filter((x) => {
      const v = x.toLowerCase();
      if (v === sLower || v === dLower) return false;
      if (seen.has(v)) return false;
      seen.add(v); return true;
    });

  if (cleanedStops.length) stopsStr = cleanedStops.join("|");

  const capacity = safeInt(raw.capacity, 4);
  const preference = raw.preference ? String(raw.preference).toUpperCase() : "ALL";
  const departure = raw.departure || null;
  const auto_join_creator = raw.auto_join_creator === false ? false : true;

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
      startNorm, destNorm, stopsStr, departure, capacity, preference, creator_uid
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
    console.error("create-trip error:", tErr);
    return respondError(res, 500, "could not create group");
  } finally {
    client.release();
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
      departure,       // ISO string
      scope: scopeRaw, // "day" | ""
      time_window_mins,
    } = req.body || {};

    const startTerm = startTermRaw ? normalizeCityName(startTermRaw) : null;
    const destTerm  = destTermRaw  ? normalizeCityName(destTermRaw)  : null;

    let desiredDeparture = null;
    if (departure) {
      const d = new Date(departure);
      if (!isNaN(d.getTime())) desiredDeparture = d;
    }

    const scope = String(scopeRaw || "").toLowerCase(); // "day" | ""
    const clientWin = parseInt(time_window_mins, 10);
    const WINDOW_MINS = Number.isFinite(clientWin) && clientWin > 0 ? clientWin : 60;

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
      const ug = await pool.query(`SELECT gender FROM users WHERE uid=$1`, [viewer_uid]);
      viewerGender = (ug.rows[0]?.gender || "").toUpperCase();
    }
    if (viewerGender === "M") {
      candidates = candidates.filter(g => String(g.preference).toUpperCase() !== "FEMALE_ONLY");
    }

    // route/time filter
    const filtered = [];
    const windowMs = WINDOW_MINS * 60 * 1000;

    for (const g of candidates) {
      // route order: ensure start before dest when both provided
      if (startTerm || destTerm) {
        const pos = await pool.query(posSql, [g.gid, startTerm || "", destTerm || ""]);
        const r = pos.rows?.[0] || {};
        const posStart = r.pos_start;
        const posDest  = r.pos_dest;

        let okMatch = false;
        if (startTerm && destTerm) okMatch = (posStart !== null && posDest !== null && posStart < posDest);
        else if (startTerm)        okMatch = (posStart !== null);
        else if (destTerm)         okMatch = (posDest  !== null);
        if (!okMatch) continue;
      }

      // time logic
      if (desiredDeparture) {
        if (!g.departure_date) continue;
        const depMs = new Date(g.departure_date).getTime();

        if (scope === "day") {
          const d0 = new Date(desiredDeparture);
          const dayStart = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
          const dayEnd   = dayStart + 24*60*60*1000 - 1;
          if (depMs < dayStart || depMs > dayEnd) continue;
        } else {
          const want = desiredDeparture.getTime();
          if (depMs < want - windowMs || depMs > want + windowMs) continue;
        }
      }

      filtered.push(g);
    }

    const formatted = await Promise.all(filtered.map(g => formatGroupByRow(g, viewer_uid)));
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
      const ug = await client.query(`SELECT gender FROM users WHERE uid=$1`, [uid]);
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
      joined:  { upcoming: ju, past: jp },
    });
  } catch (e) {
    console.error("/my-rides error:", e);
    return respondError(res, 500, "internal server error");
  }
});

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("RideShare server running on port", PORT);
});
