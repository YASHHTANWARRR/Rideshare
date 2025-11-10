import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Alert, Platform, Switch
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import MapBackdrop from "../components/MapBackdrop";
import { BACKEND_BASE } from "../App";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function safeFetch(url, opts = {}) {
  try { const resp = await fetch(url, opts); let data; try{ data = await resp.json(); }catch{ data = { ok: resp.ok, error:"Invalid JSON from server" }; } return { resp, data };
  } catch(e){ return { resp:null, data:{ ok:false, error:e.message || "Network error" } }; }
}
function pad(n){ return String(n).padStart(2,"0"); }
function toLocalDatetimeValue(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

export default function GroupsScreen({ route, navigation }) {
  const routeUser = route?.params?.user;
  const [user, setUser] = useState(routeUser);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);

  const [start, setStart] = useState("");
  const [dest, setDest] = useState("");
  const [preference, setPreference] = useState("ALL");
  const [groupSize, setGroupSize] = useState("1");
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const [showWebPicker, setShowWebPicker] = useState(false);
  const [webValue, setWebValue] = useState(toLocalDatetimeValue(new Date()));

  const [wholeDay, setWholeDay] = useState(true);
  const [windowMins, setWindowMins] = useState("60");
  const [onlyMutuals, setOnlyMutuals] = useState(false);

  const isMounted = useRef(true);
  useEffect(()=>()=>{ isMounted.current=false; },[]);
  useEffect(()=>{ (async()=>{ if(!user){ try{ const raw=await AsyncStorage.getItem("user"); if(raw && isMounted.current) setUser(JSON.parse(raw)); }catch{} } })(); },[]);

  const canSearch = start.trim()!=="" && dest.trim()!=="";

  const loadRecommendations = useCallback(async ()=>{
    if(!canSearch){ Alert.alert("Enter route","Please fill both From and To before searching."); return; }
    setLoading(true);
    const token = await AsyncStorage.getItem("accessToken");
    if(!token){ setLoading(false); Alert.alert("Login required","Please login to search and see mutual connections."); navigation.reset({ index:0, routes:[{ name:"Login" }]} ); return; }
    try{
      const headers = { "Content-Type":"application/json", Authorization:`Bearer ${token}` };
      const payload = {
        start: start.trim(),
        dest: dest.trim(),
        preference: preference || "ALL",
        max_size: parseInt(groupSize || "1",10),
        departure: date ? date.toISOString() : null,
        scope: wholeDay ? "day" : "",
        time_window_mins: wholeDay ? null : (parseInt(windowMins||"60",10) || 60),
      };
      const { resp, data } = await safeFetch(`${BACKEND_BASE.replace(/\/+$/,"")}/search-groups`, { method:"POST", headers, body: JSON.stringify(payload) });
      if(!resp || !resp.ok || !data?.ok){
        setGroups([]);
        if(data?.error){
          if(String(data.error).toLowerCase().includes("token")){
            Alert.alert("Session expired","Please login again.");
            await AsyncStorage.multiRemove(["user","accessToken","refreshToken"]);
            navigation.reset({ index:0, routes:[{ name:"Login" }]} );
            return;
          }
          Alert.alert("Search error", data.error);
        }
      }else{
        const list = Array.isArray(data.groups) ? data.groups : [];
        const filtered = onlyMutuals ? list.filter(g => (g.mutual_count||g.mutual_friends?.length||0)>0) : list;
        filtered.sort((a,b)=>(b.mutual_count||b.mutual_friends?.length||0)-(a.mutual_count||a.mutual_friends?.length||0) || (b.seats_left||0)-(a.seats_left||0));
        setGroups(filtered);
      }
    }catch(err){
      console.error("search-groups error:", err);
      setGroups([]); Alert.alert("Network error","Could not reach server");
    }finally{ setLoading(false); }
  }, [start,dest,preference,groupSize,date,wholeDay,windowMins,onlyMutuals,canSearch,navigation]);

  function handleBack(){ navigation.goBack(); }

  // date picker (web/native)
  function openDatePicker(){
    if(Platform.OS==="web"){ setWebValue(toLocalDatetimeValue(date)); setShowWebPicker(true); return; }
    if(isMounted.current) setShowPicker(true);
  }
  function onPickerConfirm(d){ try{ if(!isMounted.current) return; setShowPicker(false); if(d instanceof Date && !isNaN(d.getTime())) setDate(d);}catch{ try{ setShowPicker(false);}catch{} } }
  function onPickerCancel(){ try{ if(isMounted.current) setShowPicker(false);}catch{} }

  function confirmWebPicker(){
    if(!webValue){ setShowWebPicker(false); return; }
    const d = new Date(webValue);
    if(!isNaN(d.getTime())) setDate(d); else Alert.alert("Invalid date");
    setShowWebPicker(false);
  }
  function cancelWebPicker(){ setShowWebPicker(false); }

  const renderItem = ({ item }) => {
    const routeText = (item.route || []).join(" → ");
    const mutualCount = item.mutual_count || (item.mutual_friends?.length || 0);
    return (
      <TouchableOpacity style={styles.card} onPress={()=>navigation.navigate("GroupDetails",{ group:item, user })}>
        <Text style={styles.cardTitle}>{routeText}</Text>
        <View style={styles.row}>
          <Text style={styles.small}>Seats left: {item.seats_left}</Text>
          <View style={[styles.chip, { backgroundColor: item.preference==="FEMALE_ONLY" ? "#f8bbd0" : "#b3e5fc" }]}>
            <Text style={styles.chipText}>{item.preference}</Text>
          </View>
        </View>
        {mutualCount>0 && (
          <View style={{ marginTop:6 }}>
            <View style={styles.badge}><Text style={styles.badgeText}>{mutualCount} mutual {mutualCount>1?"connections":"connection"}</Text></View>
            <Text style={{ marginTop:4, color:"#666" }}>{(item.mutual_friends||[]).map(m=>`${m.name} (${m.degree_label||`deg ${m.degree}`})`).join(", ")}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex:1 }}>
      <MapBackdrop blur={false} />
      <View style={styles.sheet}>
        <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
          <TouchableOpacity onPress={handleBack} style={{ padding:6 }}>
            <Ionicons name="arrow-back" size={22} color="#333" />
          </TouchableOpacity>
          <Text style={styles.header}>Hi, {user?.name?.split(" ")[0] || "Student"} 👋</Text>
          <View style={{ width:36 }} />
        </View>

        <View style={styles.inputRow}><Ionicons name="pin" color="#E53935" size={18} /><TextInput placeholder="From" style={styles.input} value={start} onChangeText={setStart}/></View>
        <View style={styles.inputRow}><Ionicons name="flag" color="#E53935" size={18} /><TextInput placeholder="To" style={styles.input} value={dest} onChangeText={setDest}/></View>
        <View style={styles.inputRow}><Ionicons name="people" color="#E53935" size={18} /><TextInput placeholder="Seats required" style={styles.input} keyboardType="number-pad" value={groupSize} onChangeText={setGroupSize}/></View>

        <View style={styles.prefRow}>
          <TouchableOpacity style={[styles.prefBtn, preference==="ALL" && styles.prefBtnActive]} onPress={()=>setPreference("ALL")}><Text style={preference==="ALL"?styles.prefTextActive:styles.prefText}>All</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.prefBtn, preference==="FEMALE_ONLY" && styles.prefBtnActive]} onPress={()=>setPreference("FEMALE_ONLY")}><Text style={preference==="FEMALE_ONLY"?styles.prefTextActive:styles.prefText}>Female Only</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dateBtn} onPress={openDatePicker}>
          <Ionicons name="calendar" color="#fff" size={20} />
          <Text style={styles.dateText}>{date.toDateString()} — {date.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}</Text>
        </TouchableOpacity>

        {/* Native picker */}
        <DateTimePickerModal isVisible={showPicker} mode="datetime" date={date} onConfirm={onPickerConfirm} onCancel={onPickerCancel} />
        {/* Web modal */}
        {Platform.OS==="web" && showWebPicker && (
          <div style={webModalStyles.backdrop}>
            <div style={webModalStyles.card}>
              <div style={{ fontWeight:700, marginBottom:8 }}>Pick date & time</div>
              <input type="datetime-local" value={webValue} onChange={(e)=>setWebValue(e.target.value)} style={webModalStyles.input}/>
              <div style={webModalStyles.row}>
                <button onClick={confirmWebPicker} style={webModalStyles.primary}>OK</button>
                <button onClick={cancelWebPicker} style={webModalStyles.secondary}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <View style={styles.rowBetween}>
          <View style={{ flexDirection:"row", alignItems:"center" }}>
            <Switch value={wholeDay} onValueChange={setWholeDay} />
            <Text style={{ marginLeft:8 }}>Whole day search</Text>
          </View>
          {!wholeDay && (
            <View style={[styles.inputRow,{ width:150, marginBottom:0 }]}>
              <Ionicons name="time" color="#E53935" size={18} />
              <TextInput placeholder="Window (mins)" style={styles.input} keyboardType="number-pad" value={windowMins} onChangeText={setWindowMins}/>
            </View>
          )}
        </View>

        <View style={{ flexDirection:"row", alignItems:"center", marginTop:8 }}>
          <Switch value={onlyMutuals} onValueChange={setOnlyMutuals} />
          <Text style={{ marginLeft:8 }}>Only show with mutuals</Text>
        </View>

        <TouchableOpacity style={[styles.searchBtn, !canSearch && { opacity:0.6 }]} onPress={loadRecommendations} disabled={!canSearch}>
          <Ionicons name="search" color="#fff" size={20} />
          <Text style={styles.searchText}>Find Rides</Text>
        </TouchableOpacity>

        {!canSearch && <Text style={{ marginTop:10, color:"#666" }}>Enter both From and To to search available groups.</Text>}

        {loading ? <ActivityIndicator size="large" color="#E53935" style={{ marginTop:16 }}/> : <FlatList data={groups} keyExtractor={(it)=>String(it.gid)} renderItem={renderItem} style={{ marginTop:10 }}/>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet:{ flex:1, padding:16 },
  header:{ fontSize:20, fontWeight:"700", marginBottom:12, color:"#222", textAlign:"center", flex:1 },
  inputRow:{ flexDirection:"row", alignItems:"center", borderWidth:1, borderColor:"#ddd", borderRadius:12, paddingHorizontal:10, marginBottom:10, backgroundColor:"#fff" },
  input:{ flex:1, paddingVertical:10, marginLeft:8 },
  prefRow:{ flexDirection:"row", gap:10, marginVertical:6 },
  prefBtn:{ paddingVertical:8, paddingHorizontal:16, borderRadius:18, backgroundColor:"rgba(0,0,0,0.06)", marginRight:10 },
  prefBtnActive:{ backgroundColor:"#E53935" },
  prefText:{ color:"#333", fontWeight:"600" },
  prefTextActive:{ color:"#fff", fontWeight:"700" },
  dateBtn:{ marginTop:6, flexDirection:"row", gap:8, alignItems:"center", backgroundColor:"#1976D2", paddingVertical:10, paddingHorizontal:12, borderRadius:12, alignSelf:"flex-start" },
  dateText:{ color:"#fff", fontWeight:"700" },
  row:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginTop:6 },
  rowBetween:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  chip:{ paddingHorizontal:10, paddingVertical:4, borderRadius:12, marginLeft:10 },
  chipText:{ fontSize:12, fontWeight:"600", color:"#333" },
  card:{ backgroundColor:"rgba(255,255,255,0.95)", padding:14, borderRadius:14, marginTop:10, shadowColor:"#000", shadowOpacity:0.15, shadowRadius:6 },
  cardTitle:{ fontSize:16, fontWeight:"700", color:"#222" },
  small:{ fontSize:13, color:"#555" },
  searchBtn:{ marginTop:10, flexDirection:"row", alignItems:"center", justifyContent:"center", backgroundColor:"#E53935", paddingVertical:12, borderRadius:12, alignSelf:"flex-start", paddingHorizontal:16 },
  searchText:{ color:"#fff", fontWeight:"700", marginLeft:6 },
  badge:{ alignSelf:"flex-start", backgroundColor:"#e8f0fe", paddingHorizontal:10, paddingVertical:4, borderRadius:12 },
  badgeText:{ color:"#1a73e8", fontSize:12, fontWeight:"700" }
});

// web modal css
const webModalStyles = {
  backdrop:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", display:"flex", alignItems:"center", justifyContent:"center", zIndex: 9999 },
  card:{ width:360, background:"#fff", borderRadius:12, padding:16, boxShadow:"0 10px 30px rgba(0,0,0,0.25)" },
  input:{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid #ddd", fontSize:14, outline:"none" },
  row:{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 },
  primary:{ padding:"8px 14px", borderRadius:8, border:"none", background:"#1976D2", color:"#fff", fontWeight:700, cursor:"pointer" },
  secondary:{ padding:"8px 14px", borderRadius:8, border:"1px solid #ccc", background:"#fff", color:"#333", cursor:"pointer" },
};
