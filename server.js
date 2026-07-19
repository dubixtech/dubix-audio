const fastify = require("fastify")({
  logger: true,
  bodyLimit: 20 * 1024 * 1024 // 20 MB
});

const fs = require("fs");
const path = require("path");

fastify.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer" },
  (req, body, done) => {
    done(null, body);
  }
);
fastify.get("/", async () => {
  return "Server is running";
});
fastify.post("/upload", async (request, reply) => {
  try {
    const audioBuffer = request.body;

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      return reply.code(400).send({
        error: "No audio received"
      });
    }

    const filename =
      `audio_${Date.now()}.pcm`;

    const filepath =
      path.join(__dirname, "uploads", filename);

    fs.mkdirSync(
      path.join(__dirname, "uploads"),
      { recursive: true }
    );

    fs.writeFileSync(filepath, audioBuffer);

    console.log(
      `Saved ${audioBuffer.length} bytes`
    );

    return {
      success: true,
      bytes: audioBuffer.length,
      file: filename
    };

  } catch (err) {
    console.error(err);

    return reply.code(500).send({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

fastify.listen({
  host: "0.0.0.0",
  port: PORT
});
