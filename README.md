# ArmBox Lab

ArmBoxの機能開発・検証サイトです。Google Maps上にSupabaseの町丁目ポリゴンと競合店舗を表示し、候補地点から0.5km・1.0km・2.0km商圏を作成します。

## Supabase

1. Dashboardの **Project Settings > API > Exposed schemas** に`kyoudou`を追加します。
2. SQL Editorで`supabase-setup.sql`を実行します。

利用テーブル：

- `kyoudou.saitamasi_chouchoumoku`
- `kyoudou.competitor_stores`

## ローカル起動

`.env.example`を`.env.local`へコピーし、3つの値を設定します。

```bash
npm install
npm run dev
```

## Vercel

GitHubへpushしてVercelへImportし、Environment Variablesに次を設定します。

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

追加後に再デプロイします。Google MapsキーにはWebサイト制限とMaps JavaScript API制限を設定してください。
