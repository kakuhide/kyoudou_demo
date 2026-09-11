-- Dashboard > Project Settings > API > Exposed schemas に kyoudou を追加してから実行します。
GRANT USAGE ON SCHEMA kyoudou TO anon, authenticated;
GRANT SELECT ON TABLE kyoudou.saitamasi_chouchoumoku TO anon, authenticated;
GRANT SELECT ON TABLE kyoudou.competitor_stores TO anon, authenticated;
ALTER TABLE kyoudou.saitamasi_chouchoumoku ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyoudou.competitor_stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read for kyoudou map" ON kyoudou.saitamasi_chouchoumoku;
CREATE POLICY "public read for kyoudou map" ON kyoudou.saitamasi_chouchoumoku FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read competitor stores" ON kyoudou.competitor_stores;
CREATE POLICY "public read competitor stores" ON kyoudou.competitor_stores FOR SELECT TO anon, authenticated USING (true);
NOTIFY pgrst, 'reload schema';
