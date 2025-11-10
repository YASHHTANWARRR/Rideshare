import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BACKEND_BASE } from "../App";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function safeFetch(url, opts = {}) {
  try {
    const resp = await fetch(url, opts);
    let data;
    try {
      data = await resp.json();
    } catch {
      data = { ok: resp.ok, error: "Invalid JSON from server" };
    }
    return { resp, data };
  } catch (e) {
    return { resp: null, data: { ok: false, error: e.message || "Network error" } };
  }
}

export default function GroupDetailScreen({ route, navigation }) {
  const initialGroup = route.params?.group || {};
  const routeUser = route.params?.user || null;

  const [group, setGroup] = useState(initialGroup);
  const [joining, setJoining] = useState(false);
  const [user, setUser] = useState(routeUser);

  // NEW: cache my connections to hide Connect CTA
  const [connectedUids, setConnectedUids] = useState(new Set());
  const [loadingConn, setLoadingConn] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) {
        try {
          const raw = await AsyncStorage.getItem("user");
          if (raw) setUser(JSON.parse(raw));
        } catch {}
      }
    })();
  }, []);

  // NEW: fetch my connections once we know user
  useEffect(() => {
    (async () => {
      if (!user?.uid) return;
      try {
        setLoadingConn(true);
        const token = await AsyncStorage.getItem("accessToken");
        if (!token) return;
        const { resp, data } = await safeFetch(
          `${BACKEND_BASE.replace(/\/+$/, "")}/connections/me`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (resp?.ok && data?.ok && Array.isArray(data.connections)) {
          setConnectedUids(new Set(data.connections.map((u) => Number(u.uid))));
        }
      } finally {
        setLoadingConn(false);
      }
    })();
  }, [user?.uid]);

  const isOwner =
    user?.uid && group?.created_by && Number(user.uid) === Number(group.created_by);
  const isMember = !!group?.members?.some((m) => Number(m.uid) === Number(user?.uid));
  const canJoin = !(isOwner || isMember);

  // ----- DELETE -----
  async function handleDeleteHere() {
    try {
      if (!group?.gid) return;
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) return Alert.alert("Login required");

      if (Platform.OS === "web") {
        if (!window.confirm("Delete this trip?")) return;
      } else {
        let proceed = false;
        await new Promise((res) => {
          Alert.alert("Delete Trip", "Are you sure you want to delete this trip?", [
            { text: "Cancel", style: "cancel", onPress: () => { proceed = false; res(); } },
            { text: "Delete", style: "destructive", onPress: () => { proceed = true; res(); } },
          ]);
        });
        if (!proceed) return;
      }

      const resp = await fetch(`${BACKEND_BASE.replace(/\/+$/, "")}/groups/${group.gid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        return Alert.alert("Delete failed", data?.error || `HTTP ${resp.status}`);
      }
      Alert.alert("Deleted", "Trip removed.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Network error", e?.message || "Could not reach server");
    }
  }

  function handleBack() {
    navigation.goBack();
  }

  // ----- JOIN -----
  async function joinGroupHandler() {
    setJoining(true);
    try {
      const token = await AsyncStorage.getItem("accessToken");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const { resp, data } = await safeFetch(
        `${BACKEND_BASE.replace(/\/+$/, "")}/join-group`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ gid: Number(group.gid) }),
        }
      );

      setJoining(false);

      if (!resp || !resp.ok || !data?.ok) {
        if (data?.error && String(data.error).toLowerCase().includes("token")) {
          Alert.alert("Session expired", "Please login again.");
          await AsyncStorage.multiRemove(["user", "accessToken", "refreshToken"]);
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          return;
        }
        return Alert.alert("Join failed", data?.error || "Server error");
      }

      Alert.alert("Joined", "You have successfully joined this group.");
      // optimistic UI update
      setGroup((g) => ({
        ...g,
        seats_left: Math.max(0, (g?.seats_left ?? 1) - 1),
        members: [
          ...(g.members || []),
          { uid: user.uid, name: user.name, gender: user.gender, year: user.year },
        ],
      }));
    } catch (err) {
      setJoining(false);
      Alert.alert("Network error", "Could not reach server");
    }
  }

  // ----- CONNECT (new) -----
  async function connectTo(other_uid) {
    try {
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) return Alert.alert("Login required");
      const { resp, data } = await safeFetch(`${BACKEND_BASE.replace(/\/+$/, "")}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ other_uid }),
      });
      if (!resp || !resp.ok || !data?.ok) {
        return Alert.alert("Failed", data?.error || `HTTP ${resp?.status || "?"}`);
      }
      // mark as connected locally to hide CTA
      setConnectedUids((prev) => new Set(prev).add(Number(other_uid)));
      Alert.alert("Connected!", data.message || "Connection created");
    } catch (e) {
      Alert.alert("Network error", e?.message || "Try later");
    }
  }

  const routeArr = group.route || [];

  return (
    <LinearGradient colors={["#fce4ec", "#e3f2fd"]} style={{ flex: 1, padding: 16 }}>
      {/* HEADER */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <TouchableOpacity onPress={handleBack} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "700", color: "#E53935" }}>Ride Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={{ marginTop: 12 }}>
        <View style={styles.card}>
          <Text style={styles.title}>Route</Text>
          <Text style={styles.route}>{routeArr.join(" → ")}</Text>

          <Text style={styles.item}>Preference: {group.preference || "ALL"}</Text>
          <Text style={styles.item}>Seats left: {group.seats_left ?? "-"}</Text>
          <Text style={styles.item}>Capacity: {group.capacity ?? "-"}</Text>

          <Text style={[styles.subTitle, { marginTop: 12 }]}>Members</Text>
          {group.members?.length ? (
            group.members.map((m) => {
              const isSelf = Number(m.uid) === Number(user?.uid);
              const alreadyConnected = connectedUids.has(Number(m.uid));
              return (
                <View
                  key={m.uid}
                  style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}
                >
                  <Text style={styles.item}>
                    • {m.name}
                    {typeof m.year !== "undefined" ? ` — Yr ${m.year}` : ""}
                  </Text>

                  {/* Hide CTA for self; show status if already connected */}
                  {!isSelf && (
                    alreadyConnected ? (
                      <View style={styles.connBadge}>
                        <Ionicons name="checkmark-done" size={14} color="#fff" />
                        <Text style={styles.connBadgeText}>Connected</Text>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => connectTo(m.uid)} style={styles.connectBtn} disabled={loadingConn}>
                        <Ionicons name="person-add" size={16} color="#fff" />
                        <Text style={styles.connectText}>Connect</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })
          ) : (
            <Text style={styles.item}>No members yet</Text>
          )}

          {/* JOIN */}
          {canJoin && (
            <TouchableOpacity
              style={[styles.joinBtn, joining && { opacity: 0.7 }]}
              onPress={joinGroupHandler}
              disabled={joining}
            >
              {joining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" color="#fff" size={18} />
                  <Text style={styles.joinText}>Join Group</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* DELETE (owner only) */}
          {isOwner && (
            <TouchableOpacity
              onPress={handleDeleteHere}
              style={[styles.joinBtn, { backgroundColor: "#8e0000", marginTop: 10 }]}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.joinText}>Delete Trip</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(255,255,255,0.9)", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6 },
  title: { fontSize: 16, fontWeight: "700", color: "#222" },
  subTitle: { fontSize: 14, fontWeight: "700", color: "#444" },
  route: { marginTop: 4, color: "#333" },
  item: { marginTop: 6, color: "#444" },
  joinBtn: { marginTop: 14, backgroundColor: "#E53935", paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  joinText: { color: "#fff", fontWeight: "700", marginLeft: 6 },
  // Connect CTA
  connectBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#1a73e8", flexDirection: "row", alignItems: "center", gap: 6 },
  connectText: { color: "#fff", fontWeight: "700" },
  // Connected badge
  connBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#43a047", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 9999 },
  connBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
