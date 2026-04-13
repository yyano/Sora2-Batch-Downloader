# Sora2 Batch Downloader (exporter)

Sora（`sora.chatgpt.com`）の動画をまとめてダウンロード（エクスポート）するChrome拡張です。

- [2026/04/14] Sora2公式にてエクスポート機能が公開されました。動作も速くまとめてzip化されているため高速にダウンロード（エクスポート）できます。
[How can I access and export content I created in Sora?
](https://help.openai.com/ja-jp/articles/20001152-what-to-know-about-the-sora-discontinuation#how-can-i-access-and-export-content-i-created-in-sora)

## 主な機能
- `/profile` と `/drafts` の一覧ページでワンクリック有効化
- 動画(詳細)ページ（`/p/s_...` / `/d/gen_...`）に入ると自動で連続DL
- 付随ファイルの自動保存（JSONメタデータ、字幕 `.srt` / `.vtt`、GIF、プロンプト、レート制限時リンク）
- DL済み判定とリセット（一覧ページで「DL情報 初期化」）

## 使い方
1. `https://sora.chatgpt.com/` を開く
2. `/profile` または `/drafts` に移動
3. 右下のパネルで「有効にする」を押す
4. `/p/s_...` または `/d/gen_...` の動画(詳細)ページに入ると自動DLが開始されます

## インストール
1. このフォルダをローカルに保存。またはGithub リポジトリからcloneしてください
　- ローカルに保存する場合、Codeボタンの`Donwload ZIP`でダウンロード後 Zipファイルを展開してください
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」をON
4. 「パッケージ化されていない拡張機能を読み込む」から本フォルダを選択
5. 拡張機能が有効になっていることを確認。無効になっている場合、有効にしてください

## 保存先と命名規則
すべて ダウンロードフォルダの `sora2/` フォルダ配下に保存されます。

### Post（`/p/s_...`）
- 例: `sora2/<postId>/<timestamp>.mp4`
- 付随ファイル: `sora2/<postId>/<timestamp>.json` / `.srt` / `.vtt` / `.gif` / `-prompt.txt` / `-link.txt`

`<timestamp>` は投稿の `posted_at/created_at` やURLの `skt` などから生成されます。

### Draft（`/d/gen_...`）
- 例: `sora2/<postId>/<fileId>.mp4`
- 付随ファイル: `sora2/<postId>/<fileId>.json` / `.gif` / `-prompt.txt`

## 動作のポイント
- 動画URLが `blob:` の場合は直接DLできません。再生後に再試行してください。
- 連続DL中は一定時間後に自動で「↓」キーを送って次の動画に進みます（入力欄フォーカス中は送信しません）
- Chromeが動作する(画面に表示されている)状態でも動きます
- 拡張機能が動作・実行中のブラウザタブは手動操作は控えてください
- なんらかの都合・エラーなどで操作が止まってしまった場合は再度実行できます
- 再度実行時にダウンロード済みのファイルがDL情報にのこっていればダウンロードはスキップします
- 重複して再ダウンロードしても構わないときはダウンロード済み情報を初期化してください
- DraftのJSONはページ内通信から受動的に取得します。取得できない場合は追加ファイルが生成されないことがあります。


## 権限
- `downloads`: ファイル保存
- `storage`: 実行状態とDL済み一覧の保存
- `tabs`: ダウンロード開始通知用

## 開発メモ
- MV3（service worker）
- Content scriptでUI/抽出/自動遷移を制御



---

- 要望があればFAQや使い方の詳細を追記します。
- このChrome拡張はCodex(chatgpt)で生成されたものです。

