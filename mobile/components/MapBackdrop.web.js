import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function MapBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={["#fce4ec", "#e3f2fd"]} style={StyleSheet.absoluteFill} />
      <View style={styles.overlayTint} />
    </View>
  );
}
const styles = StyleSheet.create({
  overlayTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.30)" },
});
