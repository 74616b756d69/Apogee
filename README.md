# Space

Space は、宇宙打ち上げ情報を見ながら、日々の予定・学習・リラックスの時間を一つの画面で管理できる、宇宙好き向けの Web アプリケーションです。

## まずはじめに

このアプリは、宇宙に関係する情報をまとめて確認できるようにした Web アプリケーションです。Docker で簡単に起動できる構成になっています。

## Docker での起動方法

1. `.env.example` を `.env` にコピーし、必要に応じて値を編集する

   ```bash
   cp .env.example .env
   ```

2. 起動

   ```bash
   docker compose up --build
   ```

3. アクセス先
   - フロントエンド: http://localhost:3000
   - バックエンドAPI: http://localhost:8080

停止する場合は `docker compose down`(DBデータも消す場合は `-v` を付ける)。

---


次のような体験を提供します。

- 直近の宇宙打ち上げをカウントダウン形式で確認できる
- 過去・予定の打ち上げを時系列で見ることができる
- 研究機関の一覧を検索して閲覧できる
- 打ち上げ統計を確認できる
- Apple Calendar と連携して、打ち上げ日や予定を確認・追加できる
- Apple リマインダーと連携して、タスクを確認・追加・完了できる
- ポモドーロタイマーで作業と休憩を管理できる

---

## 主な機能

### 1. 打ち上げ情報の確認
- Space Launch Now API から打ち上げ予定・過去の打ち上げを取得
- 主要な情報として、打ち上げ名、日時、場所、ロケット名、ミッション名、ライブ配信 URL を表示
- 画像はローカルキャッシュとして保存し、表示を安定化

### 2. 今日の画面
- 次の打ち上げを大きなヒーロー画面で表示
- 打ち上げまでの時間をカウントダウン
- その日の Apple Calendar イベントを表示
- タスク一覧を表示（今日 / 未完了 / 予定 / 完了で絞り込み）
- ポモドーロタイマーを表示

### 3. タスク機能
- Apple リマインダー (CalDAV VTODO) と双方向で連携
- タスクの追加・完了・削除に対応し、純正リマインダーアプリと同期する
- 期限、優先度（高・中・低）、リスト（色付き）を表示
- 時間ブロック（`DTSTART` + `DUE`）に対応。時刻を持つタスクは開始・終了時刻を表示する
- カレンダーと同じアカウント設定（アプリ専用パスワード）をそのまま使う

### 4. カレンダー機能
- 指定した日付のカレンダーイベントを表示
- Apple Calendar (CalDAV) へのイベント追加に対応
- 予定と打ち上げを同じ画面で確認できる

### 5. 研究機関一覧
- 研究機関・企業の一覧を表示
- 名称・略称で検索可能

### 6. 統計画面
- 打ち上げ予定数、過去実績数、成功率を表示
- ロケット別・打ち上げ拠点別・ミッションタイプ別の集計を表示

---

## 技術構成

### フロントエンド
- React
- Vite
- CSS ベースの UI

### バックエンド
- Java 17
- Spring Boot 3.2
- Spring Web / Spring Data JPA
- MySQL
- iCal4j / CalDAV 連携

### インフラストラクチャ
- Docker Compose
- MySQL コンテナ
- フロントエンド・バックエンド各コンテナ

---

## プロジェクト構成

```text
backend/      Spring Boot アプリケーション
frontend/     React + Vite フロントエンド
docker-compose.yml  Docker Compose 定義
```

---

## 使い方

### Docker で起動する

1. 必要に応じて環境変数を設定する
   - 例: `DB_PASSWORD`, `DB_NAME`, `APPLE_CALENDAR_USERNAME`, `APPLE_CALENDAR_PASSWORD`, `SPACE_API_BASE_URL`

2. 起動

```bash
docker compose up --build
```

3. アクセス
- フロントエンド: http://localhost:3000
- バックエンド API: http://localhost:8080

4. 停止

```bash
docker compose down
```

DB データも削除したい場合は次のコマンドを使用します。

```bash
docker compose down -v
```

### ローカル開発で起動する

#### バックエンド

```bash
cd backend
./mvnw spring-boot:run
```

#### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

MySQL は Docker Compose で起動するか、ローカルの MySQL に接続できるように設定してください。

---

## 環境変数

バックエンドでは以下の環境変数を利用できます。

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`
- `SPACE_API_BASE_URL`
- `APPLE_CALENDAR_USERNAME`
- `APPLE_CALENDAR_PASSWORD`

既定値は [backend/src/main/resources/application.properties](backend/src/main/resources/application.properties) に定義されています。

---

## API 一覧

### 打ち上げ情報
- `GET /api/launches/upcoming` : 今後の打ち上げ一覧
- `GET /api/launches/previous` : 過去の打ち上げ一覧
- `GET /api/launches/{id}/news` : 指定打ち上げに関連するニュース

### 研究機関
- `GET /api/agencies` : 研究機関一覧

### Apple Calendar
- `GET /api/calendar/today` : 今日のイベント一覧
- `GET /api/calendar/date?date=YYYY-MM-DD` : 指定日のイベント一覧
- `POST /api/calendar/event` : イベント追加

### タスク（Apple リマインダー）
- `GET /api/tasks?filter=open` : タスク一覧（`open` / `today` / `overdue` / `upcoming` / `completed` / `all`）
- `GET /api/tasks/lists` : リマインダーリスト一覧（名前・色）
- `POST /api/tasks` : タスク追加
- `PATCH /api/tasks/{rawUid}` : 部分更新（null は変更なし、空文字で解除）
- `DELETE /api/tasks/{rawUid}` : タスク削除

---

## 主要な実装ポイント

- 起動時および定期的に Space Launch Now API からデータ同期
- 取得した打ち上げデータを MySQL に保存
- 画像をローカルキャッシュ化して再利用
- Apple Calendar の CalDAV API と連携して予定を取得・追加
- React 側で複数ページの UI を切り替えながら、打ち上げ・予定・統計を統合表示

---

## 備考

- Apple Calendar 連携には iCloud アカウントのアプリ専用パスワードが必要です。
- Space Launch Now API のレート制限に配慮して、開発時は `SPACE_API_BASE_URL` を適切に設定することを推奨します。

---

## ライセンス

このプロジェクトは個人開発・学習用途を想定したサンプルアプリケーションです。
