# Release Notes

## 2026-02-15 (JST)
- [Feature] 練習用「速度固定（Speed Lock）」を追加（AUTO / Lv1 / Lv5 / Lv10 を切替）。Lキー or サイドのPRACTICEボタンで変更。設定は保存。
  - 上達ポイント: “この速度で回せる” を作ってから次の速度へ段階的に上げられる。
- [Change] Invadersを削除し、Tetris単体起動に変更（ゲーム選択メニュー廃止）。
  - Commit: 72ae104
- [A11y] ポーズ/ゲームオーバーのモーダル表示中、Tabキーでフォーカスが背面UIに抜けないようにフォーカストラップを追加。
- [UI] Invaders中はタッチ操作の表示を「左右 + FIRE」中心に整理（不要ボタンを非表示、FIREを大きく）。
  - Commit: 45e651e
- [UX] プレイ中（非ポーズ時）に Screen Wake Lock を要求して、画面のスリープ/暗転をできるだけ防ぐ（対応ブラウザのみ）。
  - Commit: 814fb3e
- [Refactor] 入力の「クリック抑止」用タイムスタンプ取得（performance.now / Date.now）を共通化し、ゲームループのdt計算をms単位に統一（挙動は維持）。
- [UI] [A11y] タッチ操作の入力フィードバックとして、対応端末では微小バイブ（haptics）を追加。押せたか不安での連打を減らす狙い。
- [Visual] ゴースト（着地点）を「塗り」から高コントラストの破線アウトラインに変更。置き済みブロックと混同しにくくして判断速度を上げる。
- [Visual] ブロックの輪郭に「暗い外枠 + 明るい内枠」を追加して、隣接ブロックの境界を一瞬で読みやすく（色の判別/段差認識を改善）。
- [Visual] 盤面に「交互行のごく薄いシェーディング」を追加して、段差/高さ（積み上がり）を瞬時に読みやすく。
- [Refactor] スコア/落下速度の「調整用定数」を局所的に集約（LINE_CLEAR_BASE / FALL_SPEED）。将来のチューニングで値が散らばってバグりにくく。
- [Refactor] ライン消去のスコア/SFX定数とローテーションのkick配列をトップレベル定数へ移動（毎回の再生成を避け、調整点を一点化）。挙動は維持。
- [UI] タップを取りこぼさないよう、プレイ画面の装飾レイヤー（.screen::after）を pointer-events:none に変更（Pauseボタン/キャンバスへの誤爆・無反応を減らす）。
- [UI] 入力誤爆（スクロール/ズーム系）を減らすため、プレイ画面（.screen）と操作バー（.controls）に touch-action:none を追加（対応ブラウザでデフォルトジェスチャーを抑止）。
- [UI] [A11y] さらに誤爆を減らすため、Pauseボタンと各操作ボタン（.ctl）にも touch-action:none を追加（ボタン上からのスワイプでページが動く/ズームする事故を抑止）。
- [Refactor] タッチ/マウス入力の「クリック抑止（touchstart/mousedown後のsynthetic click二重発火防止）」ロジックを makeClickSuppressor() に集約。挙動は維持しつつ、入力まわりの修正点を一点化。
- [UI] ポーズ/サウンド/Resume/Restart もタッチ用の bindTap() 経由に統一（touchstart優先 + synthetic click抑止 + haptics）。モバイルでの二重トグルや反応遅れによる誤爆を減らす。
