const express = require('express');
const path = require('path');
const rewrites = require('./rewrites.json'); // Importa as regras

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, '/')));

rewrites.forEach(rewrite => {
  app.get(rewrite.source, (req, res) => {
    res.sendFile(path.join(__dirname, rewrite.destination));
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});