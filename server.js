import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HF_BASE = "https://madras1-jade-port.hf.space"; // base do space

app.use(cors());
app.use(express.json({ limit: '5mb' })); // aceita bodies maiores se necessário
app.use(express.static(path.join(__dirname, "public")));

// rota de debug simples
app.get("/api/predict", (req, res) => {
  res.json({ status: "ok", message: "Endpoint /api/predict ativo (GET test)" });
});

// OPTIONS preflight
app.options("/api/predict", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(204);
});

// lista de paths a tentar (ordem: queue/join depois run/predict etc)
const candidatePaths = [
  "/queue/join",
  "/run/predict",
  "/api/predict",
  "/predict"
];

async function tryForward(bodyText, origHeaders) {
  // origHeaders: object with headers from client request (if needed)
  for (const p of candidatePaths) {
    const url = HF_BASE + p;
    try {
      console.log(`Tentando encaminhar para: ${url}`);
      const hfResp = await fetch(url, {
        method: "POST",
        headers: {
          // repassa Content-Type e aceita possivel Authorization se existir
          "Content-Type": origHeaders["content-type"] || "application/json",
          ...(origHeaders["authorization"] ? { "Authorization": origHeaders["authorization"] } : {})
        },
        body: bodyText,
      });

      const text = await hfResp.text();
      console.log(`Resposta de ${p}: status=${hfResp.status} len=${String(text).length}`);

      // Se não for 404, consideramos válido e retornamos
      if (hfResp.status !== 404) {
        return { ok: true, status: hfResp.status, text, headers: hfResp.headers };
      } else {
        // continua testando próximos
        console.log(`${p} retornou 404, tentando próximo...`);
      }
    } catch (err) {
      console.error(`Erro ao chamar ${url}:`, err.message || err);
      // tenta próximo
    }
  }
  return { ok: false, status: 404, text: JSON.stringify({ detail: "Not Found" }) };
}

app.post("/api/predict", async (req, res) => {
  try {
    const bodyText = JSON.stringify(req.body || {});
    // pega alguns headers úteis do pedido do cliente (lowercase)
    const incoming = {};
    for (const [k, v] of Object.entries(req.headers || {})) incoming[k.toLowerCase()] = v;

    console.log("POST /api/predict recebido. keys:", Object.keys(req.body || {}));
    const result = await tryForward(bodyText, incoming);

    if (result.ok) {
      // repassa o conteúdo do HF Space
      // tenta definir content-type igual ao que veio
      const ctype = result.headers.get("content-type") || "application/json; charset=utf-8";
      res.status(result.status).type(ctype).send(result.text);
    } else {
      res.status(404).json({ detail: "Not Found - nenhum endpoint do Space aceitou a requisição" });
    }
  } catch (err) {
    console.error("Erro interno no proxy:", err);
    res.status(500).json({ error: "proxy_internal_error", details: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
