// 사용자의 선택을 기록합니다. 개인을 식별하는 값은 아무것도 저장하지 않습니다.
// POST /api/vote
//   { matches: {영상ID: {w: 이긴횟수, p: 붙은횟수}}, champion: "영상ID", tiers: {영상ID: "S"} }

const { pipeline, isVideoId, configured } = require("./_redis");

const TIER_POINT = { S: 5, A: 4, B: 3, C: 2, D: 1 };

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if(req.method !== "POST"){
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "POST만 받습니다" }));
  }
  if(!configured){
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "저장소가 연결되지 않았습니다" }));
  }

  try{
    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const cmds = [];

    // 1대1 대결 결과 — 이건 게임이 끝날 때 한 번에 모아서 옵니다
    const matches = body.matches || {};
    const ids = Object.keys(matches).filter(isVideoId).slice(0, 40);
    for(const id of ids){
      const w = Math.min(40, Math.max(0, parseInt(matches[id].w, 10) || 0));
      const p = Math.min(40, Math.max(0, parseInt(matches[id].p, 10) || 0));
      if(p <= 0 || w > p) continue;                 // 앞뒤가 안 맞으면 버립니다
      if(w) cmds.push(["HINCRBY", "awjb:wins", id, w]);
      cmds.push(["HINCRBY", "awjb:plays", id, p]);
    }

    // 우승작
    if(isVideoId(body.champion)) cmds.push(["HINCRBY", "awjb:champs", body.champion, 1]);

    // 티어표 — 평균을 내기 위해 점수 합과 제출 수를 따로 셉니다
    const tiers = body.tiers || {};
    for(const id of Object.keys(tiers).filter(isVideoId).slice(0, 40)){
      const pt = TIER_POINT[tiers[id]];
      if(!pt) continue;
      cmds.push(["HINCRBY", "awjb:tsum", id, pt]);
      cmds.push(["HINCRBY", "awjb:tcnt", id, 1]);
    }

    if(!cmds.length){
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "기록할 내용이 없습니다" }));
    }
    if(body.champion || Object.keys(tiers).length) cmds.push(["INCR", "awjb:sessions"]);

    await pipeline(cmds);
    res.end(JSON.stringify({ ok: true, recorded: cmds.length }));
  }catch(err){
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
};
