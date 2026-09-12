-- Dashboard > Project Settings > API > Exposed schemas に kyoudou を追加してから実行します。
GRANT USAGE ON SCHEMA kyoudou TO anon, authenticated;
GRANT SELECT ON TABLE kyoudou.saitamasi_chouchoumoku TO anon, authenticated;
ALTER TABLE kyoudou.saitamasi_chouchoumoku ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read for kyoudou map" ON kyoudou.saitamasi_chouchoumoku;
CREATE POLICY "public read for kyoudou map" ON kyoudou.saitamasi_chouchoumoku FOR SELECT TO anon, authenticated USING (true);
