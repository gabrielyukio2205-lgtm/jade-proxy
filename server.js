// server.js - Proxy J.A.D.E. v3.1 (Debug Mode & CORS Fix)
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 10000;

// URL base do Backend
const HF_SPACE_URL = 'https://madras1-jade-port.hf.space';

// 1. Configuração CORS Permissiva (Para o frontend não reclamar)
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Aumentar limite de payload
app.use(express.json({ limit: '50mb' }));

// 3. Rota de Saúde
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Proxy Online', target: HF_SPACE_URL });
});

app.get('/', (req, res) => {
  res.send('J.A.D.E. Proxy Active');
});

// ==================================================================
// 4. O BLOQUEIO DE OPTIONS (A VACINA PRO ERRO 405)
// ==================================================================
// Se o navegador perguntar "Posso mandar?", o Proxy responde "SIM" imediatamente
// e NÃO incomoda o Hugging Face com isso.
app.options('*', (req, res) => {
    res.sendStatus(204);
});

// ==================================================================
// 5. O TUNEL (POST/GET)
// ==================================================================
app.all('*', async (req, res) => {
  // Ignora o que já tratamos
  if (req.path === '/' || req.path === '/health') return;

  // Monta a URL. 
  // DICA DE OURO: Às vezes o HF precisa da barra no final se for diretório, 
  // mas para API REST geralmente não. Vamos logar pra ver.
  const targetUrl = HF_SPACE_URL + req.path;
  const method = req.method;

  console.log(`➡️ [Tentativa] ${method} para: ${targetUrl}`);

  try {
    const fetchOptions = {
      method: method,
      headers: { 
        'Content-Type': 'application/json' 
      },
    };

    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const hfResponse = await fetch(targetUrl, fetchOptions);
    
    // LOG DO STATUS REAL DO HUGGING FACE
    console.log(`⬅️ [Resposta HF] Status: ${hfResponse.status}`);

    if (!hfResponse.ok) {
        // Se der erro (405, 500, etc), vamos ler o texto pra saber o motivo
        const errorText = await hfResponse.text();
        console.error(`❌ [Erro Detalhado HF]: ${errorText.substring(0, 200)}`);
        res.status(hfResponse.status).send(errorText);
        return;
    }

    const data = await hfResponse.json();
    res.status(hfResponse.status).json(data);

  } catch (err) {
    console.error(`❌ [Erro Proxy]:`, err);
    res.status(500).json({ error: 'Erro interno no Proxy', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy rodando na porta ${PORT}`);
});
