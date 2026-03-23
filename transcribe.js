// pages/api/transcribe.js
// 音声ファイルをOpenAI Whisper APIで文字起こし
// APIキーはサーバー側のみで使用されます

import { IncomingForm } from "formidable";
import { createReadStream } from "fs";
import OpenAI from "openai";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new IncomingForm({ maxFileSize: 25 * 1024 * 1024 }); // 25MB上限

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(400).json({ error: "ファイルの解析に失敗しました" });
    }

    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    if (!audioFile) {
      return res.status(400).json({ error: "音声ファイルが必要です" });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    try {
      const transcription = await openai.audio.transcriptions.create({
        file: createReadStream(audioFile.filepath),
        model: "whisper-1",
        language: "ja",
      });

      return res.status(200).json({ text: transcription.text });
    } catch (error) {
      console.error("文字起こしエラー:", error);
      return res.status(500).json({ error: "文字起こしに失敗しました: " + error.message });
    }
  });
}
