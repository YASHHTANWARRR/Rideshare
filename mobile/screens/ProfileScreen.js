import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform,
  ScrollView, ActivityIndicator, RefreshControl
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useIsFocused } from "@react-navigation/native";
import { BACKEND_BASE } from "../App";
import MapBackdrop from "../components/MapBackdrop";

export default function ProfileScreen({ route, navigation }) {
  const initialUser = route?.params?.user || null;
  const [user, setUser] = useState(initialUser);

  const [tabMain, setTabMain] = useState("created");   // created | joined | connections
  const [tabSub, setTabSub] = useState("upcoming");    // upcoming | past  (rides only)

  const [rides, setRides] = useState({
    created: { upcoming: [], past: [] },
    joined:  { upcoming: [], past: [] },
  });

  const [connections, setConnections] = useState([]);
  const [loadingConn, setLoadingConn] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isFocused = useIsFocused();
  const apiBase = useMemo(() => BACKEND_BASE.replace(/\/+$/, ""), []);

  async function getToken(){ return AsyncStorage.getItem("accessToken"); }
  async function fetchJSON(url, opts = {}) {
    const resp = await fetch(url, opts);
    let data; try { data = await resp.json(); } catch { data = { ok: resp.ok, error:"Invalid JSON from server" }; }
    return { resp, data };
  }

  useEffect(()=>{ (async()=>{
    if(!initialUser){
      try{ const raw = await AsyncStorage.getItem("user"); if(raw) setUser(JSON.parse(raw)); }catch{}
    }
  })(); }, []);

  useEffect(()=>{ (async()=>{
    if(!isFocused) return;
    await loadRides();
    if(tabMain==="connections") await loadConnections();
  })(); }, [isFocused]);

  useEffect(()=>{ if(tabMain==="created" || tabMain==="joined") setTabSub("upcoming"); },[tabMain]);

  async function loadRides(){
    try{
      setLoadingRides(true);
      const token = await getToken(); if(!token) return;
      const { resp, data } = await fetchJSON(`${apiBase}/my-rides`, { headers:{ Authorization:`Bearer ${token}` } });
      if(resp.ok && data?.ok){
        setRides({
          created: {
            upcoming: data?.created?.upcoming || [],
            past:     data?.created?.past     || [],
          },
          joined: {
            upcoming: data?.joined?.upcoming || [],
            past:     data?.joined?.past     || [],
          },
        });
      }
    } finally { setLoadingRides(false); }
  }

  async function loadConnections(){
    try{
      setLoadingConn(true);
      const token = await getToken(); if(!token) return;
      const { resp, data } = await fetchJSON(`${apiBase}/connections/me`, { headers:{ Authorization:`Bearer ${token}` } });
      if(resp.ok && data?.ok) setConnections(Array.isArray(data.connections)? data.connections: []);
    } finally { setLoadingConn(false); }
  }

  async function onRefresh(){ setRefreshing(true); try{ tabMain==="connections" ? await loadConnections() : await loadRides(); } finally{ setRefreshing(false); } }

  async function handleLogout(){
    try{
      const accessToken = await AsyncStorage.getItem("accessToken");
      const refreshToken = await AsyncStorage.getItem("refreshToken");
      try { await fetch(`${apiBase}/logout`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization: accessToken?`Bearer ${accessToken}`:undefined }, body: JSON.stringify({ refreshToken }) }); } catch {}
      await AsyncStorage.multiRemove(["user","accessToken","refreshToken"]);
    } finally {
      navigation.dispatch(CommonActions.reset({ index:0, routes:[{ name:"Login" }]}));
      if(typeof window!=="undefined" && window.history){ try{ window.history.replaceState(null,"","/"); }catch{} }
    }
  }
  function confirmLogout(){
    if(Platform.OS==="web" && window?.confirm) return window.confirm("Logout?") && handleLogout();
    Alert.alert("Logout","Are you sure you want to logout?",[
      { text:"Cancel", style:"cancel" }, { text:"Logout", style:"destructive", onPress: handleLogout }
    ]);
  }

  const counts = useMemo(()=>{
    const cU = rides.created.upcoming.length, cP = rides.created.past.length;
    const jU = rides.joined.upcoming.length,  jP = rides.joined.past.length;
    return {
      created: { upcoming:cU, past:cP, total:cU+cP },
      joined:  { upcoming:jU, past:jP, total:jU+jP },
      connections: connections.length,
    };
  },[rides, connections]);

  const list = (tabMain==="created" || tabMain==="joined") ? (rides?.[tabMain]?.[tabSub] || []) : [];

  const formatDT = (iso) => {
    if(!iso) return "-";
    const d = new Date(iso); if(isNaN(d.getTime())) return "-";
    const day = d.toLocaleDateString([], { weekday:"short", day:"2-digit", month:"short" });
    const time = d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    return `${day} • ${time}`;
  };
  const memberPreview = (members=[])=>{
    const shown = members.slice(0,3);
    const more  = Math.max(0, members.length - shown.length);
    const names = shown.map(m => `${m.name}${typeof m.year!=="undefined" ? ` — Yr ${m.year}` : ""}`);
    return `${names.join(" • ")}${more ? ` • +${more} more` : ""}`;
  };
  const routeLine = (g)=>(g?.route || []).join(" → ");

  async function leaveGroup(gid){
    try{
      const token = await getToken(); if(!token) return Alert.alert("Login required");
      if (Platform.OS === "web") {
        if (!window.confirm("Leave this group?")) return;
      } else {
        let proceed=false;
        await new Promise(res=>{
          Alert.alert("Leave Group","Are you sure you want to leave this group?",[
            { text:"Cancel", style:"cancel", onPress:()=>{ proceed=false; res(); } },
            { text:"Leave", style:"destructive", onPress:()=>{ proceed=true; res(); } },
          ]);
        });
        if(!proceed) return;
      }

      const { resp, data } = await fetchJSON(`${apiBase}/leave-group`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
        body: JSON.stringify({ gid }),
      });
      if(!resp?.ok || !data?.ok) return Alert.alert("Failed", data?.error || `HTTP ${resp?.status||"?"}`);

      setRides(prev => ({
        ...prev,
        joined: {
          upcoming: (prev.joined.upcoming || []).filter(g => Number(g.gid)!==Number(gid)),
          past:     (prev.joined.past || []).filter(g => Number(g.gid)!==Number(gid)),
        }
      }));
      Alert.alert("Left group","You are no longer a member.");
    } catch(e){
      Alert.alert("Network error", e?.message || "Try again later");
    }
  }

  const RideCard = ({ g }) => (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => navigation.navigate("GroupDetails", { group: g, user })}
      activeOpacity={0.9}
    >
      <Text style={{ fontWeight:"700", color:"#222", fontSize:15 }}>{routeLine(g)}</Text>

      <View style={styles.rowWrap}>
        <View style={[styles.chip, g.preference==="FEMALE_ONLY" ? styles.chipPink : styles.chipBlue]}>
          <Ionicons name="people" size={12} color="#1a237e" />
          <Text style={styles.chipText}>{g.preference || "ALL"}</Text>
        </View>

        <View style={styles.pill}>
          <Ionicons name="car-outline" size={12} color="#333" />
          <Text style={styles.pillText}>{g.seats_left} seats left • {g.capacity} capacity</Text>
        </View>

        <View style={styles.pill}>
          <Ionicons name="time-outline" size={12} color="#333" />
          <Text style={styles.pillText}>{formatDT(g.departure_date)}</Text>
        </View>

        {tabMain === "joined" && (
          <TouchableOpacity onPress={() => leaveGroup(g.gid)} style={styles.leaveBtn}>
            <Ionicons name="exit-outline" size={14} color="#fff" />
            <Text style={styles.leaveText}>Leave</Text>
          </TouchableOpacity>
        )}
      </View>

      {Array.isArray(g.members) && g.members.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color:"#666" }}>{memberPreview(g.members)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <MapBackdrop blur />
      {/* Pin the card from top & bottom so inner ScrollView can scroll */}
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

        {/* Non-scrolling top info */}
        <Text style={styles.item}>Name: {user?.name ?? "-"}</Text>
        <Text style={styles.item}>Email: {user?.email ?? "-"}</Text>
        <Text style={styles.item}>UID: {user?.uid ?? "-"}</Text>
        <Text style={styles.item}>Gender: {user?.gender ?? "-"}</Text>
        {user?.roll_no || user?.rollNo ? <Text style={styles.item}>Roll No: {user.roll_no || user.rollNo}</Text> : null}
        {typeof user?.year !== "undefined" ? <Text style={styles.item}>Year: {String(user.year)}</Text> : null}

        {/* Tabs */}
        <View style={styles.tabMainRow}>
          {[
            { key: "created", label: "CREATED", count: counts.created.total },
            { key: "joined", label: "JOINED", count: counts.joined.total },
            { key: "connections", label: "CONNECTIONS", count: counts.connections },
          ].map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabMainBtn, tabMain === t.key && styles.tabActive]}
              onPress={async () => {
                setTabMain(t.key);
                if (t.key === "connections") await loadConnections();
              }}
            >
              <Text style={tabMain === t.key ? styles.tabTextActive : styles.tabText}>{t.label}</Text>
              <View style={styles.badge}>
                <Text style={tabMain === t.key ? styles.badgeTextActive : styles.badgeText}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {(tabMain === "created" || tabMain === "joined") && (
          <View style={styles.tabSubRow}>
            {[
              { key:"upcoming", label:"UPCOMING", count:counts[tabMain].upcoming },
              { key:"past",     label:"PAST",     count:counts[tabMain].past }
            ].map(t=>(
              <TouchableOpacity key={t.key} style={[styles.tabSubBtn, tabSub===t.key && styles.tabActiveSub]} onPress={()=>setTabSub(t.key)}>
                <Text style={tabSub===t.key ? styles.tabTextActive : styles.tabText}>{t.label}</Text>
                <View style={styles.badgeSmall}><Text style={tabSub===t.key ? styles.badgeTextActive : styles.badgeText}>{t.count}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Scroll area */}
        <View style={{ flex: 1, marginTop: 8 }}>
          {tabMain === "connections" ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>My Connections</Text>
                <TouchableOpacity onPress={loadConnections} style={styles.refreshBtn} disabled={loadingConn}>
                  {loadingConn ? <ActivityIndicator size="small" color="#fff" /> : (<><Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.refreshText}>Refresh</Text></>)}
                </TouchableOpacity>
              </View>
              {loadingConn ? (
                <ActivityIndicator size="large" color="#1976D2" style={{ marginTop: 16 }} />
              ) : connections.length === 0 ? (
                <Text style={{ color: "#666", marginTop: 8 }}>No connections yet. Connect with members from any group.</Text>
              ) : (
                connections.map((u) => (
                  <View key={u.uid} style={styles.connCard}>
                    <Ionicons name="person-circle-outline" size={28} color="#1a73e8" />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: "#222" }}>{u.name || `User #${u.uid}`}</Text>
                      <Text style={{ color: "#555" }}>{typeof u.year !== "undefined" ? `Year ${u.year}` : "Student"}</Text>
                    </View>
                    <View style={styles.connBadge}><Ionicons name="checkmark-done" size={14} color="#fff" /><Text style={styles.connBadgeText}>Connected</Text></View>
                  </View>
                ))
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {loadingRides ? (
                <ActivityIndicator size="large" color="#E53935" style={{ marginTop: 16 }} />
              ) : list.length === 0 ? (
                <Text style={{ color: "#666" }}>No rides here.</Text>
              ) : (
                list.map(g => <RideCard key={g.gid} g={g} />)
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pin card from top & bottom to give it a fixed, scrollable height
  card:{ position:"absolute", top:60, bottom:16, left:16, right:16, backgroundColor:"rgba(255,255,255,0.95)", padding:20, borderRadius:16, shadowColor:"#000", shadowOpacity:0.2, shadowRadius:6 },
  headerRow:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:8 },
  title:{ fontSize:20, fontWeight:"700", color:"#E53935" },
  item:{ fontSize:14, color:"#444", marginTop:8 },

  tabMainRow:{ flexDirection:"row", marginTop:14, flexWrap:"wrap" },
  tabSubRow:{ flexDirection:"row", marginTop:8, flexWrap:"wrap" },

  tabMainBtn:{ paddingVertical:8, paddingHorizontal:14, borderRadius:14, backgroundColor:"rgba(0,0,0,0.06)", marginRight:10, flexDirection:"row", alignItems:"center", gap:8 },
  tabSubBtn:{  paddingVertical:6, paddingHorizontal:12, borderRadius:12, backgroundColor:"rgba(0,0,0,0.06)", marginRight:10, flexDirection:"row", alignItems:"center", gap:6 },

  tabActive:{ backgroundColor:"#E53935" }, tabActiveSub:{ backgroundColor:"#1976D2" },
  tabText:{ color:"#333", fontWeight:"700" }, tabTextActive:{ color:"#fff", fontWeight:"700" },

  badge:{ backgroundColor:"rgba(0,0,0,0.08)", paddingHorizontal:8, paddingVertical:2, borderRadius:9999 },
  badgeSmall:{ backgroundColor:"rgba(0,0,0,0.08)", paddingHorizontal:6, paddingVertical:1, borderRadius:9999 },
  badgeText:{ color:"#222", fontSize:12, fontWeight:"700" }, badgeTextActive:{ color:"#fff", fontSize:12, fontWeight:"700" },

  rideCard:{ backgroundColor:"rgba(255,255,255,0.95)", borderRadius:12, padding:12, marginTop:10, borderWidth:1, borderColor:"#eee" },
  rowWrap:{ flexDirection:"row", flexWrap:"wrap", alignItems:"center", gap:8, marginTop:6 },
  chip:{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:4, borderRadius:9999 },
  chipBlue:{ backgroundColor:"#b3e5fc" }, chipPink:{ backgroundColor:"#f8bbd0" },
  chipText:{ fontSize:12, fontWeight:"700", color:"#1a237e" },
  pill:{ flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:10, paddingVertical:4, borderRadius:10, backgroundColor:"rgba(0,0,0,0.05)" },
  pillText:{ fontSize:12, color:"#333", fontWeight:"600" },

  leaveBtn:{ marginLeft:"auto", flexDirection:"row", alignItems:"center", gap:6, backgroundColor:"#8e0000", paddingVertical:6, paddingHorizontal:10, borderRadius:8 },
  leaveText:{ color:"#fff", fontWeight:"700" },

  sectionTitle:{ fontSize:16, fontWeight:"700", color:"#222" },
  rowBetween:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
  connCard:{ flexDirection:"row", alignItems:"center", backgroundColor:"rgba(255,255,255,0.95)", borderRadius:12, padding:12, marginTop:8, borderWidth:1, borderColor:"#eee" },
  connBadge:{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:"#43a047", paddingVertical:4, paddingHorizontal:8, borderRadius:9999 },
  connBadgeText:{ color:"#fff", fontWeight:"700", fontSize:12 },
  refreshBtn:{ flexDirection:"row", alignItems:"center", gap:6, backgroundColor:"#1a73e8", paddingVertical:6, paddingHorizontal:10, borderRadius:8 },
  refreshText:{ color:"#fff", fontWeight:"700" },
});
