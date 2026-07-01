"use client";

import { useMemo, useState } from "react";
import { parseGdoScorecardText } from "@/src/lib/parsers/gdoScorecard";
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
    setMessage("✓ プレビューを生成しました。必要なら表を手修正して保存してください。");
  }

  function handleReset() {
    setRawText("");
    setMessage(null);
    setHoles(initialHoles);
  }

  function updateHole(index: number, patch: Partial<HoleRow>) {
    setHoles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* GDO コピペ入力エリア */}
      <div className="page-card flex flex-col gap-4">
        <span className="page-subheading">GDOスコアカードから一括入力</span>
        <p className="text-xs text-gray-400">
          GDOサイトのスコアカード（Hole / Par / Yard 行）をコピーして貼り付けてください。
        </p>
        <textarea
          className="border border-gray-200 rounded-lg p-3 text-xs font-mono h-32 resize-none w-full"
          placeholder={'Hole\t1\t2\t...\nPar\t4\t3\t...\nYard\t350\t150\t...'}
          value={rawText}
          onChange={e => setRawText(e.target.value)}
        />
        {message && (
          <p className={`text-xs ${message.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onGeneratePreview} className="btn-primary text-xs px-3 py-1.5">
            パースして反映
          </button>
          <button type="button" onClick={handleReset} className="btn-secondary text-xs px-3 py-1.5">
            リセット
          </button>
        </div>
      </div>

      {/* ホール入力テーブル */}
      <div className="page-card overflow-x-auto">
        <form action={saveHoles}>
          <input type="hidden" name="golfCourseId" value={golfCourseId} />
          <input type="hidden" name="layoutId" value={layoutId} />
          <input type="hidden" name="holes" value={holesJson} />
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left text-xs text-gray-400 font-medium">Hole</th>
                <th className="py-2 px-3 text-right text-xs text-gray-400 font-medium">Par</th>
                <th className="py-2 px-3 text-right text-xs text-gray-400 font-medium">Yard</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((hole, i) => (
                <tr key={hole.holeNumber} className={i < holes.length - 1 ? 'border-b border-gray-100' : ''}>
                  <td className="py-2 px-3 text-gray-500 text-xs">{hole.holeNumber}</td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      className="input-underline text-right w-16"
                      value={hole.par}
                      onChange={e => updateHole(i, { par: Number(e.target.value) })}
                      min={3} max={5}
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="number"
                      className="input-underline text-right w-20"
                      value={hole.yardRegular}
                      onChange={e => updateHole(i, { yardRegular: Number(e.target.value) })}
                      min={0}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button type="submit" className="btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}
