---
paths:
  - .claude/skills/verify-pr-checklist/**
---

# ローカル/develop確認用テストユーザー

主に `webapp-testing` skill（プラグイン提供のため本リポジトリ内にパスを持たない）・`/verify-pr-checklist` skillでのE2E動作確認時に使用する想定。

ローカル開発環境およびdevelop動作確認用のSupabase Authテストユーザーは、以下の2パターンに統一する。これ以外のユーザーをMstUserに残さない。

## 一般ユーザー
- Email: `test-user@example.com`
- Password: `Password123!`
- Role: `user`

## 管理者ユーザー
- Email: `admin-user@example.com`
- Password: `AdminPassword123!`
- Role: `admin`

## 補足
- Supabase Authへの作成はローカルSupabase Studio（`http://127.0.0.1:54323`）の「Authentication」→「Users」、またはAdmin API（`POST /auth/v1/admin/users`、service role key使用）で行う。
- `MstUser.role`は`getCurrentUser()`によるログイン時の自動作成では常に`user`になるため、管理者ユーザーは作成後に手動で`role`を`admin`に更新する必要がある。
- 上記以外のテストユーザー・ダミーユーザーをローカルDBに作った場合は、確認作業が終わったら削除し、常にこの2パターンのみが`MstUser`に存在する状態を保つ。
