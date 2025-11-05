// GroupsScreen.js (modal picker version) — logout removed from header
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import MapBackdrop from "../components/MapBackdrop";
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

export default function GroupsScreen({ route, navigation }) {
  const routeUser = route.params?.user;
  const [user, setUser] = useState(routeUser);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [start, setStart] = useState("");
  const [dest, setDest] = useState("");
  const [preference, setPreference] = useState("ALL");
  const [groupSize, setGroupSize] = useState("1");
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    async function loadUser() {
      if (!user) {
        try {
          const raw = await AsyncStorage.getItem("user");
          if (raw && isMounted.current) setUser(JSON.parse(raw));
        } catch (e) {}
      }
    }
    loadUser();
  }, []);

  const canSearch = start.trim() !== "" && dest.trim() !== "";

  const loadRecommendations = useCallback(async () => {
    if (!canSearch) {
      Alert.alert("Enter route", "Please fill both From and To before searching.");
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem("accessToken");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        start: start.trim(),
        dest: dest.trim(),
        preference: preference || "ALL",
        max_size: parseInt(groupSize || "1", 10),
        time: date ? date.toISOString() : null,
      };

      const { resp, data } = await safeFetch(`${BACKEND_BASE.replace(/\/+$/, "")}/search-groups`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!resp || !resp.ok || !data?.ok) {
        setGroups([]);
        if (data?.error) {
          if (data.error.toLowerCase().includes("token")) {
            Alert.alert("Session expired", "Please login again.");
            await AsyncStorage.removeItem("user");
            await AsyncStorage.removeItem("accessToken");
            await AsyncStorage.removeItem("refreshToken");
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
            return;
          }
          Alert.alert("Search error", data.error);
        }
      } else {
        setGroups(data.matches || []);
      }
    } catch (err) {
      console.error("search-groups error:", err);
      setGroups([]);
      Alert.alert("Network error", "Could not reach server");
    } finally {
      setLoading(false);
    }
  }, [start, dest, preference, groupSize, date, canSearch, navigation]);

  function handleBack() {
    navigation.goBack();
  }

  function openDatePicker() {
    if (Platform.OS === "web") {
      const input = window.prompt("Enter date & time (YYYY-MM-DD HH:MM)", "");
      if (!input) return;
      const parsed = new Date(input.replace(" ", "T") + ":00");
      if (!isNaN(parsed.getTime())) setDate(parsed);
      else Alert.alert("Invalid date");
      return;
    }
    if (isMounted.current) setShowPicker(true);
  }

  function onPickerConfirm(selectedDate) {
    try {
      if (!isMounted.current) return;
      setShowPicker(false);
      if (selectedDate instanceof Date && !isNaN(selectedDate.getTime())) setDate(selectedDate);
    } catch (e) {
      console.warn("picker confirm error", e);
      try { setShowPicker(false); } catch {}
    }
  }

  function onPickerCancel() {
    try {
      if (isMounted.current) setShowPicker(false);
    } catch (e) {}
  }

  const renderItem = ({ item }) => {
    const routeText = (item.route || []).join(" → ");
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("Detail", { group: item, user })}>
        <Text style={styles.cardTitle}>{routeText}</Text>
        <View style={styles.row}>
          <Text style={styles.small}>Seats left: {item.seats_left}</Text>
          <View
            style={[
              styles.chip,
              {
                backgroundColor: item.preference === "FEMALE_ONLY" ? "#f8bbd0" : "#b3e5fc",
              },
            ]}
          >
            <Text style={styles.chipText}>{item.preference}</Text>
          </View>
        </View>
        {item.mutual_friends?.length > 0 && (
          <Text style={{ marginTop: 6, color: "#666" }}>
            Mutuals:{" "}
            {item.mutual_friends
              .map((m) => `${m.name} (deg ${m.degree})`)
              .join(", ")}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <MapBackdrop blur={true} />
      <View style={styles.sheet}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <TouchableOpacity onPress={handleBack} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.header}>Hi, {user?.name?.split(" ")[0] || "Student"} 👋</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="pin" color="#E53935" size={18} />
          <TextInput placeholder="From" style={styles.input} value={start} onChangeText={setStart} />
        </View>
        <View style={styles.inputRow}>
          <Ionicons name="flag" color="#E53935" size={18} />
          <TextInput placeholder="To" style={styles.input} value={dest} onChangeText={setDest} />
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="people" color="#E53935" size={18} />
          <TextInput
            placeholder="Seats required"
            style={styles.input}
            keyboardType="number-pad"
            value={groupSize}
            onChangeText={setGroupSize}
          />
        </View>

        <View style={styles.prefRow}>
          <TouchableOpacity style={[styles.prefBtn, preference === "ALL" && styles.prefBtnActive]} onPress={() => setPreference("ALL")}>
            <Text style={preference === "ALL" ? styles.prefTextActive : styles.prefText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.prefBtn, preference === "FEMALE_ONLY" && styles.prefBtnActive]}
            onPress={() => setPreference("FEMALE_ONLY")}
          >
            <Text style={preference === "FEMALE_ONLY" ? styles.prefTextActive : styles.prefText}>Female Only</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dateBtn} onPress={openDatePicker}>
          <Ionicons name="calendar" color="#fff" size={20} />
          <Text style={styles.dateText}>
            {date.toDateString()} — {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </TouchableOpacity>

        <DateTimePickerModal
          isVisible={showPicker}
          mode="datetime"
          date={date}
          onConfirm={onPickerConfirm}
          onCancel={onPickerCancel}
        />

        <TouchableOpacity style={[styles.searchBtn, !canSearch && { opacity: 0.6 }]} onPress={loadRecommendations} disabled={!canSearch}>
          <Ionicons name="search" color="#fff" size={20} />
          <Text style={styles.searchText}>Find Rides</Text>
        </TouchableOpacity>

        {!canSearch && <Text style={{ marginTop: 10, color: "#666" }}>Enter both From and To to search available groups.</Text>}

        {loading ? (
          <ActivityIndicator size="large" color="#E53935" style={{ marginTop: 16 }} />
        ) : (
          <FlatList data={groups} keyExtractor={(item) => (item.gid ? String(item.gid) : JSON.stringify(item))} renderItem={renderItem} style={{ marginTop: 10 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: 16 },
  header: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: "#222",
    textAlign: "center",
    flex: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  input: { flex: 1, padding: 10 },
  prefRow: { flexDirection: "row", marginTop: 4, marginBottom: 10 },
  prefBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginRight: 10,
  },
  prefBtnActive: { backgroundColor: "#E53935" },
  prefText: { color: "#333", fontWeight: "600" },
  prefTextActive: { color: "#fff", fontWeight: "700" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1976D2",
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  dateText: { color: "#fff", fontWeight: "600", marginLeft: 8 },
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E53935",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 6,
  },
  searchText: { color: "#fff", fontWeight: "700", marginLeft: 6 },
  card: {
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#222" },
  small: { fontSize: 13, color: "#555" },
  chip: {
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 10,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: "#333" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
});
