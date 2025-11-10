// server.js - proxy robusto que tenta vários formatos e aceita HF token via ENV
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// Configure aqui o URL base do Space (certifique-se que é correto)
const HF_SPACE_ORIGIN = "https://madras1-jade-port.hf.space";

// Endpoints a tentar, em ordem
const HF_ENDPOINTS = [
  "/api/predict",
  "/predict",
  "/run/predict",
  "/queue/join"
];

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({ ok: true, tried: HF_ENDPOINTS.map(e => HF_SPACE_ORIGIN + e) });
});

function getAuthHeader() {
  // Se você definir HF_TOKEN no Render (Environment), ele será usado
  if (process.env.HF_TOKEN) {
    return { Authorization: `Bearer ${process.env.HF_TOKEN}` };
  }
  return {};
}

async function tryPost(url, bodyObj, isJson=true) {
  const headers = { ...(isJson ? { "Content-Type": "application/json" } : {}), ...getAuthHeader() };
  const opts = {
    method: "POST",
    headers,
    body: isJson ? JSON.stringify(bodyObj) : bodyObj,
    redirect: "follow"
  };
  const r = await fetch(url, opts);
  const text = await r.text();
  return { status: r.status, text };
}

app.post("/api/predict", async (req, res) => {
  console.log("Proxy: POST /api/predict recebido. Body keys:", Object.keys(req.body || {}));

  // carga comum: do front-end você pode enviar:
  // 1) { text_input, audio_file, image_file, chat_history }  (chave por chave)
  // 2) { data: [ ... ], fn_index: 0 }  (formato antigo do Gradio)
  // 3) multipart/form-data para enviar arquivos (não implementado aqui)
  const original = req.body || {};

  // Tentativas: para cada endpoint, tentamos dois estilos de payload
  for (const ep of HF_ENDPOINTS) {
    const url = HF_SPACE_ORIGIN + ep;
    try {
      console.log(`Proxy: tentando ${url} (payload style A - keyed inputs)`);
      // payload style A: named keys (como na doc do /predict)
      const bodyA = {
        text_input: original.text_input ?? (original.data && Array.isArray(original.data) ? original.data[0] : ""),
        audio_file: original.audio_file ?? null,
        image_file: original.image_file ?? null,
        chat_history: original.chat_history ?? [],
      };

      let rA = await tryPost(url, bodyA, true);
      console.log(`Proxy: resposta ${url} (A) status=${rA.status} text-prefix="${rA.text.slice(0,400)}"`);

      if (rA.status >= 200 && rA.status < 400) {
        res.status(rA.status).type("application/json").send(rA.text);
        return;
      }

      // payload style B: { data: [...], fn_index: 0 } — fallback
      console.log(`Proxy: tentando ${url} (payload style B - data+fn_index)`);
      const bodyB = {
        data: original.data ?? [ bodyA.text_input, null, null, bodyA.chat_history ],
        fn_index: original.fn_index ?? 0
      };

      let rB = await tryPost(url, bodyB, true);
      console.log(`Proxy: resposta ${url} (B) status=${rB.status} text-prefix="${rB.text.slice(0,400)}"`);

      if (rB.status >= 200 && rB.status < 400) {
        res.status(rB.status).type("application/json").send(rB.text);
        return;
      }

      // se não funcionou tente o próximo endpoint
    } catch (err) {
      console.error(`Proxy: erro chamando ${url}:`, err && err.message ? err.message : err);
    }
  }

  // se chegou aqui, tudo falhou
  console.error("Proxy: todos endpoints testados falharam.");
  res.status(502).json({
    error: "Falha: Space não respondeu em nenhum endpoint testado",
    tried: HF_ENDPOINTS.map(e => HF_SPACE_ORIGIN + e)
  });
});

app.get("/", (req, res) => {
  res.send(`<html><body><h3>Proxy ativo e rodando. POST /api/predict</h3></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Proxy rodando na porta ${PORT} — repassando para ${HF_SPACE_ORIGIN}`);
});
