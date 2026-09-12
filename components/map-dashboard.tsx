"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Layers3, MapPin, Search, UsersRound } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

declare global { interface Window { google: any; __kyoudouMapReady?: () => void } }

type Metric = "total" | "households_2025" | "population_2025" | "stores" | "delivery";
type CompetitorLabelStyle = "band" | "halo";
type Area = {
  id: number; code: string; address: string | null; municipality_town: string | null; town: string | null; town2: string | null;
  households_2025: number | null; population_2025: number | null; households_2023: number | null;
  population_2023: number | null; stores: number | null; delivery: number | null;
  headquarters: number | null; corporation: number | null; total: number | null;
  geom: { type: string; coordinates: unknown };
};
type Competitor = {
  store_code: string; store_name: string; address: string | null;
  sales_area_sqm: number | null; parking_spaces: number | null;
  open_hour: number | null; close_hour: number | null;
  longitude: number; latitude: number;
};

const metricLabels: Record<Metric, string> = {
  total: "顧客合計", households_2025: "世帯数 2025", population_2025: "人口 2025", stores: "店舗", delivery: "デリ",
};
const palette = ["#e8f3ff", "#b9d9ff", "#7bb6f2", "#3d8bd4", "#165b9e"];
const defaultCandidate = { lat: 35.841573965604184, lng: 139.64476945195932 };
const appVersion = "Ver.1.03";
const tradeAreaOrder = ["0.5km", "1.0km", "2.0km"] as const;

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

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (degree: number) => degree * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function tradeAreaName(distance: number) {
  if (distance <= 0.5) return "0.5km";
  if (distance <= 1) return "1.0km";
  if (distance <= 2) return "2.0km";
  return null;
}

