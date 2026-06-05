# mikawa-dx

八百屋向け 発注・店内注文・売上・カレンダー管理アプリ。LINE Bot から起動し、各画面で日次オペレーションを行う。

## 技術スタック

| 層 | 採用 |
|---|---|
| フレームワーク | Next.js 16（App Router / Turbopack） |
| DB ORM | Prisma 7 |
| DB | PostgreSQL（Render 外部 DB、`sslmode=verify-full`） |
| 認証 | LINE userId → JWT（HS256、12h 有効） |
| ホスティング | Vercel |
| LINE | Messaging API（Webhook + 署名検証） |

## アーキテクチャ

```
[ユーザー] ──メッセージ送信──▶ [LINE Platform]
                                    │
                                    ▼ Webhook (POST /api/line/webhook)
                          署名検証 (HMAC-SHA256, timingSafeEqual)
                                    │
                                    ▼ コマンド解釈
                          replyMessage で role 別の URL を返信
                                    │
                                    ▼ ユーザーが URL タップ
                          /page?lineUserId=U...（直アクセス）
                                    │
                                    ▼ useAuth フック
                          POST /api/line で JWT 取得
                          localStorage に保存・URL から lineUserId 除去
                                    │
                                    ▼ 通常画面遷移
                          以降は Bearer JWT で API 認証
```

## 役割体系（role）

| role | 用途 | アクセス可能なコマンド |
|---|---|---|
| `pending` | 申請受付済み・未承認 | （登録のみ） |
| `nishi` | 西店スタッフ | 発注 / 注文 / 売上 / カレンダー |
| `minami` | 南店スタッフ | 発注 / 注文 / 売上 / カレンダー |
| `hq1` | 本部・野菜担当 | hq / カレンダー |
| `hq2` | 本部・果物担当 | hq / カレンダー |
| `hq3` | 本部・餅乾物菓子担当 | hq / カレンダー |
| `all` | 全権限（オーナー） | 全コマンド |

兼任なし（1 ユーザー = 1 role）。`all` は店舗・カテゴリの両方を横断アクセスできる特権。

### role ↔ 商品カテゴリ（HQ）

| role | 担当カテゴリ |
|---|---|
| `hq1` | 野菜 |
| `hq2` | 果物 |
| `hq3` | 餅・乾物菓子類 |

## LINE コマンド一覧

| コマンド | 動作 |
|---|---|
| 「登録」 | DB に未登録なら LINE プロフィール（displayName/pictureUrl）を取得して `role='pending'` で作成。承認待ち通知。 |
| 「ログイン」/「メニュー」 | role の既定ページ URL を返信。`all` は `/boss` がデフォルト。 |
| 「発注」 | `/store/<branch>` URL。`all` は西・南の両方を返信。 |
| 「注文」 | `/order/<branch>` URL。`all` は両方。 |
| 「カレンダー」 | `/calendar` URL（全 role 共通）。 |
| 「売上」 | `/store/<branch>` URL（売上入力は発注ページ内に統合）。 |
| 「hq」 | `/hq?category=hqN` URL。`all` は `/hq`（全カテゴリ）。 |
| 「boss」 | `/boss` URL（`all` のみ）。 |
| 上記以外 | role に応じたコマンド一覧を返信。 |

## ページ構成

| URL | role | 役割 |
|---|---|---|
| `/store/[branch]` | `nishi` / `minami` / `all` | 発注入力 + 売上入力 |
| `/order/[branch]` | `nishi` / `minami` / `all` | 店内予約注文（来店・配達） |
| `/hq?category=hqN` | `hq1` / `hq2` / `hq3` / `all` | 各店発注の集計・確定・LINE コピー |
| `/calendar` | 全 role | 30 日分の店内予約注文を日別表示 |
| `/boss` | `all` | KPI ダッシュボード（円グラフ・売上集計） |
| `/boss/users` | `all` | ユーザー承認・role 付与・承認時 LINE 通知 |
| `/boss/products` | `all` | 商品マスタ管理（追加・編集・無効化） |
| `/boss/order-products` | `all` | 店内商品マスタ管理（曜日別販売対応） |
| `/boss/vendors` | `all` | 仕入先マスタ管理 |

`[branch]` は `nishi` / `minami` のみ受け付ける。role と branch の不一致は `/` にリダイレクト。

`/boss` 配下は共通ナビゲーション（[app/boss/_shared.tsx](app/boss/_shared.tsx)）で接続。`/boss` 以外の管理画面間も同じヘッダーから切替可能。

## API 構成

