// server.js - Proxy J.A.D.E. v2.0
// Simplificado para se comunicar diretamente com a API FastAPI no Hugging Face Space.

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// O URL base do seu Space no Hugging Face
const HF_SPACE_URL = "https://madras1-jade-port.hf.space";

// O ÚNICO endpoint que precisamos, definido por nós no FastAPI
const HF_CHAT_ENDPOINT = HF_SPACE_URL + "/chat";

// Middlewares essenciais
app.use(cors()); // Permite que seu front-end (de qualquer origem) chame este proxy
app.use(express.json()); // Permite que o servidor entenda o JSON enviado pelo front-end

// Rota de "saúde" para verificar se o proxy está online
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    target_api: HF_CHAT_ENDPOINT 
  });
});

// A rota principal que faz a mágica acontecer
app.post("/chat", async (req, res) => {
  const userInput = req.body.user_input;
  console.log(`Proxy: Recebida requisição para /chat. Input: "${userInput}"`);

  // Validação básica da entrada
  if (!userInput) {
    return res.status(400).json({ error: "O campo 'user_input' é obrigatório." });
  }

  try {
    const headers = { 
      "Content-Type": "application/json" 
    };
    
    // Adiciona autenticação se o token estiver configurado nas variáveis de ambiente do Render
    if (process.env.HF_TOKEN) {
      headers["Authorization"] = `Bearer ${process.env.HF_TOKEN}`;
    }

    // Chama o backend FastAPI no Hugging Face
    const spaceResponse = await fetch(HF_CHAT_ENDPOINT, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_input: userInput }), // Encaminha o corpo da requisição
    });

    const responseData = await spaceResponse.json();
    console.log("Proxy: Resposta recebida do Space:", responseData);

    // Repassa a resposta e o status do Space diretamente para o front-end
    res.status(spaceResponse.status).json(responseData);

  } catch (err) {
    console.error(`Proxy: Erro crítico ao contatar o Space em ${HF_CHAT_ENDPOINT}.`, err);
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
