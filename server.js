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

app.post("/api/predict", async (req, res) => {
  try {
    console.log("Proxy recebeu:", req.body);

    const response = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    console.log("Resposta do Space:", response.status, text);

    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    console.error("Erro no proxy:", err);
    res.status(500).json({ error: "Falha na comunicação com o Space", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy ativo e rodando na porta ${PORT}`);
});