export default function MapDashboard() {
  const mapNode = useRef<HTMLDivElement>(null); const mapRef = useRef<any>(null); const labelsRef = useRef<any[]>([]); const infoWindowRef = useRef<any>(null); const candidateMarkerRef = useRef<any>(null); const tradeAreaCirclesRef = useRef<any[]>([]); const competitorMarkersRef = useRef<any[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [metric, setMetric] = useState<Metric>("total"); const [labels, setLabels] = useState(true); const [fills, setFills] = useState(false);
  const [polygons, setPolygons] = useState(true); const [strokeWeight, setStrokeWeight] = useState(2);
  const [tradeAreas, setTradeAreas] = useState(true); const [competitorLabels, setCompetitorLabels] = useState(true);
  const [competitorLabelStyle, setCompetitorLabelStyle] = useState<CompetitorLabelStyle>("band");
  const [competitorLabelOffset, setCompetitorLabelOffset] = useState(2);
  const [candidateLabelOffset, setCandidateLabelOffset] = useState(2);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("データを読み込んでいます…");
  const [candidateLat, setCandidateLat] = useState(String(defaultCandidate.lat));
  const [candidateLng, setCandidateLng] = useState(String(defaultCandidate.lng));
  const [exporting, setExporting] = useState(false);
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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`${url}/rest/v1/competitor_stores?select=store_code,store_name,address,sales_area_sqm,parking_spaces,open_hour,close_hour,longitude,latitude`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "kyoudou" } })
      .then(async (res) => { if (!res.ok) throw new Error(await res.text()); return await res.json() as Competitor[]; })
      .then(setCompetitors)
      .catch((e) => setStatus(`競合店舗データ取得エラー：${e.message}`));
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !mapNode.current) { if (!key) setStatus("Google Maps APIキーを設定してください。"); return; }
    loadGoogleMaps(key).then(() => {
      if (!mapNode.current || mapRef.current) return;
      mapRef.current = new window.google.maps.Map(mapNode.current, {
        center: defaultCandidate, zoom: 14, mapTypeControl: false, streetViewControl: false,
        fullscreenControl: false, clickableIcons: false, gestureHandling: "greedy",
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      infoWindowRef.current = new window.google.maps.InfoWindow();
      candidateMarkerRef.current = new window.google.maps.Marker({
        map: mapRef.current, position: defaultCandidate, title: "候補地点", zIndex: 10000, optimized: false,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#f97316", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3, labelOrigin: new window.google.maps.Point(0, 2.1) },
        label: { text: "候補地点", color: "#7c2d12", fontSize: "12px", fontWeight: "800", className: "candidate-marker-label" },
      });
      tradeAreaCirclesRef.current = [
        { radius: 2000, color: "#ff4fa3", weight: 4, zIndex: 1 },
        { radius: 1000, color: "#ef1919", weight: 4, zIndex: 2 },
        { radius: 500, color: "#8b0000", weight: 4, zIndex: 3 },
      ].map((item) => {
        const circle = new window.google.maps.Circle({ map: mapRef.current, radius: item.radius, strokeColor: item.color, strokeOpacity: 1, strokeWeight: item.weight, fillColor: item.color, fillOpacity: 0, clickable: false, zIndex: item.zIndex });
        circle.bindTo("center", candidateMarkerRef.current, "position"); return circle;
      });
      setMapReady(true);
    }).catch((e) => setStatus(e.message));
  }, []);

  useEffect(() => { tradeAreaCirclesRef.current.forEach((circle) => circle.setMap(tradeAreas ? mapRef.current : null)); }, [tradeAreas, mapReady]);

  useEffect(() => {
    mapNode.current?.style.setProperty("--candidate-label-offset", `${candidateLabelOffset}px`);
  }, [candidateLabelOffset]);

  useEffect(() => {
    mapNode.current?.style.setProperty("--competitor-label-offset", `${competitorLabelOffset}px`);
  }, [competitorLabelOffset]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    competitorMarkersRef.current.forEach((marker) => marker.setMap(null)); competitorMarkersRef.current = [];
    competitors.forEach((store) => {
      const lat = Number(store.latitude); const lng = Number(store.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = new window.google.maps.Marker({
        map, position: { lat, lng }, title: store.store_name, zIndex: 800,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#ffeb00", fillOpacity: 1, strokeColor: "#806f00", strokeWeight: 1.5, labelOrigin: new window.google.maps.Point(0, 2.1) },
        label: competitorLabels ? { text: store.store_name, color: competitorLabelStyle === "band" ? "#111111" : "#075a9c", fontSize: "11px", fontWeight: "800", className: `competitor-marker-label ${competitorLabelStyle}` } : undefined,
      });
      marker.addListener("click", () => {
        if (!infoWindowRef.current) return;
        infoWindowRef.current.setContent(`<div class="map-info"><b>${store.store_name}</b><span>${store.address ?? ""}</span></div>`);
        infoWindowRef.current.open({ map, anchor: marker });
      });
      competitorMarkersRef.current.push(marker);
    });
  }, [competitors, competitorLabels, competitorLabelStyle, competitorLabelOffset, mapReady]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !areas.length) return;
    map.data.forEach((feature: any) => map.data.remove(feature));
    labelsRef.current.forEach((label) => label.setMap(null)); labelsRef.current = [];
    map.data.addGeoJson({ type: "FeatureCollection", features: areas.map((area) => ({ type: "Feature", id: String(area.id), geometry: area.geom, properties: { ...area, geom: undefined } })) });
    map.data.setStyle((feature: any) => ({ fillColor: valueColor(Number(feature.getProperty(metric) ?? 0), maxValue), fillOpacity: polygons && fills ? 0.58 : 0, strokeColor: "#000000", strokeOpacity: polygons ? 0.9 : 0, strokeWeight: polygons ? strokeWeight : 0 }));
    window.google.maps.event.clearListeners(map.data, "click");
    map.data.addListener("click", (event: any) => {
      const area = areas.find((item) => item.id === Number(event.feature.getId())) ?? null;
      if (!area || !infoWindowRef.current) return;
      infoWindowRef.current.setContent(`<div class="map-info"><b>${area.town2 ?? area.town ?? area.code}</b><span>${area.address ?? ""}</span><dl><div><dt>世帯数 2025</dt><dd>${area.households_2025?.toLocaleString() ?? "—"}</dd></div><div><dt>人口 2025</dt><dd>${area.population_2025?.toLocaleString() ?? "—"}</dd></div><div><dt>顧客合計</dt><dd>${area.total?.toLocaleString() ?? "—"}</dd></div></dl></div>`);
      infoWindowRef.current.setPosition(event.latLng);
      infoWindowRef.current.open({ map });
    });

    class AreaLabel extends window.google.maps.OverlayView {
      position: any; text: string; div?: HTMLDivElement;
      constructor(position: any, text: string) { super(); this.position = position; this.text = text; }
      onAdd() { this.div = document.createElement("div"); this.div.className = "area-label"; this.div.innerHTML = this.text; this.getPanes()?.overlayLayer.appendChild(this.div); }
      draw() { const p = this.getProjection().fromLatLngToDivPixel(this.position); if (this.div && p) { this.div.style.left = `${p.x}px`; this.div.style.top = `${p.y}px`; } }
      onRemove() { this.div?.remove(); }
    }
    areas.filter((a) => a.address).forEach((area) => {
      const label = new AreaLabel(centerOf(area.geom), `<b>${area.town2 ?? area.town ?? area.code}</b><strong>${Number(area.households_2025 ?? 0).toLocaleString()}</strong><strong>${Number(area.total ?? 0).toLocaleString()}</strong>`);
      label.setMap(labels ? map : null); labelsRef.current.push(label);
    });
    const refresh = () => labelsRef.current.forEach((label) => label.div && (label.div.style.display = labels && map.getZoom() >= 12 ? "grid" : "none"));
    refresh(); window.google.maps.event.clearListeners(map, "zoom_changed"); map.addListener("zoom_changed", refresh);
  }, [areas, metric, maxValue, fills, labels, polygons, strokeWeight]);

  function searchArea() {
    const value = query.trim(); if (!value) return;
    const area = areas.find((a) => `${a.address ?? ""}${a.town ?? ""}${a.town2 ?? ""}${a.code}`.includes(value));
    if (!area || !mapRef.current) { setStatus("該当する町丁目が見つかりません。"); return; }
    mapRef.current.panTo(centerOf(area.geom)); mapRef.current.setZoom(14); setStatus(`${area.address ?? area.code}を表示`);
  }

  function setCandidatePoint() {
    const lat = Number(candidateLat); const lng = Number(candidateLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setStatus("候補地点の緯度・経度を正しく入力してください。"); return;
    }
    if (!mapRef.current || !candidateMarkerRef.current) { setStatus("地図を読み込み中です。少し待ってからお試しください。"); return; }
    const position = { lat, lng };
    candidateMarkerRef.current.setPosition(position); mapRef.current.panTo(position); mapRef.current.setZoom(15);
    setStatus(`候補地点を ${lat}, ${lng} に設定しました。`);
  }

  async function exportExcelReport() {
    const lat = Number(candidateLat); const lng = Number(candidateLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !mapNode.current) {
      setStatus("候補地点または地図を確認してから出力してください。"); return;
    }
    setExporting(true); setStatus("Excelレポートを作成しています…");
    try {
      const [{ Workbook }, { default: html2canvas }] = await Promise.all([import("exceljs"), import("html2canvas")]);
      const workbook = new Workbook();
      workbook.creator = "ArmBox Lab"; workbook.created = new Date();
      const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173E67" } } as const;
      const headerFont = { color: { argb: "FFFFFFFF" }, bold: true };
      const border = { top: { style: "thin", color: { argb: "FF9AA9B5" } }, left: { style: "thin", color: { argb: "FF9AA9B5" } }, bottom: { style: "thin", color: { argb: "FF9AA9B5" } }, right: { style: "thin", color: { argb: "FF9AA9B5" } } } as const;

      const mapSheet = workbook.addWorksheet("Map", { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
      mapSheet.columns = Array.from({ length: 14 }, () => ({ width: 11 }));
      mapSheet.mergeCells("A1:N1"); mapSheet.getCell("A1").value = "候補地点 商圏レポート";
      mapSheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FF173E67" } }; mapSheet.getCell("A1").alignment = { horizontal: "center" };
      mapSheet.mergeCells("A2:G2"); mapSheet.getCell("A2").value = `候補地点：${lat}, ${lng}`;
      mapSheet.mergeCells("H2:N2"); mapSheet.getCell("H2").value = `出力日時：${new Date().toLocaleString("ja-JP")}`; mapSheet.getCell("H2").alignment = { horizontal: "right" };
      const canvas = await html2canvas(mapNode.current, { useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: false, scale: 1 });
      const mapImage = workbook.addImage({ base64: canvas.toDataURL("image/png"), extension: "png" });
      mapSheet.addImage(mapImage, { tl: { col: 0, row: 3 }, ext: { width: 1080, height: 650 } });
      mapSheet.pageSetup.printArea = "A1:N38";

      const dataSheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
      dataSheet.autoFilter = "A1:N1";
      const dataHeaders = ["商圏", "中心からの距離(km)", "住所コード", "住所", "町丁目", "世帯数2025", "人口2025", "世帯数2023", "人口2023", "店舗", "デリ", "本部", "法人", "顧客合計"];
      dataSheet.addRow(dataHeaders);
      const center = { lat, lng };
      const areaRows = areas.map((area) => {
        const distance = distanceKm(center, centerOf(area.geom)); return { area, distance, band: tradeAreaName(distance) };
      }).filter((item) => item.band).sort((a, b) => tradeAreaOrder.indexOf(a.band as typeof tradeAreaOrder[number]) - tradeAreaOrder.indexOf(b.band as typeof tradeAreaOrder[number]) || a.distance - b.distance);
      areaRows.forEach(({ area, distance, band }) => dataSheet.addRow([band, Number(distance.toFixed(3)), area.code, area.address, area.town2 ?? area.town, area.households_2025, area.population_2025, area.households_2023, area.population_2023, area.stores, area.delivery, area.headquarters, area.corporation, area.total]));
      dataSheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = border; });
      dataSheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.eachCell((cell) => { cell.border = border; }); });
      dataSheet.columns.forEach((column, index) => { column.width = [10, 18, 15, 28, 18, 13, 13, 13, 13, 10, 10, 10, 10, 12][index]; });

      const competitorSheet = workbook.addWorksheet("競合店", { views: [{ state: "frozen", ySplit: 1 }] });
      competitorSheet.autoFilter = "A1:J1";
      competitorSheet.addRow(["商圏", "中心からの距離(km)", "店舗コード", "店舗名", "住所", "売場面積(㎡)", "駐車場台数", "開店時間", "閉店時間", "緯度経度"]);
      competitors.map((store) => {
        const distance = distanceKm(center, { lat: Number(store.latitude), lng: Number(store.longitude) });
        return { store, distance, band: tradeAreaName(distance) };
      }).filter((item) => item.band).sort((a, b) => tradeAreaOrder.indexOf(a.band as typeof tradeAreaOrder[number]) - tradeAreaOrder.indexOf(b.band as typeof tradeAreaOrder[number]) || a.distance - b.distance)
        .forEach(({ store, distance, band }) => competitorSheet.addRow([band, Number(distance.toFixed(3)), store.store_code, store.store_name, store.address, store.sales_area_sqm, store.parking_spaces, store.open_hour, store.close_hour, `${store.latitude}, ${store.longitude}`]));
      competitorSheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.border = border; });
      competitorSheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.eachCell((cell) => { cell.border = border; }); });
      competitorSheet.columns.forEach((column, index) => { column.width = [10, 18, 15, 32, 34, 15, 14, 12, 12, 26][index]; });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const downloadUrl = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = downloadUrl; anchor.download = `ArmBox_商圏レポート_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(downloadUrl);
      setStatus(`Excelレポートを出力しました（町丁目${areaRows.length}件）`);
    } catch (error) {
      setStatus(`Excel出力エラー：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">A</div><div><b>ArmBox Lab</b><span>機能開発・検証サイト</span></div></div><div className="top-stats"><span><MapPin size={16}/>{areas.length || "—"} 町丁目</span><span><UsersRound size={16}/>{matchedCount || "—"} データ対象</span></div></header>
    <section className="workspace">
      <aside className="sidebar"><div className="section-title"><Layers3 size={17}/>表示設定</div>
        <div className="candidate-panel"><div className="candidate-title"><MapPin size={15}/>候補地点</div><div className="coordinate-grid">
          <label><span>緯度</span><input inputMode="decimal" value={candidateLat} onChange={(e) => setCandidateLat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setCandidatePoint()}/></label>
          <label><span>経度</span><input inputMode="decimal" value={candidateLng} onChange={(e) => setCandidateLng(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setCandidatePoint()}/></label>
        </div><button type="button" className="candidate-button" onClick={setCandidatePoint}><MapPin size={15}/>地図に設定</button>
          <div className="label-offset-control"><div><span>ラベル間隔</span><b>{candidateLabelOffset}px</b></div><Slider value={[candidateLabelOffset]} min={0} max={14} step={1} onValueChange={(value) => setCandidateLabelOffset(value[0] ?? 2)}/></div>
        </div>
        <div className="toggle-row"><span>商圏（0.5・1・2km）</span><Switch checked={tradeAreas} onCheckedChange={setTradeAreas}/></div>
        <div className="trade-area-key"><span><i className="range-500"/>0.5km</span><span><i className="range-1000"/>1.0km</span><span><i className="range-2000"/>2.0km</span></div>
        <div className="toggle-row"><span>競合店舗名</span><Switch checked={competitorLabels} onCheckedChange={setCompetitorLabels}/></div>
        <label className="compact-label">競合ラベル表示</label>
        <select className="native-select" value={competitorLabelStyle} onChange={(event) => setCompetitorLabelStyle(event.target.value as CompetitorLabelStyle)}><option value="band">緑帯・黒文字</option><option value="halo">青文字・白ハロー</option></select>
        <div className="label-offset-control competitor-offset"><div><span>ラベル間隔</span><b>{competitorLabelOffset}px</b></div><Slider value={[competitorLabelOffset]} min={0} max={14} step={1} onValueChange={(value) => setCompetitorLabelOffset(value[0] ?? 2)}/></div>
        <div className="competitor-key"><i/>競合店舗 {competitors.length}店</div><div className="divider" />
        <label className="field-label">色分け項目</label>
        <select className="native-select" value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <div className="toggle-row"><span>数値による色分け</span><Switch checked={fills} onCheckedChange={setFills}/></div>
        <div className="toggle-row"><span>町丁目ポリゴン</span><Switch checked={polygons} onCheckedChange={setPolygons}/></div>
        <div className={`stroke-control ${polygons ? "" : "disabled"}`}><div><span>境界線の太さ</span><b>{strokeWeight}px</b></div><Slider value={[strokeWeight]} min={1} max={6} step={0.5} onValueChange={(value) => setStrokeWeight(value[0] ?? 2)} disabled={!polygons}/></div>
        <div className="toggle-row"><span>町丁目ラベル</span><Switch checked={labels} onCheckedChange={setLabels}/></div><div className="divider" />
        <label className="field-label">町丁目検索</label><div className="search-box"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchArea()} placeholder="例：桜区西堀"/><button onClick={searchArea} aria-label="検索"><Search size={17}/></button></div>
        <button type="button" className="excel-button" onClick={exportExcelReport} disabled={exporting}><FileSpreadsheet size={17}/>{exporting ? "作成中…" : "Excelレポート出力"}</button>
        <div className="legend"><div className="field-label">凡例：{metricLabels[metric]}</div><div className="legend-scale">{palette.map((color) => <i key={color} style={{background: color}} />)}</div><div className="legend-label"><span>少ない</span><span>多い</span></div></div><p className="status">{status}</p><div className="version-info">{appVersion}</div>
      </aside>
      <div className="map-wrap"><div ref={mapNode} className="map"/></div>
    </section>
  </main>;
}
