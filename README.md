# Space
宇宙に関係するアプリを作成する

## Docker での起動方法

1. `.env.example` を `.env` にコピーし、必要に応じて値を編集する

   ```
   cp .env.example .env
   ```

2. 起動

   ```
   docker compose up --build
   ```

3. アクセス先
   - フロントエンド: http://localhost:3000
   - バックエンドAPI: http://localhost:8080

停止する場合は `docker compose down`(DBデータも消す場合は `-v` を付ける)。
