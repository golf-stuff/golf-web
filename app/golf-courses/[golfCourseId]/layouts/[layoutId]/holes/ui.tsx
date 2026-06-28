"use client";

import { useMemo, useState } from "react";
import { parseGdoScorecardText, ParsedHole } from "@/src/lib/parsers/gdoScorecard";
import { saveHoles } from "@/app/golf-courses/actions";

type HoleRow = {
  holeNumber: number;
  par: number;
  yardRegular: number;
};

type Props = {
  golfCourseId: string;
  layoutId: string;
  holeCount: number;
  initialHoles: HoleRow[];
};

export default function HoleDefinitionClient({
  golfCourseId,
  layoutId,
  holeCount,
  initialHoles,
}: Props) {
  const [rawText, setRawText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [holes, setHoles] = useState<HoleRow[]>(initialHoles);

  const holesJson = useMemo(() => JSON.stringify(holes), [holes]);

  function onGeneratePreview() {
    const result = parseGdoScorecardText(rawText, holeCount);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    if (result.holes.length !== holeCount) {
      setMessage(`Hole数が不一致です（期待: ${holeCount} / 抽出: ${result.holes.length}）`);
      return;
    }

    setHoles(result.holes);
    setMessage("プレビューを生成しました。必要なら表を手修正して保存してください。");
  }

  function updateHole(index: number, patch: Partial<HoleRow>) {
    setHoles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  return (
    <section>
      <h2>GDO貼り付け</h2>

      <textarea
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        placeholder="GDOのスコアカード表（該当コースのブロック）をそのまま貼り付け"
        rows={10}
        style={{ width: "100%" }}
      />

      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={onGeneratePreview}>
          プレビュー生成
        </button>
      </div>

      {message && (
        <p style={{ marginTop: 8 }}>
          {message}
        </p>
      )}

      <h2 style={{ marginTop: 24 }}>プレビュー（編集可）</h2>

      <table>
        <thead>
          <tr>
            <th>Hole</th>
            <th>Par</th>
            <th>Regular Yard</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((h, index) => (
            <tr key={h.holeNumber}>
              <td>{h.holeNumber}</td>
              <td>
                <input
                  type="number"
                  value={h.par}
                  min={3}
                  max={6}
                  onChange={e => updateHole(index, { par: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={h.yardRegular}
                  min={0}
                  onChange={e => updateHole(index, { yardRegular: Number(e.target.value) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form action={saveHoles} style={{ marginTop: 16 }}>
        <input type="hidden" name="golfCourseId" value={golfCourseId} />
        <input type="hidden" name="layoutId" value={layoutId} />
        <input type="hidden" name="holesJson" value={holesJson} />

        <button type="submit">
          保存
        </button>
      </form>
    </section>
  );
}
