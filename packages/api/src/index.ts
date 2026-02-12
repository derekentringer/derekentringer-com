import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/health", async () => {
  return { status: "ok" };
});

const start = async () => {
  const port = Number(process.env.PORT) || 3001;
  await fastify.listen({ port, host: "0.0.0.0" });
};

start();
