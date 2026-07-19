const fastify = require("fastify")({
  logger: true,
  bodyLimit: 20 * 1024 * 1024 // 20MB
});

const fs = require("fs");
const path = require("path");

// Create uploads directory if missing
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Parse raw binary uploads
fastify.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer" },
  (req, body, done) => {
    done(null, body);
  }
);

// Health check
fastify.get("/", async () => {
  return {
    status: "online",
    service: "ESP32 Audio Upload Server"
  };
});

// Upload endpoint
fastify.post("/upload", async (request, reply) => {
  try {
    const audioBuffer = request.body;

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      return reply.code(400).send({
        success: false,
        error: "No audio received"
      });
    }

    const filename = `audio_${Date.now()}.pcm`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, audioBuffer);

    fastify.log.info(
      `Saved ${audioBuffer.length} bytes to ${filename}`
    );

    return {
      success: true,
      file: filename,
      bytes: audioBuffer.length,
      downloadUrl: `/download/${filename}`
    };

  } catch (err) {
    fastify.log.error(err);

    return reply.code(500).send({
      success: false,
      error: err.message
    });
  }
});

// Download endpoint
fastify.get("/download/:filename", async (request, reply) => {
  const filename = request.params.filename;
  const filepath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filepath)) {
    return reply.code(404).send({
      success: false,
      error: "File not found"
    });
  }

  reply.header(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  reply.type("application/octet-stream");

  return fs.createReadStream(filepath);
});

// List uploaded files
fastify.get("/files", async () => {
  const files = fs.readdirSync(uploadsDir);

  return {
    count: files.length,
    files
  };
});

const PORT = process.env.PORT || 10000;

fastify.listen({
  host: "0.0.0.0",
  port: PORT
}, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  fastify.log.info(
    `Server running on port ${PORT}`
  );
});

