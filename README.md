# 共同開発様向け ArmBox 商圏分析マップ

Google Maps上にSupabaseの`kyoudou.saitamasi_chouchoumoku`を表示するNext.jsアプリです。

## Supabase

1. Dashboardの **Project Settings > API > Exposed schemas** に`kyoudou`を追加します。
2. SQL Editorで`supabase-setup.sql`を実行します。

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
