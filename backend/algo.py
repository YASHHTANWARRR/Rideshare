# algo.py — recommender utilities
from algo_service import load_data
from datetime import datetime, timedelta, timezone
from dateutil import parser as dparser
import collections
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level="INFO")

def parse_dt(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v
    try:
        dt = dparser.parse(str(v))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def stops_to_route(start, stops, dest):
    if not stops:
        return [s for s in (start, dest) if s]
    middle = [s.strip() for s in str(stops).split('|') if s and s.strip()]
    route = []
    if start:
        route.append(start)
    route.extend(middle)
    if dest:
        route.append(dest)
    return route

def build_graph(connections):
    g = {}
    for e in connections:
        a = e.get("uid_a")
        b = e.get("uid_b")
        if a is None or b is None:
            continue
        g.setdefault(a, set()).add(b)
        g.setdefault(b, set()).add(a)
    return g

def bfs_degrees(graph, source, max_depth=10):
    if source is None:
        return {}
    q = collections.deque([(source, 0)])
    seen = {source: 0}
    while q:
        u, d = q.popleft()
        if d >= max_depth:
            continue
        for v in graph.get(u, []):
            if v not in seen:
                seen[v] = d + 1
                q.append((v, d + 1))
    return seen

def build_users_maps(users_list):
    by_uid = {}
    by_roll = {}
    for u in users_list:
        uid = u.get("uid")
        if uid is not None:
            by_uid[uid] = u
        roll = u.get("roll_no")
        if roll:
            by_roll[roll] = u
    return by_uid, by_roll

def normalize_groups(groups_raw):
    out = []
    for g in groups_raw:
        g2 = dict(g)
        g2["route"] = stops_to_route(g.get("start"), g.get("stops"), g.get("dest"))
        g2["departure_dt"] = parse_dt(g.get("departure_date"))
        out.append(g2)
    return out

def recommend_for_seeker_with_degrees(seeker_roll, desired_departure=None, top_n=10, max_degree=5, time_window_mins=60):
    data = load_data()
    users = data.get("users", [])
    groups = data.get("groups", [])
    group_members = data.get("group_members", {})
    connections = data.get("connections", [])

    users_by_uid, users_by_roll = build_users_maps(users)
    seeker = users_by_roll.get(seeker_roll)
    if not seeker:
        return []

    seeker_uid = seeker.get("uid")
    graph = build_graph(connections)
    degrees = bfs_degrees(graph, seeker_uid, max_depth=max_degree)
    groups_norm = normalize_groups(groups)
    now = datetime.now(timezone.utc)

    desired_dt = None
    if desired_departure:
        desired_dt = parse_dt(desired_departure)
        if desired_dt is None:
            desired_dt = None

    results = []
    for g in groups_norm:
        gid = g.get("gid")
        members = group_members.get(gid, [])
        seats_left = max(0, (g.get("capacity") or 0) - len(members))
        route = g.get("route")
        departure_dt = g.get("departure_dt")
        pref = g.get("preference")
        score = seats_left * 10
        if seeker.get("gender") and pref and seeker.get("gender") == pref:
            score += 20

        if desired_dt and departure_dt:
            delta_hours = abs((departure_dt - desired_dt).total_seconds()) / 3600.0
            score -= min(delta_hours, 48) * 2.0
        elif departure_dt:
            delta_hours = abs((departure_dt - now).total_seconds()) / 3600.0
            score -= min(delta_hours, 24) * 1.0

        mutuals = []
        for m in members:
            uid = m.get("uid")
            deg = None
            if uid in degrees:
                deg = degrees.get(uid)
                if deg == 0:
                    deg = None
            if deg is not None and uid != seeker_uid:
                mutuals.append({"uid": uid, "degree": deg})

        mutuals.sort(key=lambda x: x["degree"])
        results.append({
            "gid": gid,
            "score": score,
            "seats_left": seats_left,
            "departure_dt": departure_dt,
            "route": route,
            "mutuals": mutuals
        })

    if desired_dt:
        window_ms = time_window_mins * 60 * 1000
        filtered = []
        for r in results:
            dep = r.get("departure_dt")
            if not dep:
                continue
            if abs((dep - desired_dt).total_seconds() * 1000) <= window_ms:
                filtered.append(r)
        results = filtered

    for r in results:
        r["departure_dt_sort"] = r["departure_dt"] or (datetime.max.replace(tzinfo=timezone.utc) - timedelta(days=3650))

    if desired_dt:
        results.sort(key=lambda x: (-x["score"], -x["seats_left"], abs((x["departure_dt_sort"] - desired_dt).total_seconds())))
    else:
        results.sort(key=lambda x: (-x["score"], -x["seats_left"], x["departure_dt_sort"]))

    top = results[:top_n]
    for t in top:
        for m in t.get("mutuals", []):
            u = users_by_uid.get(m["uid"])
            if u:
                m["roll_no"] = u.get("roll_no")
                m["name"] = u.get("name")
    return top

if __name__ == "__main__":
    import json
    out = recommend_for_seeker_with_degrees("20CS1001", desired_departure="2025-11-10T09:30:00Z", top_n=5, time_window_mins=60)
    print(json.dumps(out, default=str, indent=2))
