import { kv } from "@vercel/kv";
import crypto from "crypto";

function getClientIp(req) {
  // Vercel typically provides x-forwarded-for
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  // fallback
  return req.socket?.remoteAddress || "unknown";
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export default async function handler(req, res) {
  try {
    const method = req.method || "GET";

    const host = (req.query.host || req.body?.host || "teensummit").trim();
    const q = Number(req.query.q ?? req.body?.q);
    const choiceCount = Number(req.query.choiceCount ?? req.body?.choiceCount);

    if (!host) return res.status(400).json({ error: "Missing host" });
    if (!Number.isInteger(q) || q < 0) return res.status(400).json({ error: "Invalid q" });

    const countsKey = `teen_summit:counts:${host}:q${q}`;

    if (method === "GET") {
      let counts = await kv.get(countsKey);

      if (!Array.isArray(counts)) {
        if (!Number.isInteger(choiceCount) || choiceCount <= 0) {
          return res.status(400).json({ error: "Missing or invalid choiceCount for initialization" });
        }
        counts = Array.from({ length: choiceCount }, () => 0);
        await kv.set(countsKey, counts);
      }

      return res.status(200).json({ host, q, counts });
    }

    if (method === "POST") {
      const choice = Number(req.body?.choice);
      const clientId = String(req.body?.clientId || "").trim();
      const tabId = String(req.body?.tabId || "").trim();

      if (!Number.isInteger(choiceCount) || choiceCount <= 0) {
        return res.status(400).json({ error: "Missing or invalid choiceCount" });
      }
      if (!Number.isInteger(choice) || choice < 0 || choice >= choiceCount) {
        return res.status(400).json({ error: "Invalid choice" });
      }
      if (!clientId || !tabId) {
        return res.status(400).json({ error: "Missing clientId or tabId" });
      }

      // Build a fingerprint using: IP + UA + clientId + tabId
      // We store ONLY a hash (not raw IP).
      const ip = getClientIp(req);
      const ua = String(req.headers["user-agent"] || "unknown");
      const fingerprint = sha256(`${ip}|${ua}|${clientId}|${tabId}`);

      // voter key: one vote per question per fingerprint
      const votersKey = `teen_summit:voters:${host}:q${q}`;

      // If already voted, just return current counts (no double-count)
      const already = await kv.sismember(votersKey, fingerprint);
      if (already) {
        let counts = await kv.get(countsKey);
        if (!Array.isArray(counts) || counts.length !== choiceCount) {
          counts = Array.from({ length: choiceCount }, () => 0);
          await kv.set(countsKey, counts);
        }
        return res.status(200).json({ host, q, counts, alreadyVoted: true });
      }

      // Load counts (init if missing)
      let counts = await kv.get(countsKey);
      if (!Array.isArray(counts) || counts.length !== choiceCount) {
        counts = Array.from({ length: choiceCount }, () => 0);
      }

      // Apply vote
      counts[choice] = (Number(counts[choice]) || 0) + 1;

      // Persist counts + mark voter
      // NOTE: This is "good enough" for classrooms. For strict atomicity, you'd use a Lua script.
      await kv.set(countsKey, counts);
      await kv.sadd(votersKey, fingerprint);

      return res.status(200).json({ host, q, counts, alreadyVoted: false });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
  }
}
