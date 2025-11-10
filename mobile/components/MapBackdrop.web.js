// MapBackdrop.web.js — OpenStreetMap background (sharp, no blur, no API key)
import React, { useMemo } from "react";

export default function MapBackdrop({
  center = { lat: 30.3398, lng: 76.3869 }, // Patiala-ish
  zoom = 12,                                 // 3..19
  darken = 0.12,                             // 0..1 overlay for contrast
  style = {},
}) {
  const { lat, lng } = center;

  // Compute a bbox for the OSM embed (simple, good for backdrop)
  const dx = 360 / Math.pow(2, zoom + 5);
  const dy = 170 / Math.pow(2, zoom + 5);
  const left = lng - dx, right = lng + dx, bottom = lat - dy, top = lat + dy;

  const src = useMemo(() => {
    const bbox = encodeURIComponent(`${left},${bottom},${right},${top}`);
    const marker = encodeURIComponent(`${lat},${lng}`);
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  }, [left, right, bottom, top, lat, lng]);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden", ...style }}>
      {/* Sharp map (no blur, no scaling) */}
      <iframe
        title="map"
        src={src}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          pointerEvents: "none", // keep foreground UI interactive
        }}
      />

      {/* Soft brand gradient (very light) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(252,228,236,0.25) 0%, rgba(227,242,253,0.25) 100%)",
        }}
      />

      {/* Optional darken for readability on top of the map */}
      {darken > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(0,0,0,${Math.max(0, Math.min(1, darken))})`,
          }}
        />
      )}

      {/* Required OSM attribution */}
      <a
        href="https://www.openstreetmap.org/"
        target="_blank"
        rel="noreferrer"
        style={{
          position: "absolute",
          right: 8,
          bottom: 6,
          fontSize: 10,
          color: "#666",
          background: "rgba(255,255,255,0.7)",
          padding: "2px 6px",
          borderRadius: 6,
          pointerEvents: "auto",
          textDecoration: "none",
        }}
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
