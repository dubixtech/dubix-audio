const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Place your MP3 file in the same folder as this script
const MP3_FILE = path.join(__dirname, "song.mp3");

app.get("/", (req, res) => {
    res.send("ESP32 Audio Streaming Server Running");
});

app.get("/song.mp3", (req, res) => {
    if (!fs.existsSync(MP3_FILE)) {
        return res.status(404).send("MP3 file not found");
    }

    const stat = fs.statSync(MP3_FILE);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1]
            ? parseInt(parts[1], 10)
            : fileSize - 1;

        const chunkSize = (end - start) + 1;

        res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": chunkSize
        });

        fs.createReadStream(MP3_FILE, {
            start,
            end
        }).pipe(res);

    } else {
        res.writeHead(200, {
            "Content-Length": fileSize
        });

        fs.createReadStream(MP3_FILE).pipe(res);
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Audio server running`);
    console.log(`URL: http://localhost:${PORT}/song.mp3`);
});
```
