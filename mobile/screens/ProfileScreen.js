import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useIsFocused } from "@react-navigation/native";
import { BACKEND_BASE } from "../App";
import MapBackdrop from "../components/MapBackdrop";

export default function ProfileScreen({ route, navigation }) {
  const initialUser = route?.params?.user || null;
  const [user, setUser] = useState(initialUser);

  const [tabMain, setTabMain] = useState("created"); // created | joined
  const [tabSub, setTabSub] = useState("upcoming");  // upcoming | past
  const [rides, setRides] = useState({ created: { upcoming: [], past: [] }, joined: { upcoming: [], past: [] } });

  const isFocused = useIsFocused();

  useEffect(() => { (async () => {
    if (!initialUser) {
      try { const raw = await AsyncStorage.getItem("user"); if (raw) setUser(JSON.parse(raw)); } catch {}
    }
  })(); }, []);

  useEffect(() => { (async () => {
    if (!isFocused) return;
    try {
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) return;
      const resp = await fetch(`${BACKEND_BASE.replace(/\/+$/, "")}/my-rides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (resp.ok && data?.ok) setRides(data); else console.log("my-rides error", data?.error);
    } catch (e) { console.log("my-rides fetch failed", e?.message || e); }
  })(); }, [isFocused]);

  async function handleLogout() {
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      const refreshToken = await AsyncStorage.getItem("refreshToken");
      try {
        await fetch(`${BACKEND_BASE.replace(/\/+$/, "")}/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: accessToken ? `Bearer ${accessToken}` : undefined },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
      await AsyncStorage.multiRemove(["user", "accessToken", "refreshToken"]);
    } finally {
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Login" }] }));
      if (typeof window !== "undefined" && window.history && window.location) {
        try { window.history.replaceState(null, "", "/"); } catch {}
      }
    }
  }

  function confirmLogout() {
    if (Platform.OS === "web" && window?.confirm) return window.confirm("Logout?") && handleLogout();
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: handleLogout },
    ]);
  }

  const list = rides?.[tabMain]?.[tabSub] || [];

  return (
    <View style={{ flex: 1 }}>
      <MapBackdrop blur />
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity onPress={confirmLogout} style={{ padding: 6 }}>
            <Ionicons name="log-out-outline" size={22} color="#E53935" />
          </TouchableOpacity>
        </View>

        {/* User info */}
        <Text style={styles.item}>Name: {user?.name ?? "-"}</Text>
        <Text style={styles.item}>Email: {user?.email ?? "-"}</Text>
        <Text style={styles.item}>UID: {user?.uid ?? "-"}</Text>
        <Text style={styles.item}>Gender: {user?.gender ?? "-"}</Text>
        {user?.roll_no || user?.rollNo ? <Text style={styles.item}>Roll No: {user.roll_no || user.rollNo}</Text> : null}
        {typeof user?.year !== "undefined" ? <Text style={styles.item}>Year: {String(user.year)}</Text> : null}

        {/* Tabs */}
        <View style={styles.tabMainRow}>
          {["created","joined"].map(k => (
            <TouchableOpacity key={k} style={[styles.tabMainBtn, tabMain===k && styles.tabActive]} onPress={()=>setTabMain(k)}>
              <Text style={tabMain===k?styles.tabTextActive:styles.tabText}>{k.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tabSubRow}>
          {["upcoming","past"].map(k => (
            <TouchableOpacity key={k} style={[styles.tabSubBtn, tabSub===k && styles.tabActiveSub]} onPress={()=>setTabSub(k)}>
              <Text style={tabSub===k?styles.tabTextActive:styles.tabText}>{k.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Lists */}
        <ScrollView style={{ marginTop: 8, maxHeight: 320 }}>
          {list.length === 0 ? (
            <Text style={{ color:"#666" }}>No rides here.</Text>
          ) : (
            list.map(g => (
              <View key={g.gid} style={styles.rideCard}>
                <Text style={{ fontWeight:"700", color:"#222" }}>{(g.route || []).join(" → ")}</Text>
                <Text style={{ color:"#555", marginTop:4 }}>
                  {g.preference} • {g.seats_left} seats left • {g.capacity} capacity
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: "absolute", top: 60, left: 16, right: 16, backgroundColor: "rgba(255,255,255,0.95)", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#E53935" },
  item: { fontSize: 14, color: "#444", marginTop: 8 },

  tabMainRow: { flexDirection: "row", marginTop: 14 },
  tabSubRow: { flexDirection: "row", marginTop: 8 },

  tabMainBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.06)", marginRight: 10 },
  tabSubBtn:  { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)", marginRight: 10 },

  tabActive: { backgroundColor: "#E53935" },
  tabActiveSub: { backgroundColor: "#1976D2" },
  tabText: { color: "#333", fontWeight: "700" },
  tabTextActive: { color: "#fff", fontWeight: "700" },

  rideCard: { backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 12, padding: 12, marginTop: 8, borderWidth:1, borderColor:"#eee" },
});
