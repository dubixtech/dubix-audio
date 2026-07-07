const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const MP3_FILE = path.join(__dirname, "song.mp3");

app.get("/", (req, res) => {
    res.send("<h1>Dubix ESP32 Audio Streamer</h1><p>WebSocket: /audio</p>");
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server, 
    path: "/audio"        // ← Matches your ESP32 ws_path
});

wss.on("connection", (ws) => {
    console.log("✅ ESP32 Connected to /audio");

    if (!fs.existsSync(MP3_FILE)) {
        console.error("❌ song.mp3 not found!");
        ws.close();
        return;
    }

    console.log("🎵 Streaming song.mp3...");

    const stream = fs.createReadStream(MP3_FILE, { highWaterMark: 1024 });

    stream.on("data", (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);   // Send raw binary
        }
    });

    stream.on("end", () => {
        console.log("✅ Song finished - restarting stream (loop)");
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) streamLoop(); // Simple loop
        }, 800);
    });

    function streamLoop() {
        const newStream = fs.createReadStream(MP3_FILE, { highWaterMark: 1024 });
        newStream.on("data", chunk => ws.readyState === WebSocket.OPEN && ws.send(chunk));
        newStream.on("end", () => setTimeout(streamLoop, 500));
    }

    ws.on("close", () => {
        console.log("❌ ESP32 disconnected");
        stream.destroy();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 ESP32 should connect to wss://dubix-audio.onrender.com/audio`);
});