| エンドポイント | メソッド | 認可 |
|---|---|---|
| `/api/line` | POST | `lineUserId` を JWT に交換 |
| `/api/line/webhook` | POST | LINE 署名検証必須 |
| `/api/products` | GET | 認証 |
| `/api/order-products` | GET | 認証 |
| `/api/daily-orders` | GET / POST | `?branch=` 必須・role と branch の整合チェック |
| `/api/daily-orders/hq` | GET | `hq1`/`hq2`/`hq3`/`all`・`?category=hqN` |
| `/api/confirmed` | POST | `hq1`/`hq2`/`hq3`/`all`・自カテゴリのみ書込可 |
| `/api/sales` | GET / POST | GET 認証 / POST は `branch` 必須＋整合チェック |
| `/api/orders` | GET / POST | `?branch=` / body の `branch` 必須＋整合チェック |
| `/api/orders/[id]` | PATCH / DELETE | 注文の店舗とユーザー role の整合チェック |
| `/api/calendar` | GET | 認証・`?category=` 任意 |
| `/api/dashboard` | GET | `role='all'` のみ |
| `/api/boss/users` | GET / PATCH | `role='all'`・pending→活性化時に LINE push |
| `/api/boss/products` | GET / POST / PATCH / DELETE | `role='all'`・DELETE は `isActive=false` |
| `/api/boss/order-products` | GET / POST / PATCH / DELETE | `role='all'`・DELETE は `isActive=false` |
| `/api/boss/vendors` | GET / POST / PATCH / DELETE | `role='all'`・DELETE は物理削除（FK 参照時は 409） |

## DB スキーマ（Prisma）

主なモデル：

- `Store` — 店舗（`storeCode`: `nishi` / `minami` / `honbu`）
- `Vendor` — 仕入先
- `Product` — 商品（`category`: 野菜 / 果物 / 餅・乾物菓子類）
- `OrderProduct` — 店内予約注文用商品マスタ（弁当等）
- `User` — LINE 連携ユーザー（`role`, `lineUserId`, `displayName`, `pictureUrl`）
- `DailyOrder` — 店舗からの日次発注リクエスト
- `ConfirmedOrder` — 本部が確定した発注（仕入先送信用、各店数量 + 調整値）
- `InstoreOrder` — 店内予約注文（顧客情報、配達日時、領収書）
- `Sale` — 日次売上（売上 / 惣菜 / 餅 / 花 / 客数 / 出勤）

詳細は `prisma/schema.prisma` 参照。

## 環境変数

`.env`（ローカル）と Vercel の Environment Variables に同名で設定：

| キー | 用途 |
|---|---|
| `DATABASE_URL` | ランタイム用 Postgres 接続文字列。Supabase の **pooler (pgbouncer)** を使う（例: `...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`）。サーバーレスでのコネクション枯渇を防ぐため direct ではなく pooler を指定する。 |
| `DIRECT_URL` | Prisma migrate 用の **direct 接続**（Supabase の 5432、pgbouncer パラメータ無し）。pgbouncer 経由だと migrate が prepared statement で失敗するため direct を使う。未設定だと `prisma migrate` / `db push` は実行できない。 |
| `JWT_SECRET` | JWT 署名鍵。 |
| `LINE_CHANNEL_SECRET` | LINE Webhook 署名検証用。 |
| `LINE_CHANNEL_ACCESS_TOKEN` | replyMessage / プロフィール取得用。 |
| `NEXT_PUBLIC_API_URL` | webhook が返す URL の基底。本番では Vercel URL。 |
| `API_SECRET` | 予約（未使用）。 |

`.env` は `.gitignore` 済み。コミットしないこと。

## 開発

```bash
# 依存インストール
npm install

# Prisma クライアント生成
npx prisma generate

# DB スキーマ反映
npx prisma migrate dev

# 開発サーバー起動
npm run dev

# 別ポートで Prisma Studio
npx prisma studio
```

dev サーバー起動後、別端末（スマホ等）から LAN 経由でアクセスする場合は [next.config.ts](next.config.ts) の `allowedDevOrigins` にその端末の IP を追加する。

## マイグレーション運用

スキーマ変更は **必ずマイグレーションファイル経由**で行う。`prisma/migrations` に履歴をコミットし、本番は `prisma migrate deploy`（= `npm run migrate:deploy`）で適用する。**本番に対して `prisma migrate dev` は実行しない**（`migrate dev` はシャドウDBを作るためローカル開発専用）。

migrate 系は `DIRECT_URL`（Supabase の direct / 5432）を使う。`DIRECT_URL` が未設定だと実行できない。

### 既存DBのベースライン（初回のみ）

`prisma/migrations/0_init` は既存 DB（Supabase 移行済み）に合わせた初期マイグレーション。**既にスキーマが存在する DB** では適用せず、適用済みとして記録する：

```bash
# DIRECT_URL を対象 DB（Supabase direct/5432）に向けた状態で
npx prisma migrate resolve --applied 0_init
```

まっさらな DB に対しては通常どおり `npx prisma migrate deploy` で 0_init を流せる。

### 日常の変更

```bash
# ローカルでスキーマを変更したら（DIRECT_URL = ローカル or 開発用 DB）
npx prisma migrate dev --name <変更内容>
git add prisma/migrations && git commit   # 生成された SQL をコミット

# 本番反映
npm run migrate:deploy
```

## テスト用 URL

`<UID>` を Prisma Studio で確認した自分の `User.lineUserId` に置換して開く。`useAuth` が初回アクセスで JWT を取得 → localStorage に保存 → URL から `lineUserId=` を除去するので、2 回目以降は `?lineUserId=` 無しでも遷移可能。

