import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const HF_SPACE_URL = "https://madras1-jade-port.hf.space";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/predict", async (req, res) => {
  try {
    console.log("Proxy: POST /api/predict recebido. Body keys:", Object.keys(req.body));

    // 1️⃣ Tenta primeiro /queue/join (modelo Gradio 4.x)
    const queuePayload = {
      data: req.body.data || [],
      fn_index: req.body.fn_index ?? 0,
      session_hash: "proxy_" + Math.random().toString(36).substring(2, 10),
    };

    console.log("Proxy: tentando /queue/join with payload:", queuePayload);

    const joinResp = await fetch(`${HF_SPACE_URL}/queue/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queuePayload),
    });

    const joinText = await joinResp.text();
    console.log("Proxy: /queue/join response status", joinResp.status, "body:", joinText);

    if (!joinResp.ok) {
      return res
        .status(joinResp.status)
        .json({ error: "Falha ao chamar fila do Space", details: joinText });
    }

    // 2️⃣ Retorna o corpo direto
    return res.status(200).type("application/json").send(joinText);
  } catch (err) {
    console.error("Proxy: Erro inesperado", err);
    res.status(500).json({
      error: "Erro interno no proxy",
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy ativo e rodando na porta ${PORT}`);
});
