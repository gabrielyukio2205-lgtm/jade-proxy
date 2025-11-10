import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// === ENDPOINT DO SEU SPACE ===
const HF_SPACE = "https://madras1-jade-port.hf.space/run/predict";

app.use(cors());
app.use(express.json());

// === ROTA PRINCIPAL QUE O FRONT CHAMA ===
app.post("/api/predict", async (req, res) => {
  try {
    const r = await fetch(HF_SPACE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error("❌ ERRO AO CHAMAR O SPACE:", e);
    res.status(500).json({ error: "ProxyError", detail: e.message });
  }
});

app.get("/", (req, res) => res.send("✅ Proxy ativo e rodando."));

app.listen(PORT, () => console.log(`🚀 Proxy rodando na porta ${PORT}`));
