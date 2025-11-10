import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { BACKEND_BASE } from "../App";
import MapBackdrop from "../components/MapBackdrop";
import AsyncStorage from "@react-native-async-storage/async-storage";

// -------- helpers ----------
async function safeFetch(url, opts = {}) {
  try {
    const resp = await fetch(url, opts);
    let data = null;
    try { data = await resp.json(); } catch { data = { ok: resp.ok, error: "Invalid JSON from server" }; }
    return { resp, data };
  } catch (e) {
    return { resp: null, data: { ok:false, error: e.message || "Network error" } };
  }
}
function normCity(s) {
  return String(s || "").replace(/[^a-zA-Z.\-\s]/g, "").replace(/\s+/g, " ").trim();
}
function pad(n){ return String(n).padStart(2,"0"); }
function toLocalDatetimeValue(d){
  // "YYYY-MM-DDTHH:MM" (local) for <input type="datetime-local">
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// --------------------------------

export default function CreateTripScreen({ route, navigation }) {
  const routeUser = route?.params?.user || null;
  const [user, setUser] = useState(routeUser);

  const [start, setStart] = useState("");
  const [dest, setDest] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [preference, setPreference] = useState("ALL");
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);        // native picker
  const [stopsText, setStopsText] = useState("");
  const [loading, setLoading] = useState(false);

  // WEB datetime modal state
  const [showWebPicker, setShowWebPicker] = useState(false);
  const [webValue, setWebValue] = useState(toLocalDatetimeValue(new Date()));

  const isMounted = useRef(true);
  useEffect(()=>{ isMounted.current = true; return ()=>{ isMounted.current=false; }; },[]);
  useEffect(()=>{ (async()=>{
    if(!user){ try{ const raw=await AsyncStorage.getItem("user"); if(raw && isMounted.current) setUser(JSON.parse(raw)); }catch{} }
  })(); },[]);

  function handleBack(){ navigation.goBack(); }

  // ------- open picker (web/native) -------
  function openDatePicker(){
    if(Platform.OS === "web"){
      setWebValue(toLocalDatetimeValue(date));
      setShowWebPicker(true);
      return;
    }
    if(isMounted.current) setShowPicker(true);
  }
  function onPickerConfirm(selectedDate){
    try{
      if(!isMounted.current) return;
      setShowPicker(false);
      if(selectedDate instanceof Date && !isNaN(selectedDate.getTime())) setDate(selectedDate);
    }catch{ try{ setShowPicker(false);}catch{} }
  }
  function onPickerCancel(){ try{ if(isMounted.current) setShowPicker(false);}catch{} }

  // WEB modal handlers
  function confirmWebPicker(){
    if(!webValue) { setShowWebPicker(false); return; }
    const d = new Date(webValue); // value is local
    if(!isNaN(d.getTime())) setDate(d); else Alert.alert("Invalid date");
    setShowWebPicker(false);
  }
  function cancelWebPicker(){ setShowWebPicker(false); }

  async function onCreate(){
    if(!start.trim() || !dest.trim() || !groupSize.trim()){
      return Alert.alert("Missing Fields","Please fill From, To and Group size.");
    }
    setLoading(true);
    try{
      // sanitize stops
      let stopsPayload = null;
      if(stopsText && stopsText.trim()){
        const sLower = normCity(start).toLowerCase();
        const dLower = normCity(dest).toLowerCase();
        const seen = new Set();
        const arr = stopsText.split(",").map(normCity).filter(Boolean).filter(x=>{
          const v = x.toLowerCase(); if(v===sLower || v===dLower) return false; if(seen.has(v)) return false; seen.add(v); return true;
        });
        if(arr.length) stopsPayload = arr;
      }

      const payload = {
        start: start.trim(),
        dest: dest.trim(),
        capacity: parseInt(groupSize,10) || 4,
        preference: preference || "ALL",
        departure: date ? date.toISOString() : null,
        stops: stopsPayload,
      };

      const token = await AsyncStorage.getItem("accessToken");
      if(!token){
        setLoading(false);
        Alert.alert("Login required","Please login first.");
        navigation.reset({ index:0, routes:[{ name:"Login" }] });
        return;
      }
      const headers = { "Content-Type":"application/json", Authorization:`Bearer ${token}` };

      const { resp, data } = await safeFetch(`${BACKEND_BASE.replace(/\/+$/,"")}/create-trip`, {
        method:"POST", headers, body: JSON.stringify(payload)
      });

      if(!resp || !resp.ok || !data?.ok){
        setLoading(false);
        if(data?.error && String(data.error).toLowerCase().includes("auth")){
          Alert.alert("Session expired","Please login again.");
          await AsyncStorage.multiRemove(["user","accessToken","refreshToken"]);
          navigation.reset({ index:0, routes:[{ name:"Login" }] });
          return;
        }
        return Alert.alert("Create failed", data?.error || `HTTP ${resp?.status||"?"}`);
      }

      setLoading(false);
      Alert.alert("Success","Group created successfully!");
      navigation.navigate("Main",{ screen:"Groups", params:{ user }});
    }catch(err){
      setLoading(false);
      console.error("create-trip error:", err);
      Alert.alert("Network error","Could not reach server");
    }
  }

  return (
    <View style={{ flex:1 }}>
      <MapBackdrop blur={false} />
      <View style={styles.sheet}>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
          <TouchableOpacity onPress={handleBack} style={{ padding:6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.header}>Create a Ride</Text>
          <View style={{ width:36 }} />
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="pin" color="#E53935" size={18} />
          <TextInput placeholder="From (city)" style={styles.input} value={start} onChangeText={setStart} />
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="flag" color="#E53935" size={18} />
          <TextInput placeholder="To (city)" style={styles.input} value={dest} onChangeText={setDest} />
        </View>

        <View style={styles.inputRow}>
          <Ionicons name="people" color="#E53935" size={18} />
          <TextInput placeholder="Total capacity (e.g., 4)" style={styles.input}
            keyboardType="number-pad" value={groupSize} onChangeText={setGroupSize}/>
        </View>

        <View style={styles.prefRow}>
          <TouchableOpacity style={[styles.prefBtn, preference==="ALL" && styles.prefBtnActive]} onPress={()=>setPreference("ALL")}>
            <Text style={preference==="ALL"?styles.prefTextActive:styles.prefText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.prefBtn, preference==="FEMALE_ONLY" && styles.prefBtnActive]} onPress={()=>setPreference("FEMALE_ONLY")}>
            <Text style={preference==="FEMALE_ONLY"?styles.prefTextActive:styles.prefText}>Female Only</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dateBtn} onPress={openDatePicker}>
          <Ionicons name="calendar" color="#fff" size={20} />
          <Text style={styles.dateText}>
            {date.toDateString()} — {date.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
          </Text>
        </TouchableOpacity>

        {/* Native iOS/Android picker */}
        <DateTimePickerModal isVisible={showPicker} mode="datetime" date={date}
          onConfirm={onPickerConfirm} onCancel={onPickerCancel} />

        {/* WEB datetime-local modal */}
        {Platform.OS === "web" && showWebPicker && (
          <div style={webModalStyles.backdrop}>
            <div style={webModalStyles.card}>
              <div style={{ fontWeight:700, marginBottom:8 }}>Pick date & time</div>
              <input
                type="datetime-local"
                value={webValue}
                onChange={(e)=>setWebValue(e.target.value)}
                style={webModalStyles.input}
              />
              <div style={webModalStyles.row}>
                <button onClick={confirmWebPicker} style={webModalStyles.primary}>OK</button>
                <button onClick={cancelWebPicker} style={webModalStyles.secondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <View style={[styles.inputRow,{ alignItems:"flex-start" }]}>
          <Ionicons name="git-branch" color="#E53935" size={18} style={{ marginTop:12 }} />
          <TextInput
            placeholder="Intermediate stops (comma-separated, e.g., Ambala, Ludhiana)"
            style={[styles.input,{ minHeight:44 }]}
            value={stopsText} onChangeText={setStopsText} multiline
          />
        </View>

        <TouchableOpacity style={[styles.createBtn, loading && { opacity:0.7 }]} onPress={onCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff"/> : (<><Ionicons name="checkmark-circle" color="#fff" size={20}/><Text style={styles.createText}>Create</Text></>)}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet:{ flex:1, padding:16 },
  header:{ fontSize:20, fontWeight:"700", marginBottom:12, color:"#222", textAlign:"center", flex:1 },
  inputRow:{ flexDirection:"row", alignItems:"center", borderWidth:1, borderColor:"#ddd", borderRadius:12, paddingHorizontal:10, marginBottom:10, backgroundColor:"rgba(255,255,255,0.95)" },
  input:{ flex:1, padding:10 },
  prefRow:{ flexDirection:"row", marginTop:4, marginBottom:10 },
  prefBtn:{ paddingVertical:8, paddingHorizontal:16, borderRadius:18, backgroundColor:"rgba(0,0,0,0.06)", marginRight:10 },
  prefBtnActive:{ backgroundColor:"#E53935" },
  prefText:{ color:"#333", fontWeight:"600" },
  prefTextActive:{ color:"#fff", fontWeight:"700" },
  dateBtn:{ flexDirection:"row", alignItems:"center", justifyContent:"center", backgroundColor:"#1976D2", borderRadius:12, paddingVertical:10, marginBottom:10 },
  dateText:{ color:"#fff", fontWeight:"600", marginLeft:8 },
  createBtn:{ flexDirection:"row", alignItems:"center", justifyContent:"center", backgroundColor:"#43A047", borderRadius:12, paddingVertical:12, marginTop:6 },
  createText:{ color:"#fff", fontWeight:"700", marginLeft:6 },
});

// simple inline CSS for web modal (kept separate for clarity)
const webModalStyles = {
  backdrop:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex: 9999 },
  card:{ width:360, background:"#fff", borderRadius:12, padding:16, boxShadow:"0 10px 30px rgba(0,0,0,0.25)" },
  input:{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #ddd", fontSize:14, outline:"none" },
  row:{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 },
  primary:{ padding:"8px 14px", borderRadius:8, border:"none", background:"#1976D2", color:"#fff", fontWeight:700, cursor:"pointer" },
  secondary:{ padding:"8px 14px", borderRadius:8, border:"1px solid #ccc", background:"#fff", color:"#333", cursor:"pointer" },
};
