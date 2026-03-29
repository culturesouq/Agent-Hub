import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import { db, agentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { ensureCompatibleFormat, speechToText, textToSpeech } from "@workspace/integrations-openai-ai-server/audio";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type Voice = (typeof VALID_VOICES)[number];

router.post("/agents/:agentId/transcribe", upload.single("audio"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  if (!req.file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  try {
    const { buffer, format } = await ensureCompatibleFormat(req.file.buffer);
    const text = await speechToText(buffer, format);
    res.json({ text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

router.post("/agents/:agentId/speak", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { text?: string; voice?: string; speed?: number };
  if (!body.text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const voiceParam = (body.voice || agent.voice || "nova") as Voice;
  const voice: Voice = VALID_VOICES.includes(voiceParam) ? voiceParam : "nova";

  const speedHint = body.speed ?? agent.voiceSpeed ?? 1.0;
  let textToSpeak = body.text;
  if (speedHint <= 0.7) {
    textToSpeak = `[Speak very slowly and clearly] ${body.text}`;
  } else if (speedHint >= 1.4) {
    textToSpeak = `[Speak quickly and energetically] ${body.text}`;
  }

  try {
    const audioBuffer = await textToSpeech(textToSpeak, voice, "mp3");
    const audioBase64 = audioBuffer.toString("base64");
    res.json({ audio: audioBase64 });
  } catch (err: any) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "Text-to-speech failed" });
  }
});

export default router;
