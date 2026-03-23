// pages/api/soap.js
// ⚠️ このファイルはサーバー側で実行されます。APIキーはクライアントに公開されません。

import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transcript, patientContext } = req.body;

  if (!transcript || transcript.trim() === "") {
    return res.status(400).json({ error: "transcriptが必要です" });
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = `あなたは歯科医師のカルテ作成支援AIです。
以下の患者情報と診療内容の文字起こしをもとに、SOAP形式のカルテを作成してください。

${patientContext ? "【患者情報】\n" + patientContext + "\n\n" : ""}【診療内容（文字起こし/メモ）】
${transcript}

【指示】
上記を分析し、歯科SOAP形式で整理してください。
- S（Subjective）：患者の主訴、自覚症状、訴え、患者が述べた既往歴など
- O（Objective）：診察所見、打診反応、温度診、歯周ポケット、X線所見、歯式など客観的情報
- A（Assessment）：病名・診断・状態評価（歯科的診断名を含む）
- P（Plan）：今回の処置内容、次回の治療計画、投薬、患者指導内容など

入力に明記されていない項目は「記録なし」と記載してください。推測の場合は（推測）と明記。
歯科専門用語を適切に使用し、簡潔かつ正確にまとめてください。

以下のJSONのみで返答してください（マークダウンや前後のテキスト不要）：
{"S":"...","O":"...","A":"...","P":"..."}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.map((b) => b.text || "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    const soap = JSON.parse(clean);

    return res.status(200).json({ soap });
  } catch (err) {
    console.error("SOAP生成エラー:", err);
    return res.status(500).json({ error: "SOAP生成に失敗しました: " + err.message });
  }
}
