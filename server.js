import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
// endpoint do Space
const HF_SPACE_URL = "https://madras1-jade-port.hf.space/run/predict";

app.use(cors()); // habilita CORS global
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Rota GET para teste: abre essa URL no browser para confirmar que a rota existe
app.get("/api/predict", (req, res) => {
  return res.json({ status: "ok", message: "Endpoint /api/predict ativo - envie POST com JSON" });
});

// Responde OPTIONS (CORS preflight) explicitamente
app.options("/api/predict", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(204);
});

// Endpoint POST que repassa ao HuggingFace Space
app.post("/api/predict", async (req, res) => {
  try {
    // console.log para investigação se necessário:
    console.log("POST /api/predict recebido. Body keys:", Object.keys(req.body || {}));

    const response = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" /*, Authorization: `Bearer ${process.env.HF_TOKEN}` */ },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    // repassa tal qual (status e body)
    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    console.error("Erro ao chamar o Hugging Face:", err);
    res.status(502).json({ error: "Falha na comunicação com o Space", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
