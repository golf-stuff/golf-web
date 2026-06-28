export function calcHoleMetrics(input: {
  stroke: number;
  par: number;
  putt?: number;
  shortgame?: number;
  penalty?: number;
}) {
  const putt = input.putt ?? 0;
  const shortgame = input.shortgame ?? 0;
  const penalty = input.penalty ?? 0;

  const diff = input.stroke - input.par;
  const approach = Math.max(shortgame - putt, 0);
  const longgame = input.stroke - shortgame;
  const longshot = Math.max(longgame - penalty, 0);

  const strokesBeforePutt = input.stroke - putt;

  const paron = strokesBeforePutt <= input.par - 2;
  const bogeyon = strokesBeforePutt <= input.par - 1;
  const doubleBogeyOn = strokesBeforePutt <= input.par;
  const doubleParOverOn = strokesBeforePutt <= input.par + 1;

  const scramble = !paron && input.stroke <= input.par;

  return {
    diff,
    approach,
    longgame,
    longshot,
    paron,
    bogeyon,
    doubleBogeyOn,
    doubleParOverOn,
    scramble,
  };
}
