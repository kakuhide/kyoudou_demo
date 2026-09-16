import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const endpoint = process.env.VALHALLA_URL ?? "https://valhalla.lvr.zmsbox.com";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sources?: Array<{ lat: number; lon: number }>; targets?: Array<{ lat: number; lon: number }> };
    const locations = [...(body.sources ?? []), ...(body.targets ?? [])];
    if (!Array.isArray(body.sources) || !Array.isArray(body.targets) || !body.sources.length || !body.targets.length || body.sources.length > 10 || body.targets.length > 25 ||
      locations.some((point: { lat: number; lon: number }) => !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180)) {
      return NextResponse.json({ error: "距離計算の座標または件数が不正です。" }, { status: 400 });
    }
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/sources_to_targets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: body.sources, targets: body.targets, costing: "auto", units: "kilometers", verbose: false }),
      signal: AbortSignal.timeout(25000), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: `Valhalla API: HTTP ${response.status}` }, { status: 502 });
    const result = await response.json() as { distances?: unknown; units?: string };
    if (!Array.isArray(result.distances)) return NextResponse.json({ error: "Valhalla APIの距離データを取得できませんでした。" }, { status: 502 });
    return NextResponse.json({ distances: result.distances, units: result.units });
  } catch (error) {
    return NextResponse.json({ error: `経路計算に失敗しました: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
