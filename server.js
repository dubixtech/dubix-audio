const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const MP3_FILE = path.join(__dirname, "song.mp3");

app.get("/", (req, res) => {
    res.send("<h1>ESP32 WebSocket Audio Streamer</h1><p>Connected to /ws/audio</p>");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws/audio" });

wss.on("connection", (ws) => {
    console.log("✅ ESP32 Connected");

    if (!fs.existsSync(MP3_FILE)) {
        ws.send("ERROR: song.mp3 not found");
        ws.close();
        return;
    }

    const streamLoop = () => {
        const stream = fs.createReadStream(MP3_FILE, { highWaterMark: 1024 });

        stream.on("data", (chunk) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
            } else {
                stream.destroy();
            }
        });

        stream.on("end", () => {
            console.log("Song finished - looping...");
            if (ws.readyState === WebSocket.OPEN) {
                setTimeout(streamLoop, 500); // Small delay before repeat
            }
        });
    };

    streamLoop();

    ws.on("close", () => console.log("❌ ESP32 Disconnected"));
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 WebSocket URL: ws://your-domain/ws/audio`);
});
