import http from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3000;

// buffer to store received audio frames
let audioChunks = [];

// ---------- WAV HEADER FOR 8-BIT PCM ----------
function createWavHeader(dataLength, sampleRate = 8000, channels = 1, bits = 8) {
  const blockAlign = channels * bits / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);                    // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);   // ChunkSize
  buffer.write("WAVE", 8);                    // Format
  buffer.write("fmt ", 12);                   // Subchunk1ID
  buffer.writeUInt32LE(16, 16);               // Subchunk1Size
  buffer.writeUInt16LE(1, 20);                // AudioFormat (PCM)
  buffer.writeUInt16LE(channels, 22);         // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);       // SampleRate
  buffer.writeUInt32LE(byteRate, 28);         // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);       // BlockAlign
  buffer.writeUInt16LE(bits, 34);             // BitsPerSample
  buffer.write("data", 36);                   // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);       // Subchunk2Size

  return buffer;
}

// ---------- HTTP SERVER ----------
const server = http.createServer((req, res) => {
  if (req.url === "/audio") {
    if (audioChunks.length === 0) {
      res.writeHead(404);
      res.end("No audio recorded yet");
      return;
    }

    // Combine all 8-bit PCM chunks
    const pcm = Buffer.concat(audioChunks);

    // Create WAV header for 8-bit unsigned PCM
    const header = createWavHeader(pcm.length, 8000, 1, 8);

    const wav = Buffer.concat([header, pcm]);

    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Content-Length": wav.length,
    });

    res.end(wav);
    return;
  }

  if (req.url === "/clear") {
    audioChunks = [];
    res.end("Audio buffer cleared");
    return;
  }

  res.end("WSS Audio Server Running");
});

// ---------- WEBSOCKET ----------
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("ESP32 connected");

  // Auto-clear previous audio when a new client connects
  audioChunks = [];
  console.log("Audio buffer cleared for new connection");

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // Treat as 8-bit unsigned PCM
      audioChunks.push(Buffer.from(data));
      console.log("Received audio frame:", data.length, "bytes");
    } else {
      console.log("Text message:", data.toString());
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// ---------- START SERVER ----------
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
