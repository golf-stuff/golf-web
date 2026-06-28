// app/plays/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPlay } from '@/src/lib/apiClient';

export default function NewPlayPage() {
  const router = useRouter();
  const [playedAt, setPlayedAt] = useState('');
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const play = await createPlay({
        played_at: playedAt,
        course_name: courseName,
      });
      router.push(`/plays/${play.play_id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-4 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">新規プレー</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm">日付</span>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="border rounded w-full p-2"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm">コース名</span>
          <input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            className="border rounded w-full p-2"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {loading ? '保存中…' : 'スコア入力へ'}
        </button>
      </form>
    </main>
  );
}
