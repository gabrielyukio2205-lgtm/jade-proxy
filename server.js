import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Base do Space (sem trailing slash)
const HF_SPACE_BASE = "https://madras1-jade-port.hf.space";

// Endpoints possíveis
const HF_RUN_PREDICT = HF_SPACE_BASE + "/run/predict";
const HF_QUEUE_JOIN = HF_SPACE_BASE + "/queue/join";
const HF_QUEUE_DATA = HF_SPACE_BASE + "/queue/data"; // maybe used with ?session_hash=...
const HF_QUEUE_JOIN_GET = HF_SPACE_BASE + "/queue/join"; // sometimes polling uses same path with GET

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/predict", (req, res) => {
  res.json({ status: "ok", message: "Endpoint proxy ativo. Use POST para enviar mensagens." });
});

// OPTIONS preflight
app.options("/api/predict", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(204);
});

function makeSessionHash() {
  return "proxy_" + Math.random().toString(36).substring(2, 10);
}

// Faz fetch com timeout
async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Tenta obter resposta final via polling em vários endpoints
async function pollForResult(sessionHash, maxAttempts = 20, intervalMs = 800) {
  const candidates = [
    (hash) => `${HF_QUEUE_DATA}?session_hash=${encodeURIComponent(hash)}`,
    (hash) => `${HF_QUEUE_JOIN_GET}?session_hash=${encodeURIComponent(hash)}`,
    (hash) => `${HF_SPACE_BASE}/queue/join?session_hash=${encodeURIComponent(hash)}`,
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const makeUrl of candidates) {
      const url = makeUrl(sessionHash);
      try {
        const resp = await fetchWithTimeout(url, { method: "GET", headers: { "Accept": "application/json" } }, 8000);
        const text = await resp.text();
        let json;
        try { json = JSON.parse(text); } catch(e) { json = null; }
        // heurística: se tem 'data' ou 'output' ou é um array com respostas, retornamos
        if (json) {
          if (json.data || json.output || (Array.isArray(json) && json.length > 0)) {
            console.log(`poll success url=${url} attempt=${attempt}`);
            return { status: resp.status, body: json, url };
          }
          // alguns servers retornam {"success": true, "data":[...]}
          if (json.success && json.data) {
            return { status: resp.status, body: json, url };
          }
        } else {
          // se texto parece JSON-like com "data" substring, return raw
          if (text && text.includes('"data"')) {
            try { return { status: resp.status, body: JSON.parse(text), url }; } catch {}
          }
        }
      } catch (err) {
        // ignora e tenta próximo
        // console.warn('poll error', err.message);
      }
    }
    // aguarda interval
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("Polling timed out");
}

app.post("/api/predict", async (req, res) => {
  try {
    console.log("Proxy: POST /api/predict recebido. Body keys:", Object.keys(req.body || {}));

    // Se o cliente já mandou o formato completo (por ex. data + fn_index),
    // tentamos reaproveitar. Caso contrário, montamos payload básico.
    const incoming = req.body || {};
    let payloadForRunPredict = incoming;
    // If user sent text only as {text: "..." } or {message: "..."}
    if (!incoming || (Object.keys(incoming).length === 0)) {
      payloadForRunPredict = { data: [ "", null, null, [] ] };
    } else if (!incoming.data && (incoming.text || incoming.message || typeof incoming === 'string')) {
      const textVal = incoming.text || incoming.message || (typeof incoming === 'string' ? incoming : "");
      payloadForRunPredict = { data: [ textVal, null, null, [] ], fn_index: 0 };
    } else if (incoming.data) {
      payloadForRunPredict = incoming;
    }

    // 1) Tenta /run/predict primeiro (muitos Spaces suportam)
    try {
      console.log("Proxy: tentando /run/predict ...");
      const r = await fetchWithTimeout(HF_RUN_PREDICT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForRunPredict)
      }, 12000);

      const text = await r.text();
      if (r.ok) {
        // retorno direto
        try {
          const json = JSON.parse(text);
          console.log("Proxy: /run/predict ok. Enviando resposta.");
          return res.status(r.status).json(json);
        } catch (e) {
          // body não JSON? devolve raw
          return res.status(r.status).type("text/plain").send(text);
        }
      } else {
        // se status 404 ou similar, vamos tentar queue
        console.log("Proxy: /run/predict respondeu status", r.status, "body:", text);
        // se não for 404, pode ainda ser uma mensagem util (eg 200 com detail) - mas aqui tentamos queue
      }
    } catch (err) {
      console.warn("Proxy: /run/predict erro:", err.message);
      // segue para tentar queue
    }

    // 2) Tenta /queue/join (cria tarefa)
    try {
      const sessionHash = makeSessionHash();
      // Monta payload para queue/join
      // Se payloadForRunPredict tem data[], usa o primeiro item como texto
      let textVal = "";
      if (payloadForRunPredict?.data && Array.isArray(payloadForRunPredict.data)) {
        textVal = payloadForRunPredict.data[0];
      } else if (incoming.text) {
        textVal = incoming.text;
      } else if (incoming.message) {
        textVal = incoming.message;
      }
      const queuePayload = {
        data: [ textVal, null, null, [] ],
        fn_index: incoming.fn_index ?? 0,
        session_hash: sessionHash
      };

      console.log("Proxy: tentando /queue/join with payload:", queuePayload);

      const joinResp = await fetchWithTimeout(HF_QUEUE_JOIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queuePayload)
      }, 12000);

      const joinText = await joinResp.text();
      let joinJson = null;
      try { joinJson = JSON.parse(joinText); } catch(e) { joinJson = null; }

      console.log("Proxy: /queue/join response status", joinResp.status, "body:", joinText);

      // Algumas implantações retornam imediatamente o resultado. Se joinJson contém 'data', devolve.
      if (joinResp.ok) {
        if (joinJson && (joinJson.data || joinJson.output)) {
          console.log("Proxy: join retornou já data/output -> devolvendo.");
          return res.status(joinResp.status).json(joinJson);
        }
        // Senão, fazemos polling no queue/data?session_hash=...
        try {
          const polled = await pollForResult(sessionHash, 25, 800);
          console.log("Proxy: polling encontrou resultado via", polled.url);
          return res.status(polled.status || 200).json(polled.body);
        } catch (pollErr) {
          console.warn("Proxy: polling falhou:", pollErr.message);
          // envia resposta do join (raw) para debug
          if (joinJson) return res.status(joinResp.status).json(joinJson);
          return res.status(502).json({ error: "Polling timed out and no usable join response", joinText });
        }
      } else {
        // join não ok: devolve body para diagnóstico
        return res.status(joinResp.status).type("application/json").send(joinText);
      }
    } catch (err) {
      console.error("Proxy: erro no bloco queue:", err);
      return res.status(502).json({ error: "Erro ao usar queue/join", details: err.message });
    }

  } catch (err) {
    console.error("Proxy: erro geral:", err);
    return res.status(500).json({ error: "Erro interno no proxy", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
