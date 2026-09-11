"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, Layers3, MapPin, Search, UsersRound, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

declare global { interface Window { google: any; __kyoudouMapReady?: () => void } }

type Metric = "total" | "households_2025" | "population_2025" | "stores" | "delivery";
type Area = {
  id: number; code: string; address: string | null; municipality_town: string | null; town: string | null;
  households_2025: number | null; population_2025: number | null; households_2023: number | null;
  population_2023: number | null; stores: number | null; delivery: number | null;
  headquarters: number | null; corporation: number | null; total: number | null;
  geom: { type: string; coordinates: unknown };
};

const metricLabels: Record<Metric, string> = {
  total: "顧客合計", households_2025: "世帯数 2025", population_2025: "人口 2025", stores: "店舗", delivery: "デリ",
};
const palette = ["#e8f3ff", "#b9d9ff", "#7bb6f2", "#3d8bd4", "#165b9e"];

function loadGoogleMaps(key: string) {
  if (window.google?.maps) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>("script[data-kyoudou-maps]");
    if (prior) { prior.addEventListener("load", () => resolve()); return; }
    window.__kyoudouMapReady = () => resolve();
    const script = document.createElement("script");
    script.dataset.kyoudouMaps = "true"; script.async = true; script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__kyoudouMapReady&v=weekly&loading=async`;
    script.onerror = () => reject(new Error("Google Mapsを読み込めませんでした。"));
    document.head.appendChild(script);
  });
}

function allPoints(value: unknown, result: number[][] = []): number[][] {
  if (!Array.isArray(value)) return result;
  if (typeof value[0] === "number" && typeof value[1] === "number") result.push(value as number[]);
  else value.forEach((item) => allPoints(item, result));
  return result;
}

function centerOf(geometry: Area["geom"]) {
  const points = allPoints(geometry.coordinates);
  if (!points.length) return { lat: 35.872, lng: 139.648 };
  const box = points.reduce((v, point) => ({ minLat: Math.min(v.minLat, point[1]), maxLat: Math.max(v.maxLat, point[1]), minLng: Math.min(v.minLng, point[0]), maxLng: Math.max(v.maxLng, point[0]) }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
  return { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
}

function valueColor(value: number, max: number) {
  if (!value || max <= 0) return "#eef2f6";
  return palette[Math.min(4, Math.floor((value / max) * 5))];
}

export default function MapDashboard() {
  const mapNode = useRef<HTMLDivElement>(null); const mapRef = useRef<any>(null); const labelsRef = useRef<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]); const [selected, setSelected] = useState<Area | null>(null);
  const [metric, setMetric] = useState<Metric>("total"); const [labels, setLabels] = useState(true); const [fills, setFills] = useState(true);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("データを読み込んでいます…");
  const maxValue = useMemo(() => Math.max(1, ...areas.map((a) => Number(a[metric] ?? 0))), [areas, metric]);
  const matchedCount = useMemo(() => areas.filter((a) => a.address).length, [areas]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setStatus("Supabaseの環境変数を設定してください。"); return; }
    fetch(`${url}/rest/v1/saitamasi_chouchoumoku?select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "kyoudou" } })
      .then(async (res) => { if (!res.ok) throw new Error(await res.text()); return await res.json() as Area[]; })
      .then((data) => { setAreas(data); setStatus(`${data.length.toLocaleString()}町丁目を表示`); })
      .catch((e) => setStatus(`データ取得エラー：${e.message}`));
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !mapNode.current) { if (!key) setStatus("Google Maps APIキーを設定してください。"); return; }
    loadGoogleMaps(key).then(() => {
      if (!mapNode.current || mapRef.current) return;
      mapRef.current = new window.google.maps.Map(mapNode.current, {
        center: { lat: 35.872, lng: 139.648 }, zoom: 11, mapTypeControl: false, streetViewControl: false,
        fullscreenControl: false, clickableIcons: false, gestureHandling: "greedy",
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
    }).catch((e) => setStatus(e.message));
  }, []);

  useEffect(() => {
    const map = mapRef.current; if (!map || !areas.length) return;
    map.data.forEach((feature: any) => map.data.remove(feature));
    labelsRef.current.forEach((label) => label.setMap(null)); labelsRef.current = [];
    map.data.addGeoJson({ type: "FeatureCollection", features: areas.map((area) => ({ type: "Feature", id: String(area.id), geometry: area.geom, properties: { ...area, geom: undefined } })) });
    map.data.setStyle((feature: any) => ({ fillColor: valueColor(Number(feature.getProperty(metric) ?? 0), maxValue), fillOpacity: fills ? 0.58 : 0, strokeColor: "#2d587c", strokeOpacity: 0.75, strokeWeight: 0.8 }));
    map.data.addListener("click", (event: any) => { const area = areas.find((item) => item.id === Number(event.feature.getId())) ?? null; setSelected(area); if (area) map.panTo(centerOf(area.geom)); });

    class AreaLabel extends window.google.maps.OverlayView {
      position: any; text: string; div?: HTMLDivElement;
      constructor(position: any, text: string) { super(); this.position = position; this.text = text; }
      onAdd() { this.div = document.createElement("div"); this.div.className = "area-label"; this.div.innerHTML = this.text; this.getPanes()?.overlayMouseTarget.appendChild(this.div); }
      draw() { const p = this.getProjection().fromLatLngToDivPixel(this.position); if (this.div && p) { this.div.style.left = `${p.x}px`; this.div.style.top = `${p.y}px`; } }
      onRemove() { this.div?.remove(); }
    }
    areas.filter((a) => a.address).forEach((area) => {
      const label = new AreaLabel(centerOf(area.geom), `<b>${area.town ?? area.code}</b><span>${metricLabels[metric]}</span><strong>${Number(area[metric] ?? 0).toLocaleString()}</strong>`);
      label.setMap(labels ? map : null); labelsRef.current.push(label);
    });
    const refresh = () => labelsRef.current.forEach((label) => label.div && (label.div.style.display = labels && map.getZoom() >= 12 ? "grid" : "none"));
    refresh(); map.addListener("zoom_changed", refresh);
  }, [areas, metric, maxValue, fills, labels]);

  function searchArea() {
    const value = query.trim(); if (!value) return;
    const area = areas.find((a) => `${a.address ?? ""}${a.town ?? ""}${a.code}`.includes(value));
    if (!area || !mapRef.current) { setStatus("該当する町丁目が見つかりません。"); return; }
    setSelected(area); mapRef.current.panTo(centerOf(area.geom)); mapRef.current.setZoom(14); setStatus(`${area.address ?? area.code}を表示`);
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">A</div><div><b>ArmBox</b><span>共同開発様向け 商圏分析</span></div></div><div className="top-stats"><span><MapPin size={16}/>{areas.length || "—"} 町丁目</span><span><UsersRound size={16}/>{matchedCount || "—"} データ対象</span></div></header>
    <section className="workspace">
      <aside className="sidebar"><div className="section-title"><Layers3 size={17}/>表示設定</div><label className="field-label">色分け項目</label>
        <Select value={metric} onValueChange={(value) => setMetric(value as Metric)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(metricLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <div className="toggle-row"><span>数値による色分け</span><Switch checked={fills} onCheckedChange={setFills}/></div><div className="toggle-row"><span>町丁目ラベル</span><Switch checked={labels} onCheckedChange={setLabels}/></div><div className="divider" />
        <label className="field-label">町丁目検索</label><div className="search-box"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchArea()} placeholder="例：桜区西堀"/><button onClick={searchArea} aria-label="検索"><Search size={17}/></button></div>
        <div className="legend"><div className="field-label">凡例：{metricLabels[metric]}</div><div className="legend-scale">{palette.map((color) => <i key={color} style={{background: color}} />)}</div><div className="legend-label"><span>少ない</span><span>多い</span></div></div><p className="status">{status}</p>
      </aside>
      <div className="map-wrap"><div ref={mapNode} className="map"/><div className="map-badge">さいたま市 町丁目分析</div></div>
      <aside className={`details ${selected ? "open" : ""}`}><div className="details-head"><div><span>町丁目詳細</span><b>{selected?.town ?? "地図から選択"}</b></div>{selected && <button onClick={() => setSelected(null)} aria-label="詳細を閉じる"><X size={18}/></button>}</div>
        {selected ? <><p className="address">{selected.address ?? "統計データなし"}</p><div className="detail-grid"><Stat label="世帯数 2025" value={selected.households_2025}/><Stat label="人口 2025" value={selected.population_2025}/><Stat label="店舗" value={selected.stores}/><Stat label="デリ" value={selected.delivery}/><Stat label="本部" value={selected.headquarters}/><Stat label="法人" value={selected.corporation}/></div><div className="total-card"><Building2 size={20}/><span>顧客合計<strong>{selected.total?.toLocaleString() ?? "—"}</strong></span></div><dl className="metadata"><div><dt>地域コード</dt><dd>{selected.code}</dd></div><div><dt>2023年人口</dt><dd>{selected.population_2023?.toLocaleString() ?? "—"}</dd></div></dl></> : <div className="empty-detail"><ChevronRight size={28}/><p>町丁目をクリックすると<br/>統計・顧客データを表示します</p></div>}
      </aside>
    </section>
  </main>;
}

function Stat({ label, value }: { label: string; value: number | null }) { return <div className="stat"><span>{label}</span><strong>{value?.toLocaleString() ?? "—"}</strong></div>; }
