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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/predict", async (req, res) => {
  try {
    // se você precisar de token, adicione no header Authorization neste fetch
    const response = await fetch(HF_SPACE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();
    // repassa tal qual
    res.status(response.status).type("application/json").send(text);
  } catch (err) {
    console.error("Erro ao chamar o Hugging Face:", err);
    res.status(502).json({ error: "Falha na comunicação com o Space", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
