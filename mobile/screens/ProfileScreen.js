import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import { BACKEND_BASE } from "../App";
import MapBackdrop from "../components/MapBackdrop";

export default function ProfileScreen({ route, navigation }) {
  const initialUser = route?.params?.user || null;
  const [user, setUser] = useState(initialUser);

  useEffect(() => {
    async function loadUser() {
      if (!initialUser) {
        try {
          const raw = await AsyncStorage.getItem("user");
          if (raw) setUser(JSON.parse(raw));
        } catch (e) {
          console.log("Failed to load user from storage:", e?.message || e);
        }
      }
    }
    loadUser();
  }, []);

  async function handleLogout() {
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      const refreshToken = await AsyncStorage.getItem("refreshToken");

      // Try server logout (non-blocking)
      try {
        await fetch(`${BACKEND_BASE.replace(/\/+$/, "")}/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (e) {
        console.log("Server logout failed (continuing):", e?.message || e);
      }

      // ✅ Clear local auth first to prevent auto-login on next app start
      await AsyncStorage.multiRemove(["user", "accessToken", "refreshToken"]);
      console.log("Auth storage cleared.");
    } finally {
      // ✅ Hard reset to Login screen
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Login" }],
        })
      );
    }
  }

  function handleBack() {
    navigation.goBack();
  }

  return (
    <View style={{ flex: 1 }}>
      <MapBackdrop blur />
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={handleBack} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>

          <Text style={styles.title}>Profile</Text>

          <TouchableOpacity
            onPress={() =>
              Alert.alert("Logout", "Are you sure you want to logout?", [
                { text: "Cancel", style: "cancel" },
                { text: "Logout", style: "destructive", onPress: handleLogout },
              ])
            }
            style={{ padding: 6 }}
          >
            <Ionicons name="log-out-outline" size={22} color="#E53935" />
          </TouchableOpacity>
        </View>

        <Text style={styles.item}>Name: {user?.name ?? "-"}</Text>
        <Text style={styles.item}>Email: {user?.email ?? "-"}</Text>
        <Text style={styles.item}>UID: {user?.uid ?? "-"}</Text>
        <Text style={styles.item}>Gender: {user?.gender ?? "-"}</Text>
        {user?.roll_no || user?.rollNo ? (
          <Text style={styles.item}>Roll No: {user.roll_no || user.rollNo}</Text>
        ) : null}
        {typeof user?.year !== "undefined" ? (
          <Text style={styles.item}>Year: {String(user.year)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 80,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#E53935" },
  item: { fontSize: 14, color: "#444", marginTop: 8 },
});
