const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Path to your MP3 file
const MP3_FILE = path.join(__dirname, "song.mp3");

app.get("/", (req, res) => {
    res.send(`
        <h1>ESP32 MP3 WebSocket Server</h1>
        <p>WebSocket endpoint: <strong>ws://your-domain/ws/audio</strong></p>
        <p>Put your <code>song.mp3</code> in the same folder.</p>
    `);
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket Server
const wss = new WebSocket.Server({ 
    server,
    path: "/audio"   // Must match ESP32 ws_path
});

wss.on("connection", (ws, req) => {
    console.log("✅ ESP32 Connected via WebSocket");

    if (!fs.existsSync(MP3_FILE)) {
        console.error("MP3 file not found!");
        ws.send("ERROR: MP3 file not found on server");
        ws.close();
        return;
    }

    const fileSize = fs.statSync(MP3_FILE).size;
    const stream = fs.createReadStream(MP3_FILE, { highWaterMark: 1024 }); // Chunk size

    console.log(`Streaming ${MP3_FILE} (${(fileSize/1024/1024).toFixed(2)} MB)`);

    stream.on("data", (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);           // Send raw binary MP3 data
        } else {
            stream.destroy();
        }
    });

    stream.on("end", () => {
        console.log("✅ Finished streaming MP3");
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Stream finished");
        }
    });

    stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(1011, "Stream error");
        }
    });

    // Handle client disconnect
    ws.on("close", () => {
        console.log("❌ ESP32 disconnected");
        stream.destroy();
    });

    ws.on("error", (err) => {
        console.error("WebSocket error:", err);
        stream.destroy();
    });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 HTTP : http://localhost:${PORT}`);
    console.log(`🔌 WebSocket (WSS ready): ws://your-domain/ws/audio`);
});
