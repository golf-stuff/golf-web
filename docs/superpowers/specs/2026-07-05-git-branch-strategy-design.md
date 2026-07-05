# Gitブランチ戦略の再設計

## 背景・課題

現状は細かい修正でも `feature/*` ブランチを切り、PRで直接 `main` にマージしている。`main` へのpushはGitHub Actions（`deploy.yml`）でVercel本番デプロイと本番DBマイグレーションを自動トリガーするため、小さな修正のたびに本番デプロイが発生してしまっている。

## 目的

`develop` ブランチを導入し、細かい変更を `develop` に集約してから、任意のタイミングでまとめて `main` にマージすることで本番デプロイの頻度を下げる。

## ブランチモデル

```
main        ← 本番ブランチ（Vercel本番デプロイ + 本番DBマイグレーションの起点）
  ↑ PR（手動・任意タイミング）
develop     ← 開発統合ブランチ（デプロイなし）
  ↑ PR（レビューは任意）
feature/*   ← 個々の作業ブランチ（developから作成）
```

- 新規作業は `develop` から `feature/*` を切って開発する
- `feature/*` → `develop` は引き続きPR経由でマージする（レビュー必須ではない）
- `develop` → `main` は変更が溜まった段階で開発者が任意のタイミングでPRを作成し、マージする
- `main` への直接pushは行わない（既存のCLAUDE.md方針を維持）

## デプロイ・CI

- `.github/workflows/deploy.yml` の変更は不要。現在も `on: push: branches: [main]` でのみトリガーされており、`develop` へのマージではVercelデプロイもDBマイグレーションも発生しない
- 今回のスコープでは `develop` 用のステージングDB・Vercel Preview環境は構築しない
  - Supabase Branching機能（プレビューブランチごとに検証用DBを自動発行する機能）はProプラン以上が必要かつbranchごとに追加課金が発生する
  - 現状Supabaseは Free プランであり、Pro化はGCPへの長期移行計画とセットで別途検討する
- `develop` 上の動作確認は各自ローカルの `supabase start` によるSupabaseエミュレータで行う（現状の開発フローと同じ）

## ドキュメント・skill更新

### CLAUDE.md（golf-web）
「Git」節（または新設の「ブランチ戦略」節）に以下を追記する：
- `feature/* → develop → main` のブランチフロー
- `develop` は検証用ブランチであり、デプロイもDBマイグレーションも発生しないこと
- `develop → main` のマージは開発者が任意のタイミングで判断すること
- 既存の「mainブランチへの直接commit, pushせず、featureブランチを切って対応する」という記述を、「作業は `develop` から `feature/*` を切って行い、`develop` を経由して `main` にマージする」という趣旨に更新する

### `.claude/skills/verify-pr-checklist/SKILL.md`
現状はPRの確認ポイントチェックリストをレビューする想定になっている。`develop` へのPRと `main` へのPRの両方で使える内容になっているかを確認し、必要であれば「マージ先ブランチによって本番影響の有無が異なる」旨の注意書きを追加する程度の軽微な更新に留める（大幅な再設計は行わない）。

## 対象外（今回はやらないこと）

- `develop` 用のステージングデプロイ環境・別DBの構築（Supabase Branching含む）
- CIによる自動lint/test実行の追加（現状 `deploy.yml` のみで、PR時のlint/test自動実行ワークフローは存在しない。今回はブランチ戦略の変更のみに集中し、CI強化は別タスクとする）
- 既存の `deploy.yml` トリガー条件の変更

## 成功基準

- `develop` ブランチが作成され、GitHub上のデフォルトブランチ設定等の運用ルールがCLAUDE.mdに明記されている
- 新規のfeature作業が `develop` を起点に行われるようになる
- `main` へのマージ頻度が下がり、本番デプロイが「まとめて・任意タイミング」で行われるようになる
- `verify-pr-checklist` skillが新しいフローと矛盾しない内容になっている
