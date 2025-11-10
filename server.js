/**
 * server.js - Proxy resiliente para Hugging Face Space
 * Tenta vários endpoints e envia headers parecidos com o browser.
 */

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// base do Space
const HF_SPACE_BASE = "https://madras1-jade-port.hf.space";

// possíveis endpoints que vamos testar (ordem importa)
const CANDIDATE_ENDPOINTS = [
  "/run/predict",
  "/api/predict",
  "/predict",
  "/queue/join",
  "/api/queue/join",
  "/queue/data",       // usado para polling
  "/api/queue/data",
  "/predict/",         // algumas implent. usam trailing slash
];

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/predict", (req, res) => {
  res.json({ status: "ok", message: "Proxy ativo" });
});

app.options("/api/predict", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(204);
});

function makeSessionHash() {
  return "proxy_" + Math.random().toString(36).substring(2, 10);
}

async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return resp;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function tryEndpoints(payload, incoming) {
  // Headers imitando navegador (muito importante)
  const browserLikeHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Origin": HF_SPACE_BASE,
    "Referer": HF_SPACE_BASE + "/",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": incoming?.userAgent || "Mozilla/5.0 (compatible)",
  };

  for (const pathSuffix of CANDIDATE_ENDPOINTS) {
    const url = HF_SPACE_BASE + pathSuffix;
    try {
      console.log(`Proxy: tentando URL ${url}`);
      const r = await fetchWithTimeout(url, {
        method: "POST",
        headers: browserLikeHeaders,
        body: JSON.stringify(payload),
      }, 12000);

      const text = await r.text();
      console.log(`Proxy: resposta ${url} status=${r.status} body=${text}`);
      // Se status 200/201/202 -> devolve imediatamente
      if (r.ok) {
        // tenta parse JSON, se falhar devolve raw
        try {
          const json = JSON.parse(text);
          return { ok: true, status: r.status, body: json, url };
        } catch (e) {
          return { ok: true, status: r.status, body: text, url };
        }
      } else {
        // se 404/405/other, continua tentando outras URLs
        // mas logamos para diagnóstico (já feito)
      }
    } catch (err) {
      console.warn(`Proxy: erro ao tentar ${url}:`, err.message);
    }
  }
  return { ok: false, error: "Nenhum endpoint aceitou a requisição" };
}

// polling simples para queue/data?session_hash=...
async function pollForSession(sessionHash, maxAttempts = 20, intervalMs = 800) {
  const pollCandidates = [
    `${HF_SPACE_BASE}/queue/data?session_hash=${encodeURIComponent(sessionHash)}`,
    `${HF_SPACE_BASE}/queue/join?session_hash=${encodeURIComponent(sessionHash)}`,
    `${HF_SPACE_BASE}/api/queue/data?session_hash=${encodeURIComponent(sessionHash)}`
  ];

  for (let i = 0; i < maxAttempts; i++) {
    for (const url of pollCandidates) {
      try {
        const r = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json", Origin: HF_SPACE_BASE, Referer: HF_SPACE_BASE + "/" } }, 8000);
        const text = await r.text();
        console.log(`Proxy: polling ${url} status=${r.status} body=${text}`);
        try {
          const json = JSON.parse(text);
          if (json && (json.data || json.output || json[0])) return { ok: true, status: r.status, body: json, url };
        } catch (e) {
          if (text && text.includes('"data"')) {
            try { return { ok: true, status: r.status, body: JSON.parse(text), url }; } catch {}
          }
        }
      } catch (err) {
        // ignore
      }
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, error: "Polling timed out" };
}

app.post("/api/predict", async (req, res) => {
  try {
    console.log("Proxy: POST /api/predict recebido. Body keys:", Object.keys(req.body || {}));
    const incoming = req.body || {};
    // monta payload básico se user enviou texto simples
    let textVal = "";
    if (incoming?.data && Array.isArray(incoming.data)) {
      textVal = incoming.data[0] ?? "";
    } else if (incoming.text) {
      textVal = incoming.text;
    } else if (incoming.message) {
      textVal = incoming.message;
    }

    const sessionHash = makeSessionHash();
    const candidatePayload = {
      data: [textVal, null, null, []],
      fn_index: incoming.fn_index ?? 0,
      session_hash: sessionHash
    };

    // 1) tenta vários endpoints (run/predict, api/predict, queue/join etc.)
    const result = await tryEndpoints(candidatePayload, { userAgent: req.headers['user-agent'] });
    if (result.ok) {
      console.log("Proxy: Encontrou endpoint que respondeu ok:", result.url);
      return res.status(result.status || 200).json(result.body);
    }

    // 2) se nenhum endpoint aceitou, tenta explicitamente /queue/join (novamente com headers)
    try {
      const url = HF_SPACE_BASE + "/queue/join";
      console.log("Proxy: segunda tentativa explícita em", url);
      const r = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Origin": HF_SPACE_BASE,
          "Referer": HF_SPACE_BASE + "/",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": req.headers['user-agent'] || "Mozilla/5.0"
        },
        body: JSON.stringify(candidatePayload)
      }, 12000);

      const text = await r.text();
      console.log("Proxy: resposta /queue/join explicit:", r.status, text);
      if (r.ok) {
        try { return res.status(r.status).json(JSON.parse(text)); } catch { return res.status(r.status).type("text/plain").send(text); }
      } else {
        // tenta polling mesmo assim, às vezes join retorna 404 mas a fila existe via polling
        const polled = await pollForSession(sessionHash, 18, 900);
        if (polled.ok) return res.status(polled.status || 200).json(polled.body);
        // se não, devolve o último corpo do join para debug
        return res.status(r.status).type("application/json").send(text);
      }
    } catch (err) {
      console.warn("Proxy: erro ao fazer /queue/join explícito:", err.message);
    }

    return res.status(502).json({ error: "Nenhum endpoint do Space aceitou a requisição", detail: "Veja logs do proxy para respostas detalhadas." });

  } catch (err) {
    console.error("Proxy: erro geral:", err);
    return res.status(500).json({ error: "Erro interno do proxy", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Proxy rodando na porta ${PORT}`);
});
