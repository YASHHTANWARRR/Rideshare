import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import MapBackdrop from "../components/MapBackdrop";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { BACKEND_BASE } from "../App";

export default function ProfileScreen({ route, navigation }) {
  const routeUser = route.params?.user || {};
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

  async function handleLogout() {
    try {
      const token = await AsyncStorage.getItem("accessToken");
      const refreshToken = await AsyncStorage.getItem("refreshToken");

      try {
        await fetch(`${BACKEND_BASE.replace(/\/+$/, "")}/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : undefined,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (e) {
        console.warn("logout request failed", e);
      }
    } finally {
      await AsyncStorage.removeItem("user");
      await AsyncStorage.removeItem("accessToken");
      await AsyncStorage.removeItem("refreshToken");
      navigation.reset({ index: 0, routes: [{ name: "Login" }] });
    }
  }

  function handleBack() {
    navigation.goBack();
  }

  return (
    <View style={{ flex: 1 }}>
      <MapBackdrop blur={true} />
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <TouchableOpacity onPress={handleBack} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
          <TouchableOpacity onPress={() => {
            Alert.alert("Logout", "Are you sure you want to logout?", [
              { text: "Cancel", style: "cancel" },
              { text: "Logout", style: "destructive", onPress: handleLogout }
            ]);
          }} style={{ padding: 6 }}>
            <Ionicons name="log-out-outline" size={22} color="#E53935" />
          </TouchableOpacity>
        </View>

        <Text style={styles.item}>Name: {user?.name ?? "-"}</Text>
        <Text style={styles.item}>Email: {user?.email ?? "-"}</Text>
        <Text style={styles.item}>UID: {user?.uid ?? "-"}</Text>
        <Text style={styles.item}>Gender: {user?.gender ?? "-"}</Text>
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
  title: { fontSize: 20, fontWeight: "700", marginBottom: 10, color: "#E53935" },
  item: { fontSize: 14, color: "#444", marginBottom: 6 },
});
