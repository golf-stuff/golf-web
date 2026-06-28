// app/plays/[playId]/page.tsx
import { fetchPlay, updateScores } from '@/src/lib/apiClient';
import ScoresEditor from './ScoresEditor';

type Props = { params: { playId: string } };

export default async function PlayDetailPage({ params }: Props) {
  const data = await fetchPlay(params.playId);

  return (
    <main className="p-4 max-w-xl mx-auto space-y-4">
      <section>
        <h1 className="text-xl font-bold mb-1">{data.play.course_name}</h1>
        <div className="text-sm text-gray-500">{data.play.played_at}</div>
      </section>

      <ScoresEditor playId={data.play.play_id} initialScores={data.scores} />
    </main>
  );
}
