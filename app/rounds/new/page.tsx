import Link from "next/link";
import { prisma } from "@/src/lib/db/prisma";
import { createRound } from "../actions";

export default async function NewRoundPage() {
  const golfCourses = await prisma.mstGolfCourse.findMany({
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
              {golfCourses.map(gc => (
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
