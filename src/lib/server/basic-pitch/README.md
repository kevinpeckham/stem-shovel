The Basic Pitch model for server-side transcription (src/lib/server/notes.ts),
bundled into the jobs function: `model.json` is a copy of
static/basic-pitch/model.json and `weights.json` holds
static/basic-pitch/group1-shard1of1.bin as base64. Regenerate with

    cp static/basic-pitch/model.json src/lib/server/basic-pitch/model.json
    bun -e 'const fs=require("node:fs"); fs.writeFileSync("src/lib/server/basic-pitch/weights.json", JSON.stringify({ base64: fs.readFileSync("static/basic-pitch/group1-shard1of1.bin").toString("base64") }) + "\n")'
