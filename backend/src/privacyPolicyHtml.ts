export const privacyPolicyHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>プライバシーポリシー | ちゅーぶあぷり</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif; line-height: 1.7; max-width: 680px; margin: 0 auto; padding: 32px 20px 80px; color: #222; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.05rem; margin-top: 1.6em; border-left: 4px solid #007aff; padding-left: 8px; }
  p, li { font-size: 0.92rem; }
  .updated { color: #888; font-size: 0.85rem; margin-bottom: 1.5em; }
</style>
</head>
<body>
  <h1>プライバシーポリシー</h1>
  <p class="updated">運営者: Hasebeee Apps（個人開発）/ 最終更新日: 2026年11月3日</p>

  <p>本アプリ「ちゅーぶあぷり」における利用者情報の取り扱いは以下の通りです。</p>

  <h2>収集する情報</h2>
  <ul>
    <li>メールアドレス・表示名（ログイン用、Firebase Authentication）</li>
    <li>タスク名・締切・Zapの基準など、入力したタスク情報</li>
    <li>つながった相手（監視者・オーナー）のメールアドレス・表示名</li>
    <li>招待先メールアドレス、ギフトメッセージ</li>
    <li>プッシュ通知用のデバイストークン</li>
    <li>Pavlok連携時のアクセストークン（連携時に入力するパスワードは保存しません）</li>
    <li>「場所でZap」機能で登録した場所（名前・緯度経度・範囲）と、その場所に出入りした時刻（移動経路や現在地の履歴は保存しません）</li>
  </ul>

  <h2>利用目的</h2>
  <p>タスク管理・監視通知・Zap実行など、本アプリの機能を提供するために利用します。</p>

  <h2>第三者サービス</h2>
  <p>
    認証・プッシュ通知に <strong>Firebase</strong>（Google）と <strong>Apple Push Notification service</strong> を利用します。
    Zap実行のため、ユーザーが連携を選択した場合のみ <strong>Pavlok</strong> と連携します（いつでも解除可能）。
    これら以外の第三者へ情報を提供・販売することはありません。
  </p>

  <h2>データの削除</h2>
  <p>設定画面の「アカウントを削除」から、関連データを完全に削除できます（取り消し不可）。</p>

  <h2>その他</h2>
  <p>本アプリは13歳未満を対象としていません。本ポリシーは予告なく変更される場合があります。</p>

  <h2>お問い合わせ</h2>
  <p>hasebe.510.y@icloud.com</p>
</body>
</html>
`;
