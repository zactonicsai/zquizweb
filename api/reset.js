import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const host = (req.body?.host || "").trim();
    const questionCount = Number(req.body?.questionCount);
    const choiceCounts = req.body?.choiceCounts; // array of counts per question (e.g. [4,4,4,4,4])

    if (!host) return res.status(400).json({ error: "Missing host" });
    if (!Number.isInteger(questionCount) || questionCount <= 0) return res.status(400).json({ error: "Invalid questionCount" });
    if (!Array.isArray(choiceCounts) || choiceCounts.length !== questionCount) {
      return res.status(400).json({ error: "choiceCounts must be an array with length questionCount" });
    }

    for (let q = 0; q < questionCount; q++) {
      const c = Number(choiceCounts[q]);
      const key = `teen_summit:counts:${host}:q${q}`;
      await kv.set(key, Array.from({ length: c }, () => 0));
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
}
