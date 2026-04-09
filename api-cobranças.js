const express = require('express');
const sql = require('mssql');
require('dotenv').config();

const app = express();
const port = 3000;

// Configuração da conexão com o SQL Server
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false, // Desabilita TLS (muda de true para false)
    trustServerCertificate: true
  }
};

// Rota para consultar devedor e suas cobranças
app.get('/cliente/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, ''); // Remove caracteres não numéricos

  // Valida se CNPJ tem 14 dígitos
  if (cnpj.length !== 14) {
    return res.status(400).json({ 
      erro: 'CNPJ inválido. Deve conter 14 dígitos.' 
    });
  }

  let pool;
  try {
    // Conecta ao banco
    pool = await sql.connect(dbConfig);

    // QUERY 1: Busca dados do devedor e total de dívida da tabela TMP_ExpDevedor
    const queryDevedor = `SELECT IdDevedores, Nome, CNPJCPF, ValorTotal, QtdTitulos FROM TMP_ExpDevedor WHERE CNPJCPF = @cnpjInput`;

    const resultDevedor = await pool.request()
      .input('cnpjInput', sql.VarChar(14), cnpj)
      .query(queryDevedor);

    // Se não encontrou devedor, retorna erro
    if (resultDevedor.recordset.length === 0) {
      return res.status(404).json({ 
        erro: 'CNPJ não encontrado ou sem cobranças ativas.' 
      });
    }

    const devedor = resultDevedor.recordset[0];
    const idDevedor = devedor.IdDevedores;

    // QUERY 2: Busca todas as cobranças (títulos) do devedor da tabela TMP_ExpValor
    const queryCobrancas = `SELECT IdCobrancas, IdDevedores, DataVencimento, Valor FROM TMP_ExpValor WHERE IdDevedores = @IdDevedor ORDER BY DataVencimento ASC`;

    const resultCobrancas = await pool.request()
      .input('IdDevedor', sql.Int, idDevedor)
      .query(queryCobrancas);

    // Monta resposta estruturada
    const resposta = {
      devedor: {
        id: devedor.IdDevedores,
        nome: devedor.Nome,
        cnpj: devedor.CNPJCPF,
        valorTotal: devedor.ValorTotal,
        quantidadeTitulos: devedor.QtdTitulos
      },
      cobrancas: resultCobrancas.recordset,
      totalCobrancas: resultCobrancas.recordset.length
    };

    res.status(200).json(resposta);

  } catch (err) {
    console.error('Erro ao consultar banco:', err);
    res.status(500).json({ 
      erro: 'Erro ao processar requisição. Verifique os dados.' 
    });
  } finally {
    // Fecha a conexão
    if (pool) {
      await pool.close();
    }
  }
});

// Health check (opcional)
app.get('/health', (req, res) => {
  res.json({ status: 'API rodando normalmente' });
});

// Inicia servidor
app.listen(port, () => {
  console.log(`🚀 API de Cobranças rodando na porta ${port}`);
  console.log(`📍 Acesse: http://localhost:${port}/cliente/[CNPJ]`);
});