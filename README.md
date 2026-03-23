# 歯科 SOAP カルテ AI — デプロイ手順書

## 必要なもの（すべて無料）

| サービス | 用途 |
|---|---|
| GitHub アカウント | コードの保管 |
| Vercel アカウント | アプリの公開 |
| Anthropic APIキー | SOAP生成 AI |
| OpenAI APIキー | 音声文字起こし（任意） |

---

## STEP 1｜GitHubにアップロード

1. https://github.com にアクセスしてアカウント作成
2. 右上の「+」→「New repository」をクリック
3. Repository name: `dental-soap-app`
4. 「Create repository」をクリック
5. 「uploading an existing file」をクリック
6. このフォルダ内のファイルをすべてドラッグ＆ドロップ
7. 「Commit changes」をクリック

---

## STEP 2｜Vercelにデプロイ

1. https://vercel.com にアクセス
2. 「Sign Up」→「Continue with GitHub」でGitHubアカウントと連携
3. 「Add New Project」をクリック
4. `dental-soap-app` リポジトリを選択して「Import」
5. Framework Preset: **Next.js** が自動選択されていることを確認
6. 「Deploy」をクリック（2〜3分で完了）
7. `https://dental-soap-app-xxxx.vercel.app` のようなURLが発行される

---

## STEP 3｜APIキーを設定（重要）

### Anthropic APIキーの取得
1. https://console.anthropic.com にアクセス・アカウント作成
2. 「API Keys」→「Create Key」
3. キーをコピー（`sk-ant-` で始まる文字列）

### OpenAI APIキーの取得（音声文字起こし用・任意）
1. https://platform.openai.com にアクセス・アカウント作成
2. 右上メニュー「API keys」→「Create new secret key」
3. キーをコピー（`sk-` で始まる文字列）

### Vercelに環境変数を設定
1. Vercel管理画面でプロジェクトを開く
2. 「Settings」タブ→「Environment Variables」
3. 以下を追加：

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-xxxxxxxx` |
| `OPENAI_API_KEY` | `sk-xxxxxxxx`（任意） |

4. 「Save」→「Deployments」タブ→「Redeploy」をクリック

---

## STEP 4｜iPhoneのホーム画面に追加

1. SafariでVercelのURLを開く
2. 画面下の「共有」ボタン（四角に矢印）をタップ
3. 「ホーム画面に追加」をタップ
4. 名前を「歯科カルテAI」に変更して「追加」

→ アプリとして起動できるようになります！

---

## よくある質問

**Q: 患者データはどこに保存されますか？**
A: このアプリはデータを外部サーバーに保存しません。カルテ履歴はブラウザのメモリ内のみで、ページを閉じると消えます。永続保存が必要な場合は別途データベース連携が必要です。

**Q: APIの利用料金は？**
A: Anthropic APIは従量課金です。1件のSOAP生成あたり約0.5〜1円程度の見込みです。OpenAI Whisperは1分の音声あたり約0.4円です。

**Q: セキュリティは大丈夫ですか？**
A: APIキーはVercelのサーバー環境変数に保存され、クライアント（ブラウザ）には一切公開されません。通信はHTTPS暗号化されています。
