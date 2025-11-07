import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_BASE } from "../App";

async function safeFetch(url, opts = {}) {
  try {
    const resp = await fetch(url, opts);
    let data = null;
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

export default function LoginScreen({ navigation }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [year, setYear] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [loading, setLoading] = useState(false);

  const isThapar = (e) => /@(?:thapar\.edu)$/i.test((e || "").trim());

  async function handleLogin() {
    const e = email.trim();
    const p = password.trim();
    if (!isThapar(e)) return Alert.alert("Invalid Email", "Use your Thapar email (e.g., rollno@thapar.edu)");
    if (!p) return Alert.alert("Missing Password", "Please enter your password.");

    try {
      setLoading(true);
      const url = `${BACKEND_BASE.replace(/\/+$/, "")}/login`;
      const { resp, data } = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });
      setLoading(false);

      if (!resp || !resp.ok || !data?.ok) {
        const msg = data?.error || `HTTP ${resp?.status || "?"} on /login`;
        throw new Error(msg);
      }

      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      if (data.accessToken) await AsyncStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) await AsyncStorage.setItem("refreshToken", data.refreshToken);

      // 🚫 Don't push user object into URL; read from storage in other screens
      navigation.replace("Main");
    } catch (err) {
      setLoading(false);
      Alert.alert("Login Error", err.message || "Unexpected error");
    }
  }

  async function handleRegister() {
    const e = email.trim();
    const p = password.trim();
    const n = name.trim();
    const g = gender.trim().toUpperCase();
    const y = year.trim();
    const r = rollNo.trim();

    if (!isThapar(e)) return Alert.alert("Invalid Email", "Use your Thapar email (e.g., rollno@thapar.edu)");
    if (!p || !n || !g || !y || !r) return Alert.alert("Missing Fields", "Please fill in all details.");

    try {
      setLoading(true);
      const body = {
        email: e,
        password: p,
        name: n,
        gender: g,
        year: parseInt(y, 10),
        // ⬇️ use the snake_case key if your server expects roll_no
        roll_no: r,
      };

      const url = `${BACKEND_BASE.replace(/\/+$/, "")}/register`;
      const { resp, data } = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setLoading(false);

      if (!resp || !resp.ok || !data?.ok) {
        const msg = data?.error || `HTTP ${resp?.status || "?"} on /register`;
        throw new Error(msg);
      }

      Alert.alert("Success", "Registered successfully! Please login.");
      setMode("login");
      setPassword("");
    } catch (err) {
      setLoading(false);
      Alert.alert("Registration Error", err.message || "Unexpected error");
    }
  }

  return (
    <LinearGradient colors={["#e0f7fa", "#e1bee7"]} style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="car-outline" size={48} color="#E53935" />
        <Text style={styles.title}>RideShare</Text>

        {mode === "login" ? (
          <>
            <Text style={styles.subtitle}>Login with your Thapar email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={20} color="#555" />
              <TextInput
                placeholder="your.roll@thapar.edu"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#555" />
              <TextInput
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
              />
            </View>
            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Login</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode("register")} disabled={loading}>
              <Text style={styles.link}>New user? Register here</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>Register as a Thapar student</Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color="#555" />
              <TextInput placeholder="Full Name" value={name} onChangeText={setName} style={styles.input} />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="male-female-outline" size={20} color="#555" />
              <TextInput
                placeholder="Gender (M/F)"
                value={gender}
                onChangeText={setGender}
                style={styles.input}
                maxLength={1}
                autoCapitalize="characters"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="calendar-outline" size={20} color="#555" />
              <TextInput
                placeholder="Year (1-4)"
                value={year}
                onChangeText={setYear}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={1}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="school-outline" size={20} color="#555" />
              <TextInput
                placeholder="Roll Number"
                value={rollNo}
                onChangeText={setRollNo}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={20} color="#555" />
              <TextInput
                placeholder="asingh19_be23@thapar.edu"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#555" />
              <TextInput
                placeholder="Create password"
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
              />
            </View>
            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Register</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode("login")} disabled={loading}>
              <Text style={styles.link}>Already have an account? Login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    width: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#E53935", marginTop: 8 },
  subtitle: { color: "#555", marginBottom: 20, textAlign: "center" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 14,
    width: "100%",
    backgroundColor: "white",
  },
  input: { flex: 1, padding: 10 },
  btn: { backgroundColor: "#E53935", borderRadius: 10, paddingVertical: 12, width: "100%", marginTop: 6 },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "700", fontSize: 16 },
  link: { color: "#1976D2", textAlign: "center", marginTop: 10, fontWeight: "600" },
});
