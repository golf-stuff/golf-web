import { createGolfCourse } from "../actions";

export default function NewGolfCoursePage() {
  return (
    <main>
      <h1>ゴルフ場を追加</h1>

      <form action={createGolfCourse}>
        <div>
          <label>
            ゴルフ場名
            <input
              type="text"
              name="name"
              required
            />
          </label>
        </div>

        <button type="submit">保存</button>
      </form>
    </main>
  );
}
