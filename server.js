// server.js - Proxy J.A.D.E. v2.1
// Aprimorado para aceitar payloads maiores para imagens e áudios.

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

const HF_SPACE_URL = "https://madras1-jade-port.hf.space";
const HF_CHAT_ENDPOINT = HF_SPACE_URL + "/chat";

app.use(cors());

// A CHAVE MESTRA: Aumentamos o limite do corpo da requisição JSON para 20 megabytes.
// Isso conserta o erro "Falha ao conectar" para imagens e permite o envio de áudio.
app.use(express.json({ limit: '20mb' }));

// Rota de saúde para verificar se o proxy está online
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    target_api: HF_CHAT_ENDPOINT 
  });
});

// A rota principal que encaminha TUDO para o Space
app.post("/chat", async (req, res) => {
  const { user_input, image_base64 } = req.body;
  const hasImage = image_base64 ? "Sim" : "Não";
  const log_input = user_input || "[Apenas Imagem]";
  console.log(`Proxy: Recebida requisição. Input: "${log_input}", Imagem: ${hasImage}`);

  try {
    const headers = { "Content-Type": "application/json" };
    if (process.env.HF_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.HF_TOKEN}`;
    }

    const spaceResponse = await fetch(HF_CHAT_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(req.body), // Encaminha o corpo inteiro como recebido
    });

    const responseData = await spaceResponse.json();
    console.log("Proxy: Resposta recebida do Space.");

    res.status(spaceResponse.status).json(responseData);

  } catch (err) {
    console.error(`Proxy: Erro crítico ao contatar o Space.`, err);
    res.status(502).json({ 
      success: false, 
      error: "Bad Gateway: O proxy não conseguiu se comunicar com a API da J.A.D.E." 
    });
  }
});

// Rota raiz para uma mensagem de boas-vindas
app.get("/", (req, res) => {
  res.send(`<html><body><h2>Proxy J.A.D.E. está ativo.</h2><p>Faça requisições POST para o endpoint /chat.</p></body></html>`);
});

app.listen(PORT, () => {
  console.log(`Proxy J.A.D.E. rodando na porta ${PORT}.`);
  console.log(`Encaminhando requisições de /chat para ${HF_CHAT_ENDPOINT}`);
});
