import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";

import LoginScreen from "./screens/LoginScreen";
import ProfileScreen from "./screens/ProfileScreen";
import CreateTripScreen from "./screens/CreateTripScreen";
import GroupsScreen from "./screens/GroupsScreen";
import GroupDetailsScreen from "./screens/GroupDetailsScreen";

// ✅ FINAL CLEAN BACKEND URL LOGIC
// 1) Vercel/Expo deploy → uses EXPO_PUBLIC_BACKEND_BASE
// 2) Local/Dev → uses Render backend URL
export const BACKEND_BASE =
  (
    process.env.EXPO_PUBLIC_BACKEND_BASE ||
    "https://ucs503p-202526odd-teamkhabu.onrender.com"
  ).replace(/\/+$/, "");

if (__DEV__) {
  console.log("✅ BACKEND_BASE =", BACKEND_BASE);
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ---------- Bottom Tabs ----------
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "blue",
        tabBarInactiveTintColor: "gray",
      }}
    >
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="CreateTrip"
        component={CreateTripScreen}
        options={{
          title: "Create Trip",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ---------- App Root ----------
export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prepare = async () => {
      await SplashScreen.preventAutoHideAsync();
      setReady(true);
      await SplashScreen.hideAsync();
    };
    prepare();
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        
        {/* Login First */}
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* Tabs after login */}
        <Stack.Screen name="Main" component={MainTabs} />

        {/* Group Details */}
        <Stack.Screen
          name="GroupDetails"
          component={GroupDetailsScreen}
          options={{
            headerShown: true,
            title: "Group Details",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
