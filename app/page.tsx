// app/page.tsx
import Link from 'next/link';
import { fetchPlays } from '@/src/lib/apiClient';

export default async function Home() {
  const plays = await fetchPlays();

  return (
    <main className="p-4 max-w-xl mx-auto space-y-4">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Golf Rounds</h1>
        <Link
          href="/plays/new"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
        >
          新規プレー
        </Link>
      </header>

      <ul className="space-y-2">
        {plays.map((p) => (
          <li key={p.play_id} className="border rounded p-3">
            <Link href={`/plays/${p.play_id}`}>
              <div className="font-semibold">{p.course_name}</div>
              <div className="text-sm text-gray-500">{p.played_at}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
