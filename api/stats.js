// 모두의 선택을 합쳐서 돌려줍니다. GET /api/stats
// 2분간 캐시하므로 사람이 몰려도 저장소 호출은 2분에 한 번뿐입니다.

const { pipeline, configured } = require("./_redis");

const num = v => parseInt(v, 10) || 0;
const TIER_LETTER = p => p >= 4.5 ? "S" : p >= 3.5 ? "A" : p >= 2.5 ? "B" : p >= 1.5 ? "C" : "D";

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");

  if(!configured){
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "저장소가 연결되지 않았습니다", items: [] }));
  }

  try{
    const [wins, plays, champs, tsum, tcnt, sessions] = await pipeline([
      ["HGETALL", "awjb:wins"], ["HGETALL", "awjb:plays"], ["HGETALL", "awjb:champs"],
      ["HGETALL", "awjb:tsum"], ["HGETALL", "awjb:tcnt"], ["GET", "awjb:sessions"]
    ]);

    // Upstash는 해시를 [필드, 값, 필드, 값...] 배열로 돌려줍니다
    const toObj = arr => {
      const o = {};
      if(Array.isArray(arr)) for(let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i+1];
      else if(arr && typeof arr === "object") Object.assign(o, arr);
      return o;
    };
    const W = toObj(wins), P = toObj(plays), C = toObj(champs), TS = toObj(tsum), TC = toObj(tcnt);

    const ids = [...new Set([...Object.keys(P), ...Object.keys(C), ...Object.keys(TC)])];
    const items = ids.map(id => {
      const p = num(P[id]), w = num(W[id]), tc = num(TC[id]);
      const avg = tc ? num(TS[id]) / tc : null;
      return {
        id,
        plays: p,
        wins: w,
        winRate: p ? Math.round(1000 * w / p) / 10 : null,   // 소수 한 자리
        champs: num(C[id]),
        tierAvg: avg === null ? null : Math.round(avg * 100) / 100,
        tierLetter: avg === null ? null : TIER_LETTER(avg),
        tierVotes: tc
      };
    });

    // 승률순, 표본이 같으면 대결 수가 많은 쪽이 위로
    items.sort((a, b) =>
      (b.winRate ?? -1) - (a.winRate ?? -1) || b.plays - a.plays);

    res.end(JSON.stringify({
      updatedAt: new Date().toISOString(),
      sessions: num(sessions),
      totalMatches: Math.round(items.reduce((s, i) => s + i.plays, 0) / 2),
      items
    }));
  }catch(err){
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err.message || err), items: [] }));
  }
};
