'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { dayColor } from '@/lib/constants';
import type { Place } from '@/lib/types';

export interface MapRoute {
  day: number;
  geometry: [number, number][];
}

interface Props {
  places: Place[];
  routes: MapRoute[];
  /** coordinates of a location being picked in the place form */
  draft?: { lat: number; lng: number } | null;
  focus?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  onSelect?: (place: Place) => void;
  className?: string;
}

function markerIcon(label: string, color: string) {
  return L.divIcon({
    className: '',
    html: `<div class="day-marker" style="background:${color};width:28px;height:28px">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const draftIcon = L.divIcon({
  className: '',
  html: '<div class="day-marker" style="background:#111827;width:22px;height:22px">+</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  const key = places.map((p) => `${p._id}:${p.lat}:${p.lng}`).join('|');
  useEffect(() => {
    if (!places.length) return;
    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function FlyTo({ focus }: { focus?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [focus, map]);
  return null;
}

/** Leaflet only measures its container once: redraw tiles when the layout resizes it. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function ClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
}

export default function TripMap({ places, routes, draft, focus, onPick, onSelect, className }: Props) {
  const numbered = useMemo(() => {
    const counters = new Map<number | null, number>();
    return places.map((p) => {
      const n = (counters.get(p.day) ?? 0) + 1;
      counters.set(p.day, n);
      return { place: p, label: p.day ? String(n) : '•' };
    });
  }, [places]);

  const center: [number, number] = places.length ? [places[0].lat, places[0].lng] : [36.8, 10.18];

  return (
    <MapContainer center={center} zoom={places.length ? 13 : 4} scrollWheelZoom className={className ?? 'h-[420px] w-full rounded-xl'}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <AutoResize />
      <FitBounds places={places} />
      <FlyTo focus={focus} />
      <ClickHandler onPick={onPick} />
      {routes.map((r) => (
        <Polyline key={r.day} positions={r.geometry} pathOptions={{ color: dayColor(r.day), weight: 4, opacity: 0.8 }} />
      ))}
      {numbered.map(({ place, label }) => (
        <Marker
          key={place._id}
          position={[place.lat, place.lng]}
          icon={markerIcon(label, dayColor(place.day))}
          eventHandlers={{ click: () => onSelect?.(place) }}
          title={place.name}
          alt={place.name}
        >
          <Popup>
            <strong>{place.name}</strong>
            <br />
            {place.day ? `Day ${place.day}` : 'Not scheduled'}
            {place.startTime ? ` · ${place.startTime}` : ''}
          </Popup>
        </Marker>
      ))}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={draftIcon} />}
    </MapContainer>
  );
}
