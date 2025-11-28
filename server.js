// server.js - Proxy J.A.D.E. v4.0 (Suporte a Arquivos Binários)
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 10000;

const HF_SPACE_URL = 'https://madras1-jade-port.hf.space';

// Configuração CORS
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Limite alto para uploads
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Proxy Online & Ready for Files', target: HF_SPACE_URL });
});

app.get('/', (req, res) => {
  res.send('J.A.D.E. Proxy Active');
});

// Tratamento de OPTIONS (Preflight)
app.options('*', (req, res) => {
    res.sendStatus(204);
});

// ==================================================================
// O TUNEL INTELIGENTE (JSON + ARQUIVOS)
// ==================================================================
app.all('*', async (req, res) => {
  if (req.path === '/' || req.path === '/health') return;

  const targetUrl = HF_SPACE_URL + req.path;
  const method = req.method;

  console.log(`➡️ [Proxy] ${method} -> ${targetUrl}`);

  try {
    const fetchOptions = {
      method: method,
      headers: { 
        // Não forçamos Content-Type aqui para GET, pois arquivos não têm body de ida
      },
    };

    // Só adiciona Content-Type e Body se for envio de dados (POST/PUT)
    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    // 1. Chama o Hugging Face
    const hfResponse = await fetch(targetUrl, fetchOptions);
    
    // 2. Copia os headers importantes da resposta (Tipo do arquivo, tamanho, etc)
    // Isso diz ao navegador se é um PDF, um MP3, etc.
    const contentType = hfResponse.headers.get('content-type');
    const contentLength = hfResponse.headers.get('content-length');
    
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    console.log(`⬅️ [Proxy] Recebeu: ${contentType} | Status: ${hfResponse.status}`);

    // 3. DECISÃO INTELIGENTE: É JSON ou Binário?
    if (contentType && contentType.includes('application/json')) {
        // Se for JSON (chat), lemos como objeto
        const data = await hfResponse.json();
        res.status(hfResponse.status).json(data);
    } else {
        // Se for ARQUIVO (PDF, Áudio, Imagem), lemos como ArrayBuffer e mandamos bruto
        const arrayBuffer = await hfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.status(hfResponse.status).send(buffer);
    }

  } catch (err) {
    console.error(`❌ [Erro Proxy]:`, err);
    // Se der erro, tentamos responder JSON, a menos que os headers já tenham sido enviados
    if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno no Proxy', details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Proxy v4 rodando na porta ${PORT}`);
});
