import "dotenv/config";
import { createApp } from "./app.mjs";
const app = await createApp();
const port = Number(process.env.API_PORT || 8788);
app.listen(port, "127.0.0.1", () =>
  console.log(
    `MUSE 本地 API 代理：http://127.0.0.1:${port}（密钥仅保留在服务端）`,
  ),
);
