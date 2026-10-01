# Compatibilidade de identificadores — 01/10/2026

## Problema

O botão Nova cotação falhava antes de abrir o formulário quando o navegador não
disponibilizava `crypto.randomUUID`. A mesma chamada existia na validação de campos,
nos anexos e na resposta do fornecedor.

## Correção

`CamberQuotes.uuid()` usa a função nativa quando disponível e, caso contrário,
gera UUID v4 com `crypto.getRandomValues`, preservando a fonte criptográfica.
Os fluxos de cotação usam esse gerador compartilhado. Os endereços dos scripts
alterados receberam nova versão para renovar o cache.

## Verificação

- `node tests/cotacoes-uuid.cjs`: função nativa, ausência/função inválida,
  formato/versão/variante, 10.000 identificadores distintos e mensagem orientativa
  quando não existe uma fonte criptográfica disponível.
- `node tests/cotacoes.mjs`: 35 validações aprovadas.
- `node tests/cotacoes-clientes.cjs`: 30 verificações e leitura paginada aprovadas.
- Verificação de sintaxe dos quatro scripts alterados.
- Navegador, com `crypto.randomUUID` deliberadamente indisponível em página local
  isolada: abrir Nova cotação, validar campo obrigatório, fechar e abrir dentro
  do cliente, selecionar oportunidade com cotação ativa, continuar, preencher
  itens, selecionar dois fornecedores e chegar à revisão.
- Envio simulado capturou um UUID v4 válido e o pedido completo, sem erro JavaScript.
  A chamada foi interceptada por uma API de teste; não houve gravação no banco,
  criação de cotação real nem envio de e-mail nesta validação.

Este teste verifica a compatibilidade do navegador e o fluxo do formulário;
não representa uma nova validação de persistência no servidor.
