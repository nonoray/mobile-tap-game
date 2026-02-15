# Release Notes

## 2026-02-15 (JST)
- [Change] Invadersを削除し、Tetris単体起動に変更（ゲーム選択メニュー廃止）。
- [A11y] ポーズ/ゲームオーバーのモーダル表示中、Tabキーでフォーカスが背面UIに抜けないようにフォーカストラップを追加。
- [UI] Invaders中はタッチ操作の表示を「左右 + FIRE」中心に整理（不要ボタンを非表示、FIREを大きく）。
  - Commit: 45e651e
- [UX] プレイ中（非ポーズ時）に Screen Wake Lock を要求して、画面のスリープ/暗転をできるだけ防ぐ（対応ブラウザのみ）。
  - Commit: 814fb3e
