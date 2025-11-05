
import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BACKEND_BASE } from "../App";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function safeFetch(url, opts = {}) {
  try {
    const resp = await fetch(url, opts);
    let data = null;
    try {
      data = await resp.json();
    } catch (e) {
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

  React.useEffect(() => {
    async function loadUser() {
      if (!user) {
        try {
          const raw = await AsyncStorage.getItem("user");
          if (raw) setUser(JSON.parse(raw));
        } catch (e) {}
      }
    }
    loadUser();
  }, []);

  function handleBack() {
    navigation.goBack();
  }

  async function joinGroupHandler() {
    setJoining(true);
    try {
      const token = await AsyncStorage.getItem("accessToken");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const { resp, data } = await safeFetch(`${BACKEND_BASE.replace(/\/+$/, "")}/join-group`, {
        method: "POST",
        headers,
        body: JSON.stringify({ gid: Number(group.gid) }),
      });

      setJoining(false);
      if (!resp || !resp.ok || !data?.ok) {
        if (data && data.error && data.error.toLowerCase().includes("token")) {
          Alert.alert("Session expired", "Please login again.");
          await AsyncStorage.removeItem("user");
          await AsyncStorage.removeItem("accessToken");
          await AsyncStorage.removeItem("refreshToken");
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          return;
        }
        return Alert.alert("Join failed", data?.error || "Server error");
      }

      Alert.alert("Joined", "You have successfully joined this group.");
      if (data.group) setGroup(data.group);
    } catch (err) {
      setJoining(false);
      console.error("join-group error:", err);
      Alert.alert("Network error", "Could not reach server");
    }
  }

  const routeArr = group.route || [];

  return (
    <LinearGradient colors={["#fce4ec", "#e3f2fd"]} style={{ flex: 1, padding: 16 }}>
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
            group.members.map((m) => (
              <Text key={m.uid} style={styles.item}>
                • {m.name} — Year {m.year ?? "-"}
              </Text>
            ))
          ) : (
            <Text style={styles.item}>No members yet</Text>
          )}

          <Text style={[styles.subTitle, { marginTop: 12 }]}>Mutual Connections</Text>
          {group.mutual_friends?.length ? (
            group.mutual_friends.map((mf) => (
              <Text key={mf.uid} style={styles.item}>
                • {mf.name} (degree {mf.degree})
              </Text>
            ))
          ) : (
            <Text style={styles.item}>No mutual connections</Text>
          )}

          <TouchableOpacity
            style={[styles.joinBtn, joining && { opacity: 0.7 }]}
            onPress={joinGroupHandler}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add" color="#fff" size={18} />
                <Text style={styles.joinText}>Join Group</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 8, color: "#333" },
  subTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginBottom: 8 },
  route: { fontSize: 16, fontWeight: "600", marginBottom: 10, color: "#222" },
  item: { fontSize: 14, color: "#444", marginBottom: 6 },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
  },
  joinText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
});
