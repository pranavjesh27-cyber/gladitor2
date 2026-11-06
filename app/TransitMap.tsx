"use client";

import { useEffect, useRef } from "react";
import type { TransportMode } from "@/lib/types";

type LatLng = [number, number];
export type RouteMapGeometry = {
  mode: TransportMode;
  points: LatLng[];
  source: "gtfs-stop-sequence" | "connector";
  boardingStop: string | null;
  alightingStop: string | null;
  boardingWalkMeters: number | null;
  alightingWalkMeters: number | null;
  routeNames: string[];
};

export type MapPoint = { lat: number; lon: number; label: string };

type LeafletLayer = { addTo(map: LeafletMap): LeafletLayer };
type LeafletBounds = { isValid(): boolean };
type LeafletMap = {
  fitBounds(bounds: LeafletBounds, options?: { padding?: [number, number]; maxZoom?: number }): LeafletMap;
  setView(point: LatLng, zoom: number): LeafletMap;
  remove(): void;
  removeLayer(layer: LeafletLayer): void;
  invalidateSize(): void;
};
type Leaflet = {
  map(element: HTMLElement, options: { zoomControl: boolean; scrollWheelZoom: boolean }): LeafletMap;
  tileLayer(url: string, options: { maxZoom: number; attribution: string }): LeafletLayer;
  polyline(points: LatLng[], options: { color: string; weight: number; opacity: number; dashArray?: string }): LeafletLayer;
  circleMarker(point: LatLng, options: { radius: number; color: string; fillColor: string; fillOpacity: number; weight: number }): LeafletLayer & {
    bindTooltip(label: string, options?: { direction?: string; offset?: [number, number]; opacity?: number }): LeafletLayer;
  };
  latLngBounds(points: LatLng[]): LeafletBounds;
};

declare global {
  interface Window { L?: Leaflet }
}

const CITY_CENTER: LatLng = [13.0475, 80.218];
const MODE_COLORS: Record<TransportMode, string> = {
  bus: "#336CE6",
  metro: "#07846F",
  train: "#7555C9",
  walk: "#D96750",
};

export default function TransitMap({
  active,
  ready,
  failed,
  segments = [],
  origin,
  destination,
  selectedPlace,
  language = "en",
}: {
  active: boolean;
  ready: boolean;
  failed: boolean;
  segments?: RouteMapGeometry[];
  origin?: MapPoint;
  destination?: MapPoint;
  selectedPlace?: MapPoint;
  language?: "en" | "ta";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayersRef = useRef<LeafletLayer[]>([]);

  useEffect(() => {
    if (!active || !ready || !containerRef.current || !window.L || mapRef.current) return;
    const leaflet = window.L;
    const map = leaflet.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false });
    leaflet.tileLayer(
      process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      },
    ).addTo(map);
    map.setView(CITY_CENTER, 11);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      routeLayersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [active, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const leaflet = window.L;
    if (!active || !map || !leaflet) return;

    for (const layer of routeLayersRef.current) map.removeLayer(layer);
    routeLayersRef.current = [];
    const bounds: LatLng[] = [];

    for (const segment of segments) {
      if (segment.points.length < 2) continue;
      const points = segment.points;
      const paths = segment.source === "gtfs-stop-sequence" && points.length >= 4
        ? [
            { points: points.slice(0, 2), dashed: true },
            { points: points.slice(1, -1), dashed: false },
            { points: points.slice(-2), dashed: true },
          ]
        : [{ points, dashed: segment.mode === "walk" || segment.source === "connector" }];
      for (const path of paths) {
        if (path.points.length < 2) continue;
        const layer = leaflet.polyline(path.points, {
          color: MODE_COLORS[segment.mode],
          weight: segment.mode === "walk" ? 4 : 6,
          opacity: 0.9,
          ...(path.dashed ? { dashArray: "8 9" } : {}),
        }).addTo(map);
        routeLayersRef.current.push(layer);
      }
      bounds.push(...points);
    }

    const start = selectedPlace ?? origin;
    for (const [point, color] of [[start, "#087F73"], [destination, "#F47762"]] as const) {
      if (!point) continue;
      const marker = leaflet.circleMarker([point.lat, point.lon], {
        radius: 8,
        color: "#ffffff",
        fillColor: color,
        fillOpacity: 1,
        weight: 3,
      });
      marker.addTo(map);
      marker.bindTooltip(point.label, { direction: "top", offset: [0, -7], opacity: 0.95 });
      routeLayersRef.current.push(marker);
      bounds.push([point.lat, point.lon]);
    }

    if (bounds.length > 1) {
      const mapBounds = leaflet.latLngBounds(bounds);
      if (mapBounds.isValid()) map.fitBounds(mapBounds, { padding: [28, 28], maxZoom: 14 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else {
      map.setView(CITY_CENTER, 11);
    }
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [active, destination, origin, segments, selectedPlace]);

  return (
    <div className="transit-map-wrap">
      {active && ready && <div ref={containerRef} className="map-canvas" role="application" aria-label={language === "ta" ? "சென்னைப் பயண வரைபடம்" : "Chennai journey map"} />}
      {active && ready && segments.length > 0 && <div className="map-legend" aria-label={language === "ta" ? "போக்குவரத்து வகைகள்" : "Transport modes"}>
        <span><i className="bus"/>{language === "ta" ? "பேருந்து" : "Bus"}</span>
        <span><i className="metro"/>{language === "ta" ? "மெட்ரோ" : "Metro"}</span>
        <span><i className="train"/>{language === "ta" ? "ரயில்" : "Rail"}</span>
        <span><i className="walk"/>{language === "ta" ? "நடை" : "Walk"}</span>
      </div>}
      {active && !ready && !failed && <div className="map-message" role="status">{language === "ta" ? "வரைபடம் ஏற்றப்படுகிறது…" : "Loading map…"}</div>}
      {active && failed && <div className="map-message" role="status">{language === "ta" ? "வரைபடம் ஏற்றப்படவில்லை. வழிப் பட்டியல் கீழே உள்ளது." : "The map could not load. Your journey details are still available."}</div>}
      {!active && <div ref={containerRef} className="map-canvas" aria-hidden="true" />}
    </div>
  );
}
