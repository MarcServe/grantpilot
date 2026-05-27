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
  "Every day, GrantsCopilot searches fresh funding sources, checks each grant against your Business DNA, and shows exactly what you qualify for.",
  "Build your profile once, add documents and team details, then prepare funder-ready answers, pitch decks, checklists, and reminders from one workspace.",
  "Daily email digests keep every opportunity visible, while WhatsApp alerts highlight only the strongest matches.",
  "GrantsCopilot helps founders move from grant search to application-ready faster.",
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
