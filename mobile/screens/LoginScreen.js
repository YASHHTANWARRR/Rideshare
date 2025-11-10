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
import { LinearGradient } from "expo-linear-gradient"; // ✅ Correct import
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage"; // ✅ Correct import
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
    if (!isThapar(e)) return Alert.alert("Invalid Email", "Use your Thapar email.");
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

      if (!resp || !resp.ok || !data?.ok) throw new Error(data?.error || "Login failed");

      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      if (data.accessToken) await AsyncStorage.setItem("accessToken", data.accessToken);
      if (data.refreshToken) await AsyncStorage.setItem("refreshToken", data.refreshToken);

      navigation.replace("Main");
    } catch (err) {
      setLoading(false);
      Alert.alert("Login Error", err.message);
    }
  }

  async function handleRegister() {
    const e = email.trim();
    const p = password.trim();
    const n = name.trim();
    const g = gender.trim().toUpperCase();
    const y = year.trim();
    const r = rollNo.trim();

    if (!isThapar(e)) return Alert.alert("Invalid Email", "Use your Thapar email.");
    if (!p || !n || !g || !y || !r) return Alert.alert("Missing Fields", "Fill all fields.");
    if (p.length < 8) return Alert.alert("Weak Password", "At least 8 characters.");

    try {
      setLoading(true);
      const body = { email: e, password: p, name: n, gender: g, year: parseInt(y, 10), rollNo: r };
      const url = `${BACKEND_BASE.replace(/\/+$/, "")}/register`;
      const { resp, data } = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setLoading(false);

      if (!resp || !resp.ok || !data?.ok) throw new Error(data?.error || "Register failed");

      Alert.alert("Success", "Registered! Please login.");
      setMode("login");
      setPassword("");
    } catch (err) {
      setLoading(false);
      Alert.alert("Registration Error", err.message);
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
              />
            </View>

            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#555" />
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleLogin}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Login</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode("register")}>
              <Text style={styles.link}>New user? Register here</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* ✅ FULL REGISTER FORM */}
            <>
              <Text style={styles.subtitle}>Register</Text>

              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={20} color="#555" />
                <TextInput
                  placeholder="Full name"
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputRow}>
                <Ionicons name="id-card-outline" size={20} color="#555" />
                <TextInput
                  placeholder="Roll No (e.g., 1023xxx)"
                  value={rollNo}
                  onChangeText={setRollNo}
                  style={styles.input}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={20} color="#555" />
                <TextInput
                  placeholder="agupta_beyear@thapar.edu"
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
                  placeholder="Password (min 8 chars)"
                  value={password}
                  onChangeText={setPassword}
                  style={styles.input}
                  secureTextEntry
                />
              </View>

              {/* Gender toggle */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8, width: "100%" }}>
                {["M", "F"].map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGender(g)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#e2e8f0",
                      backgroundColor: gender === g ? "#fee2e2" : "#f8fafc",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>{g === "M" ? "Male" : "Female"}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputRow}>
                <Ionicons name="school-outline" size={20} color="#555" />
                <TextInput
                  placeholder="Year (1–4)"
                  value={year}
                  onChangeText={setYear}
                  style={styles.input}
                  keyboardType="number-pad"
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && { opacity: 0.7 }]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Register</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setMode("login")}>
                <Text style={styles.link}>Already have an account? Login</Text>
              </TouchableOpacity>
            </>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 20,
    padding: 25,
    width: "85%",
    alignItems: "center",
  },
  title: { fontSize: 28, fontWeight: "700", color: "#E53935", marginBottom: 10 },
  subtitle: { fontSize: 14, color: "#555", marginBottom: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 12,
    backgroundColor: "white",
    width: "100%",
  },
  input: { flex: 1, padding: 10 },
  button: { backgroundColor: "#E53935", paddingVertical: 12, borderRadius: 10, width: "100%" },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  link: { color: "#1976D2", marginTop: 10, fontWeight: "600" },
});
