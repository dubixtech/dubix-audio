const fastify = require("fastify")({
  logger: true,
  bodyLimit: 20 * 1024 * 1024
});

const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

fastify.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer" },
  (req, body, done) => {
    done(null, body);
  }
);

fastify.get("/", async () => {
  return {
    status: "online"
  };
});

fastify.post("/upload", async (request, reply) => {
  try {
    const audioBuffer = request.body;

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      return reply.code(400).send({
        error: "No audio received"
      });
    }

    const filename = `audio_${Date.now()}.pcm`;
    const filepath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filepath, audioBuffer);

    return {
      success: true,
      file: filename,
      bytes: audioBuffer.length
    };
  } catch (err) {
    return reply.code(500).send({
      error: err.message
    });
  }
});

function createWavHeader(dataSize) {
  const sampleRate = 16000;
  const channels = 1;
  const bitsPerSample = 16;

  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);

  header.writeUInt32LE(
    sampleRate * channels * bitsPerSample / 8,
    28
  );

  header.writeUInt16LE(
    channels * bitsPerSample / 8,
    32
  );

  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

function serveAudio(index) {
  return async (request, reply) => {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => f.endsWith(".pcm"))
      .sort()
      .reverse();

    if (files.length < index) {
      return reply.code(404).send({
        error: "Audio not found"
      });
    }

    const file = files[index - 1];
    const filepath = path.join(UPLOAD_DIR, file);

    const pcmData = fs.readFileSync(filepath);
    const wavHeader = createWavHeader(pcmData.length);

    reply.type("audio/wav");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${file.replace(".pcm", ".wav")}"`
    );

    return Buffer.concat([
      wavHeader,
      pcmData
    ]);
  };
}

fastify.get("/audio1", serveAudio(1)); // newest
fastify.get("/audio2", serveAudio(2));
fastify.get("/audio3", serveAudio(3));
fastify.get("/audio4", serveAudio(4));
fastify.get("/audio5", serveAudio(5));

const PORT = process.env.PORT || 3000;

fastify.listen({
  host: "0.0.0.0",
  port: PORT
});
