import { buildApp } from "./app.js";

const app = buildApp();

const start = async () => {
  const port = Number(process.env.PORT) || 3002;
  await app.listen({ port, host: "0.0.0.0" });
};

start();
