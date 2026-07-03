import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/db/prisma";
import { getCurrentUser } from "@/src/lib/auth/getCurrentUser";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const golfCourses = await prisma.mstGolfCourse.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main>
      <nav>
        <Link href="/rounds">
          ラウンド履歴へ戻る
        </Link>
      </nav>

      <h1>ラウンド作成</h1>

      <form action={createRound}>
        <div>
          <label>
            日付
            <input type="date" name="playedAt" required />
          </label>
        </div>

        <div>
          <label>
            ゴルフ場
            <select name="golfCourseId" required>
              <option value="">選択してください</option>
              {golfCourses.map((gc: { id: string; name: string }) => (
                <option key={gc.id} value={gc.id}>
                  {gc.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit">次へ</button>
      </form>
    </main>
  );
}
