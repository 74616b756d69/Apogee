<!-- tech-stack-badges -->
![Java](https://img.shields.io/badge/Java-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

# Space

宇宙打ち上げ情報を眺めながら、予定・タスク・集中時間を一つの画面で管理する、宇宙好きのための Web アプリケーションです。
Apple Calendar / リマインダーと CalDAV で双方向に連携し、打ち上げカウントダウン・カレンダー・タスク・ポモドーロ・週次レビュー・予約リンクをまとめて扱えます。

## 目次

- [クイックスタート](#クイックスタート)
- [主な機能](#主な機能)
- [技術構成](#技術構成)
- [プロジェクト構成](#プロジェクト構成)
- [ローカル開発](#ローカル開発)
- [環境変数](#環境変数)
- [API 一覧](#api-一覧)
- [実装のポイント](#実装のポイント)
- [備考](#備考)
- [ライセンス](#ライセンス)

---

## クイックスタート

必要なもの: Docker / Docker Compose

```bash
# 1. 環境変数を用意する
cp .env.example .env   # 必要に応じて値を編集

# 2. 起動する
docker compose up --build
```

| 用途 | URL |
| --- | --- |
| フロントエンド | http://localhost:3000 |
| バックエンド API | http://localhost:8080 |

停止は `docker compose down`。DB のデータごと削除する場合は `docker compose down -v` を使います。

---

## 主な機能

### 打ち上げ情報
- Space Launch Now (The Space Devs) API から今後・過去の打ち上げを取得
- 打ち上げ名 / 日時 / 場所 / ロケット名 / ミッション名 / ライブ配信 URL を表示
- 打ち上げ時刻を過ぎたものは自動的に「過去の打ち上げ」へ移動
- 画像はサーバー側でローカルキャッシュし、表示を安定化

### 今日の画面
- 次の打ち上げをヒーロー表示し、打ち上げまでをカウントダウン
- その日の Apple Calendar イベントを一覧表示
- タスク一覧（今日 / 未完了 / 予定 / 完了で絞り込み）
- ポモドーロタイマーで作業と休憩を管理

### タスク（Apple リマインダー連携）
- CalDAV VTODO を介して純正リマインダーアプリと双方向同期
- 追加・部分更新・完了・削除に対応
- 期限、優先度（高 / 中 / 低）、リスト（色付き）を表示
- 時間ブロック（`DTSTART` + `DUE`）に対応し、時刻を持つタスクは開始・終了時刻を表示

### カレンダー
- 日 / 週 / 月ビューでイベントを表示（FullCalendar）
- Apple Calendar (CalDAV) へのイベント追加・削除
- 外部（他端末）での変更を取り込むリフレッシュに対応
- 予定と打ち上げを同じ画面で確認できる

### 週次レビュー
- 直近 1 週間の予定を集計し、合計時間を表示
- カレンダー別 / 曜日別の時間と件数を可視化

### 予約リンク
- 公開用の予約リンクを作成・一覧・削除
- 空き時間ルールをもとに予約可能なスロットを算出
- 訪問者は公開ページからスロットを選んで予約を確定できる

### 研究機関一覧
- 研究機関・企業の一覧表示と、名称・略称での検索

### 統計
- 打ち上げ予定数・過去実績数・成功率
- ロケット別 / 打ち上げ拠点別 / ミッションタイプ別の集計

---

## 技術構成

| レイヤー | 採用技術 |
| --- | --- |
| フロントエンド | React 18, Vite 5, Tailwind CSS 4, Zustand, FullCalendar |
| バックエンド | Java 17, Spring Boot 3.2, Spring Web, Spring Data JPA, Lombok, iCal4j (CalDAV) |
| データベース | MySQL 8.0 |
| インフラ | Docker Compose（frontend / backend / db の 3 コンテナ） |

---

## プロジェクト構成

```text
.
├── backend/            Spring Boot アプリケーション
│   └── src/main/java/com/space/
│       ├── controller/ REST API エンドポイント
│       ├── service/    打ち上げ同期・CalDAV 連携などのロジック
│       ├── dto/        API 入出力モデル
│       └── model/      JPA エンティティ
├── frontend/           React + Vite フロントエンド
│   └── src/
│       ├── api/        バックエンド API クライアント
│       ├── components/ 画面・UI コンポーネント
│       └── store/      Zustand ストア
├── docker-compose.yml  Docker Compose 定義
└── .env.example        環境変数のテンプレート
```

---

## ローカル開発

### バックエンド

```bash
cd backend
./mvnw spring-boot:run
```

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

MySQL は `docker compose up db` で起動するか、ローカルの MySQL へ接続できるよう環境変数を設定してください。

---

## 環境変数

`.env`（Docker Compose が読み込む）で設定します。

| 変数 | 説明 | 既定値 |
| --- | --- | --- |
| `DB_HOST` | DB ホスト名 | `db`（Compose 内） |
| `DB_PORT` | DB ポート | `3306` |
| `DB_NAME` | データベース名 | `spacedb` |
| `DB_USERNAME` | DB ユーザー | `root` |
| `DB_PASSWORD` | DB パスワード | `your_password` |
| `SPACE_API_BASE_URL` | 打ち上げ情報 API のベース URL | `https://ll.thespacedevs.com/2.2.0` |
| `APPLE_CALENDAR_USERNAME` | iCloud の Apple ID | （空） |
| `APPLE_CALENDAR_PASSWORD` | iCloud のアプリ専用パスワード | （空） |

既定値は [backend/src/main/resources/application.properties](backend/src/main/resources/application.properties) に定義されています。

---

## API 一覧

### 打ち上げ情報
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/launches/upcoming` | 今後の打ち上げ一覧 |
| GET | `/api/launches/previous` | 過去の打ち上げ一覧 |
| GET | `/api/launches/{id}/news` | 指定打ち上げの関連ニュース |

### 研究機関
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/agencies` | 研究機関一覧 |

### カレンダー（Apple Calendar）
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/calendar/events` | イベント取得（リフレッシュ対応） |
| GET | `/api/calendar/today` | 今日のイベント |
| GET | `/api/calendar/date?date=YYYY-MM-DD` | 指定日のイベント |
| GET | `/api/calendar/week` | 週のイベント |
| GET | `/api/calendar/month` | 月のイベント |
| GET | `/api/calendar/collections` | カレンダー一覧 |
| POST | `/api/calendar/event` | イベント追加 |
| DELETE | `/api/calendar/event/{uid}` | イベント削除 |

### タスク（Apple リマインダー）
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/tasks?filter=open` | タスク一覧（`open` / `today` / `overdue` / `upcoming` / `completed` / `all`） |
| GET | `/api/tasks/lists` | リマインダーリスト一覧（名前・色） |
| POST | `/api/tasks` | タスク追加 |
| PATCH | `/api/tasks/{rawUid}` | 部分更新（`null` は変更なし、空文字で解除） |
| DELETE | `/api/tasks/{rawUid}` | タスク削除 |

### 週次レビュー・空き時間
| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/review/weekly` | 週次レビュー集計 |
| GET | `/api/availability` | 空き時間ルールの取得 |

### 予約リンク
| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/booking-links` | 予約リンク作成 |
| GET | `/api/booking-links` | 予約リンク一覧 |
| GET | `/api/booking-links/{uuid}` | 予約リンク詳細 |
| DELETE | `/api/booking-links/{uuid}` | 予約リンク削除 |
| GET | `/api/public/bookings/{uuid}` | 公開ページ用の予約リンク情報 |
| GET | `/api/public/bookings/{uuid}/slots` | 予約可能スロット一覧 |
| POST | `/api/public/bookings/{uuid}/confirm` | 予約の確定 |

---

## 実装のポイント

- 起動時および定期的に Space Launch Now API と同期し、結果を MySQL に保存
- 打ち上げ画像をローカルキャッシュ化して外部リクエストを削減
- CalDAV（iCal4j）でカレンダー・リマインダーを双方向連携。外部での変更もリフレッシュで取り込む
- カレンダー取得失敗時は専用の例外として扱い、UI 側でエラー状態を切り分け
- React 側では Zustand で状態を共有し、打ち上げ・予定・タスク・統計を単一の画面体験に統合

---

## 備考

- Apple Calendar / リマインダー連携には、iCloud アカウントの**アプリ専用パスワード**が必要です。
- Space Launch Now API にはレート制限があります。開発時は `SPACE_API_BASE_URL` を適切に設定してください。
- `.env` に認証情報を含めるため、リポジトリにコミットしないよう注意してください。

---

## ライセンス

個人開発・学習用途を想定したサンプルアプリケーションです。
