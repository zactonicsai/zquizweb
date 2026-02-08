import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  try {
    const method = req.method || "GET";

    // Read params (GET via querystring, POST via body)
    const host = (req.query.host || req.body?.host || "").trim();
    const q = Number(req.query.q ?? req.body?.q);
    const choiceCount = Number(req.query.choiceCount ?? req.body?.choiceCount);

    if (!host) return res.status(400).json({ error: "Missing host" });
    if (!Number.isInteger(q) || q < 0) return res.status(400).json({ error: "Invalid q" });

    const key = `teen_summit:counts:${host}:q${q}`;

    if (method === "GET") {
      // Return counts array
      let counts = await kv.get(key);

      if (!Array.isArray(counts)) {
        // Initialize if missing (needs choiceCount)
        if (!Number.isInteger(choiceCount) || choiceCount <= 0) {
          return res.status(400).json({ error: "Missing or invalid choiceCount for initialization" });
        }
        counts = Array.from({ length: choiceCount }, () => 0);
        await kv.set(key, counts);
      }

      return res.status(200).json({ host, q, counts });
    }

    if (method === "POST") {
      const choice = Number(req.body?.choice);

      if (!Number.isInteger(choiceCount) || choiceCount <= 0) {
        return res.status(400).json({ error: "Missing or invalid choiceCount" });
      }
      if (!Number.isInteger(choice) || choice < 0 || choice >= choiceCount) {
        return res.status(400).json({ error: "Invalid choice" });
      }

      // Get current, init if missing
      let counts = await kv.get(key);
      if (!Array.isArray(counts) || counts.length !== choiceCount) {
        counts = Array.from({ length: choiceCount }, () => 0);
      }

      counts[choice] = (Number(counts[choice]) || 0) + 1;
      await kv.set(key, counts);

      return res.status(200).json({ host, q, counts });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
}
