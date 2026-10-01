# Cotações por cliente — validação de 01/10/2026

## Comportamento

- A entrada de Cotações apresenta clientes com projetos, busca por cliente/projeto e filtro de clientes com cotações abertas.
- Cada cliente mostra seus projetos, cotações abertas, aguardando resposta, prontas para comparar, atrasos e valor estimado aberto.
- Dentro do cliente, a lista inicia em **Em aberto**. Todas/Encerradas preservam o acesso ao histórico do mesmo cliente.
- Filtros, contadores, seleção em lote e paginação usam somente as cotações do cliente escolhido.
- Nova cotação dentro do cliente oferece somente os seus projetos; o cadastro geral continua disponível na entrada.
- A identidade usa `clienteId` e o cadastro de clientes. Registros legados usam correspondência de nome único. Nomes ambíguos ficam separados por projeto.

## Correção do botão Continuar

A seleção inicial de projeto/oportunidade repetia a primeira etapa do assistente. Ela foi unificada em um único formulário. Campos obrigatórios, valores e datas inválidos agora recebem aviso textual e destaque. A verificação de cotação existente permanece antes do avanço. Erros de consulta liberam o botão para nova tentativa.

## Testes

- `node tests/cotacoes-clientes.cjs`: agrupamento de dois projetos do mesmo cliente, homônimos, vínculo legado, cliente sem cotações, 110 cotações, páginas além de 100 registros, filtros, contadores, ordenação e histórico; leitura incompleta/duplicada interrompida com mensagem para atualizar.
- `node tests/cotacoes.mjs`: 35 validações de valores, datas, elegibilidade, contadores e negociação.
- Navegador, com dados isolados: três clientes; cliente A com dois projetos e duas cotações; cliente B com 29 cotações e segunda página com quatro linhas; cliente sem cotações; Nova cotação restrita ao cliente; validação de projeto, oportunidade, prazo passado, valor negativo, cômodo em branco, quantidade zero, fornecedor obrigatório, falha de conexão e nova tentativa, aviso de cotação existente, revisão e montagem da solicitação com dois fornecedores.
- A criação no navegador isolado é interceptada antes da gravação. A criação real no banco foi validada separadamente com transação revertida, usando as permissões do serviço. Não foram enviadas mensagens ou e-mails.
- Layout verificado em tela estreita, com quadros empilhados e sem conteúdo cortado.

## Implementação e limite

Somente arquivos da interface foram alterados. Não há migração de banco nem mudança de permissões. O cadastro usa a sincronização de clientes já existente e consulta todas as páginas de cotações em lotes de 100. Em bases grandes, a carga inicial depende da quantidade de páginas; busca, agrupamento e paginação visual usam essa leitura completa. Atualizar busca novamente os dados. A tela interrompe a carga se a quantidade de registros mudar durante a leitura, evitando apresentar totais parciais.
