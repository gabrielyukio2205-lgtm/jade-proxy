import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const HF_SPACE_URL = "https://madras1-jade-port.hf.space/api/predict";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/predict", (req, res) => {
  res.json({ status: "proxy-alive", target: HF_SPACE_URL });
});

app.post("/api/predict", async (req, res) => {
  try {
    console.log("=== Proxy POST /api/predict received ===");
    console.log("Body:", JSON.stringify(req.body));

    const response = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://madras1-jade-port.hf.space",
        "Referer": "https://madras1-jade-port.hf.space/",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();
    console.log("Space response status:", response.status);
    console.log("Space response body:", text);

    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "proxy_internal_error", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy running on port ${PORT}`);
});
