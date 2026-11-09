import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourses = await prisma.mstGolfCourse.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/rounds" className="nav-back">← ラウンド履歴</Link>
      </nav>
      <h1 className="page-heading">ラウンドを作成</h1>

      <form action={createRound} className="page-card flex flex-col gap-5">
        <div>
          <label className="field-label" htmlFor="playedAt">プレー日</label>
          <input
            id="playedAt"
            type="date"
            name="playedAt"
            required
            className="input-underline"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="golfCourseId">ゴルフ場</label>
          <select id="golfCourseId" name="golfCourseId" required className="select-underline">
            <option value="">選択してください</option>
            {golfCourses.map((gc: { id: string; name: string }) => (
              <option key={gc.id} value={gc.id}>{gc.name}</option>
            ))}
          </select>
        </div>
        <div>
          <button type="submit" className="btn-primary">次へ</button>
        </div>
      </form>
    </main>
  );
}
