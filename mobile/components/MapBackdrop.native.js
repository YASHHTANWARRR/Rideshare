// mobile/components/MapBackdrop.native.js
import React, { useRef, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import MapView from "react-native-maps";
import { BlurView } from "expo-blur";

export default function MapBackdrop({ blur = true }) {
  const ref = useRef(null);

  useEffect(() => {
    let angle = 0;
    const id = setInterval(() => {
      angle += 0.03;
      const lat = 30.35 + 0.02 * Math.sin(angle);
      const lng = 76.38 + 0.02 * Math.cos(angle);
      ref.current?.animateCamera(
        { center: { latitude: lat, longitude: lng }, zoom: 11, heading: (angle * 40) % 360, pitch: 20 },
        { duration: 3000 }
      );
    }, 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: 30.3398,
          longitude: 76.3869,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        }}
        pointerEvents="none"
        showsCompass={false}
        showsPointsOfInterest={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
      />
      {blur && <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />}
      <View style={styles.overlayTint} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlayTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.30)" },
});
