import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./getCurrentUser";

/** ページ表示用：未ログインは/loginへ、非管理者は/roundsへリダイレクトする */
export async function requireAdminForPage(): Promise<CurrentUser> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (currentUser.role !== "admin") redirect("/rounds");
  return currentUser;
}

/** Server Action用：未ログイン・非管理者はエラーをthrowする */
export async function requireAdminForAction(): Promise<CurrentUser> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("ログインが必要です");
  if (currentUser.role !== "admin") throw new Error("管理者権限が必要です");
  return currentUser;
}
