// App.js — backend detection + web deep link disabled + stable auth bootstrap
import React, { useEffect, useState } from "react";
import { StatusBar, View, ActivityIndicator, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// screens
import LoginScreen from "./screens/LoginScreen";
import GroupsScreen from "./screens/GroupsScreen";
import GroupDetailScreen from "./screens/GroupDetailsScreen";
import CreateTripScreen from "./screens/CreateTripScreen";
import ProfileScreen from "./screens/ProfileScreen";

/*
  HOW TO OVERRIDE BACKEND BASE:
  - For quick local testing set global.__BACKEND_BASE__ before App loads.
  - Or set EXPO_PUBLIC_BACKEND_BASE in app config.
*/
const MANUAL_BACKEND_BASE = null;

function detectBackendBase() {
  if (typeof global !== "undefined" && global.__BACKEND_BASE__) return global.__BACKEND_BASE__;
  try {
    if (process && process.env && process.env.EXPO_PUBLIC_BACKEND_BASE) {
      return process.env.EXPO_PUBLIC_BACKEND_BASE;
    }
  } catch {}
  const expoPublic =
    Constants.manifest?.extra?.expoPublicBackend ||
    (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.expoPublicBackend);
  if (expoPublic) return expoPublic;

  if (__DEV__) {
    const manifest = Constants.manifest || Constants.manifest2 || Constants.expoConfig || null;
    const debuggerHost = manifest && (manifest.debuggerHost || manifest.hostUri);
    if (debuggerHost) {
      const host = String(debuggerHost).split(":")[0];
      return `http://${host}:3000`;
    }
    if (Platform.OS === "android") return "http://10.0.2.2:3000";
    return "http://localhost:3000";
  }

  // production fallback
  return "https://ucs503p-202526odd-teamkhabu.onrender.com";
}

export const BACKEND_BASE = MANUAL_BACKEND_BASE || detectBackendBase();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ route }) {
  const user = route?.params?.user || null;
  return (
    <Tab.Navigator
      screenOptions={({ route: r }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#E53935",
        tabBarStyle: { height: 60, paddingBottom: 6, paddingTop: 6 },
        tabBarIcon: ({ color, size }) => {
          let name = "ellipse";
          if (r.name === "Groups") name = "list";
          if (r.name === "CreateTrip") name = "add-circle";
          if (r.name === "Profile") name = "person";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Groups" component={GroupsScreen} initialParams={{ user }} />
      <Tab.Screen name="CreateTrip" component={CreateTripScreen} initialParams={{ user }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ user }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [initialParams, setInitialParams] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const rawUser = await AsyncStorage.getItem("user");
        const token = await AsyncStorage.getItem("accessToken");
        if (rawUser && token) {
          setInitialParams({ user: JSON.parse(rawUser) });
          setInitialRoute("Main");
        } else {
          setInitialRoute("Login");
        }
      } catch {
        setInitialRoute("Login");
      }
    })();
  }, []);

  if (initialRoute === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  return (
    <NavigationContainer
      // ❗️Disable URL-based deep linking on web so /Main/... doesn't force open after logout
      linking={Platform.OS === "web" ? { enabled: false } : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Main" component={MainTabs} initialParams={initialParams} />
        <Stack.Screen name="Detail" component={GroupDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
