// Redis Cloud(REDIS_URL) 연결 헬퍼.
// 서버리스 함수는 자주 깨어났다 잠들기 때문에, 연결을 만들어두고 재사용합니다.

const { createClient } = require("redis");

const URL_ = process.env.REDIS_URL || "";
const configured = Boolean(URL_);

let clientPromise = null;

function getClient(){
  if(!clientPromise){
    const client = createClient({
      url: URL_,
      socket: { connectTimeout: 5000, reconnectStrategy: retries => retries > 2 ? false : 200 }
    });
    // 오류가 나면 다음 호출 때 새 연결을 맺도록 초기화합니다
    client.on("error", () => { clientPromise = null; });
    clientPromise = client.connect().then(() => client).catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

// 여러 명령을 한 번에 실행합니다. 결과는 보낸 순서대로 돌아옵니다.
async function pipeline(commands){
  if(!configured) throw new Error("NOT_CONFIGURED");
  if(!commands.length) return [];
  const client = await getClient();
  const multi = client.multi();
  for(const cmd of commands) multi.addCommand(cmd.map(String));
  return await multi.exec();
}

// 유튜브 영상 ID 형식만 통과시킵니다. 엉뚱한 키가 쌓이는 걸 막습니다.
const isVideoId = s => typeof s === "string" && /^[A-Za-z0-9_-]{11}$/.test(s);

module.exports = { pipeline, isVideoId, configured };
