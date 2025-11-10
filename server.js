// server.js - proxy robusto para HuggingFace Space
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Lista de endpoints que vamos tentar no Space (ordem: a mais provável primeiro)
const HF_SPACE_ORIGIN = "https://madras1-jade-port.hf.space";
const HF_ENDPOINTS = [
  "/api/predict",
  "/predict",
  "/run/predict",
  "/queue/join"
];

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, try_endpoints: HF_ENDPOINTS.map(e => HF_SPACE_ORIGIN + e) });
});

// Proxy principal: recebe o body do front e repassa ao Space tentando vários caminhos
app.post("/api/predict", async (req, res) => {
  console.log("Proxy: POST /api/predict recebido. Body keys:", Object.keys(req.body));
  const payload = req.body;

  // Tenta cada endpoint até obter status < 500 e body válido
  for (const ep of HF_ENDPOINTS) {
    const url = HF_SPACE_ORIGIN + ep;
    try {
      console.log(`Proxy: tentando ${ep} ...`);
      const hfResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Alguns endpoints (como /queue/join) querem session_hash; deixamos o body original
        body: JSON.stringify(payload),
        redirect: "follow",
        timeout: 15000
      });

      const text = await hfResp.text();
      console.log(`Proxy: ${ep} respondeu status ${hfResp.status}. Resposta (prefixo):`, text.slice(0, 800));

      // Se status é 200-399, devolve direto ao cliente
      if (hfResp.status >= 200 && hfResp.status < 400) {
        res.status(hfResp.status).type("application/json").send(text);
        return;
      }

      // se 404/405/401 -> continuamos tentando; mas logamos o detalhe
      console.warn(`Proxy: ${ep} retornou status ${hfResp.status}. Continuando tentativas...`);

    } catch (err) {
      console.error(`Proxy: erro ao chamar ${ep}:`, err && err.message ? err.message : err);
      // continua para o próximo endpoint
    }
  }

  // Se todos falharam:
  console.error("Proxy: todos os endpoints testados retornaram erro / não responderam com sucesso.");
  res.status(502).json({ error: "Falha: Space não respondeu em nenhum endpoint testado", tried: HF_ENDPOINTS.map(e=>HF_SPACE_ORIGIN+e) });
});

// rota para debug rápido via browser
app.get("/", (req, res) => {
  res.send("<html><body><h3>Proxy ativo e rodando.</h3><p>Use POST /api/predict para encaminhar ao Space.</p></body></html>");
});

app.listen(PORT, () => {
  console.log(`Proxy rodando na porta ${PORT} - repassando para: ${HF_SPACE_ORIGIN}`);
});
