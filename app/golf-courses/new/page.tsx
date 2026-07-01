import Link from 'next/link'
import { createGolfCourse } from "../actions";

export default function NewGolfCoursePage() {
  return (
    <main className="p-6 max-w-lg mx-auto flex flex-col gap-4">
      <nav>
        <Link href="/golf-courses" className="nav-back">← ゴルフ場一覧</Link>
      </nav>
      <h1 className="page-heading">ゴルフ場を追加</h1>

      <form action={createGolfCourse} className="page-card flex flex-col gap-5">
        <div>
          <label className="field-label" htmlFor="name">ゴルフ場名</label>
          <input
            id="name"
            type="text"
            name="name"
            required
            placeholder="例：筑波ゴルフクラブ"
            className="input-underline"
          />
        </div>
        <div>
          <button type="submit" className="btn-primary">保存</button>
        </div>
      </form>
    </main>
  );
}
