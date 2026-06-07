import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

if (!apiKey) {
  throw new Error("ELEVENLABS_API_KEY is required");
}

const outputDir = path.join(process.cwd(), "public", "voiceover", "grantscopilot-launch");
const outputPath = path.join(outputDir, "narration.mp3");

const text = [
  "Meet GrantsCopilot.",
  "Find it, fill it, fund it, on autopilot.",
  "The dashboard shows fresh grants, suggested matches, deadlines, prep runs, and notification health at a glance.",
  "Opportunities are scored against your Business DNA, while Data Vault keeps profile details, team data, and documents ready for reuse.",
  "Choose a grant, then generate eligibility summaries, checklists, answers, pitch decks, and supporting documents from one workspace.",
  "Daily emails keep opportunities visible, WhatsApp highlights only the strongest matches, and admin diagnostics show what happened.",
  "GrantsCopilot helps founders move from search to application-ready faster.",
].join(" ");

const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  },
  body: JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.48,
      similarity_boost: 0.78,
      style: 0.32,
      use_speaker_boost: true,
    },
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`ElevenLabs request failed (${response.status}): ${body}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

console.log(`Voiceover written to ${outputPath}`);
