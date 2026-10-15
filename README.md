# 今日の学習（最小版 v0.1.0）
計画 → 学習（一時停止あり）→ 振り返り → 記録。サーバー・ログイン・外部通信なし。記録はlocalStorage（キー `gakushu-shien:v1`）。

## ローカルで確認
このフォルダで `python3 -m http.server 8000` を実行し、ブラウザで http://localhost:8000/ を開く。

## 公開
GitHubにpush → Settings → Pages → Deploy from a branch → main → /(root) → Save。
`https://ユーザー名.github.io/リポジトリ名/` で開く（CSS・JSは相対パス）。

## ファイル
index.html / style.css / app.js / README.md

## 記録の項目
id, v(形式), appVersion, subject, task, firstStep, endCondition, startMode(planned|now), plannedStart, startedAt, endedAt, pauses[{from,to}], status, achievement, focus(1-5/null), trouble, nextTry。日時はISO形式(UTC)で保存し、画面では端末の時刻で表示。

## 確認状況
**まだ実機で確認していません。** 下の項目を自分たちで確認し、できたものに印をつけてください。
- [ ] 計画→開始→一時停止→再開→終了→振り返り→記録
- [ ] 一時停止中の時間が計測に入らない／日付をまたぐ学習
- [ ] 連打・別タブ・画面ロック・再読み込み
- [ ] 集中度を選ばず保存→CSVで空欄
- [ ] JSON書き出し→読み込み、壊れたJSON、同じID
- [ ] CSVの引用符・改行・`=1+1`
- [ ] スマホ幅・PC幅／サブディレクトリ公開

## 自分で変えられる所と再確認
- 文言・色：index.html / style.css（レイアウト崩れを確認）
- CSVの列：app.js の `COLS`（列名・単位、数式対策を確認）
- 保存キー・形式：`KEY` `FMT`（読み込み・既存データを確認）
- 時間計算：`measuredMs`（一時停止・日またぎを確認）
