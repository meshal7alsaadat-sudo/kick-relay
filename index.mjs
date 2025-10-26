import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 10000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/auth", async (req, res) => {
  const channel = (req.query.channel || "").toLowerCase();
  if (!channel) return res.status(400).json({ error: "missing channel" });

  try {
    const chRes = await fetch(`https://kick.com/api/v2/channels/${channel}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://kick.com",
        "Referer": `https://kick.com/${channel}`,
      },
    });

    if (!chRes.ok) throw new Error("Failed to fetch channel info");

    const ch = await chRes.json();
    const roomId = ch?.chatroom?.id;
    if (!roomId) throw new Error("No chatroom ID found");

    const authRes = await fetch(
      `https://kick.com/api/v2/chatroom/${roomId}/auth`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://kick.com",
          "Referer": `https://kick.com/${channel}`,
        },
      }
    );

    if (!authRes.ok) throw new Error("Failed to fetch token");

    const data = await authRes.json();
    if (!data?.token) throw new Error("No token in response");

    res.json({
      roomId,
      token: data.token,
    });
  } catch (e) {
    res.json({
      error: e.message || String(e),
    });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "online", message: "Kick relay active" });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