ローカル開発: `http://localhost:3000` をベース URL に。LAN 経由: `http://192.168.x.x:3000`。本番: `https://<vercel-domain>` に置換。

| URL | 必要 role |
|---|---|
| `/store/nishi?lineUserId=<UID>` | `nishi` / `all` |
| `/store/minami?lineUserId=<UID>` | `minami` / `all` |
| `/order/nishi?lineUserId=<UID>` | `nishi` / `all` |
| `/order/minami?lineUserId=<UID>` | `minami` / `all` |
| `/hq?lineUserId=<UID>` | `hq1` / `hq2` / `hq3` / `all`（`all` は全カテゴリ、hq1〜3 は自カテゴリ） |
| `/hq?category=hq1&lineUserId=<UID>` | `all`（hq1 カテゴリ＝野菜を表示） |
| `/hq?category=hq2&lineUserId=<UID>` | `all`（hq2 カテゴリ＝果物を表示） |
| `/hq?category=hq3&lineUserId=<UID>` | `all`（hq3 カテゴリ＝餅・乾物菓子類を表示） |
| `/calendar?lineUserId=<UID>` | 全 6 role |
| `/boss?lineUserId=<UID>` | `all` |
| `/boss/users?lineUserId=<UID>` | `all` |
| `/boss/products?lineUserId=<UID>` | `all` |
| `/boss/order-products?lineUserId=<UID>` | `all` |
| `/boss/vendors?lineUserId=<UID>` | `all` |

- 初回認証後は `localStorage.token` / `localStorage.user` に JWT とユーザー情報が保存される。手動で再認証したい場合はブラウザのコンソールで `localStorage.clear()` を実行。
- 別 role を試す場合: Prisma Studio で `User.role` を書き換えてから `localStorage.clear()` → 再アクセス。
- ローカルと本番は同一ブラウザでも origin が違うため localStorage は独立（影響しない）。

## デプロイ

`master` への push で Vercel が自動デプロイ。

### LINE Developers 設定

- Webhook URL: `https://<vercel-domain>/api/line/webhook`
- 「Use webhook」を ON
- 「プロフィール情報取得」権限が必要（登録フローで使用）

### 動作確認手順

1. Vercel の環境変数を確認（特に `NEXT_PUBLIC_API_URL` が本番 URL になっていること）
2. LINE で Bot に「登録」と送信 → User が `role='pending'` で作成される
3. 管理者（`role='all'`）が `/boss/users` で承認・role 付与 → 本人に LINE 通知が届く
4. 本人が LINE で「メニュー」を送信 → 役割別 URL が返ってくる
5. URL をタップ → 認証 → 該当画面表示

最初の管理者（`role='all'`）は Prisma Studio で手動設定する必要がある（鶏卵問題回避）。以降は `/boss/users` から運用可能。

## 管理者運用フロー

### ユーザー承認
`/boss/users` で `pending` 一覧から role を選択して「保存」。承認時は `pushMessage` で本人に「承認されました。『メニュー』と送信してください」と通知。

### 商品追加
1. `/boss/vendors` で仕入先を登録（必要なら）
2. `/boss/products` で商品を追加（カテゴリ・単位・先週平均・仕入先を指定）
3. すぐに `/store/[branch]` の発注画面に反映される

### 店内商品（弁当等）
`/boss/order-products` でカテゴリ・価格・販売曜日（月〜日のチェック）・メモを管理。`/order/[branch]` の日付選択で曜日に合致する商品のみ表示される。

### 商品の運用停止
- 物理削除はせず「無効化」（`isActive=false`）。過去の発注/注文データは無傷で残る
- 仕入先のみ物理削除可（参照中の場合は 409 で防止）

## 主要な実装メモ

- **認証 URL**: webhook が `/page?lineUserId=U...` 形式で返信。`useAuth` フックが lineUserId を検出すると `/api/line` で JWT に交換し、URL から lineUserId を除去（他のクエリ `?category=` 等は保持）。
- **role × branch 認可**: API では `canAccessBranch(role, branch)` で `all` または完全一致のみ許可。ページ側でも不一致時は `/` にリダイレクト。
- **HQ カテゴリ認可**: hq1/hq2/hq3 は自カテゴリ以外への書込を拒否（`/api/confirmed`）。
- **LINE 通信**: [lib/line.ts](lib/line.ts) に `replyMessage` / `pushMessage` / `fetchLineProfile` を集約。webhook（reply）と承認時通知（push）で共有。
- **/boss 共通 UI**: [app/boss/_shared.tsx](app/boss/_shared.tsx) に `BossHeader` / `BossNav` / `Toast` / `useToast` / `inputStyle` を集約。アンダースコア接頭辞のためルートとして公開されない。
- **物理削除回避**: 商品・店内商品は `isActive=false` での非アクティブ化のみ。仕入先のみ物理削除可だが FK 参照時は 409。
- **ColorZilla 対応**: [app/layout.tsx](app/layout.tsx) で `<body>` に `suppressHydrationWarning`（拡張機能が属性注入する hydration mismatch を抑制）。
