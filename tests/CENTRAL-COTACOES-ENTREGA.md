# Central de Cotações — atualização de 01/10/2026

A central é uma visão dos registros existentes, vinculados às oportunidades. Não foram recriados fornecedores, propostas, tokens, comparativos, RT, histórico ou formulários externos. Nenhum envio de e-mail foi ativado.

## Resultado

- Seis indicadores gerais, busca por cotação/projeto/cliente/oportunidade/fornecedor, filtros avançados e filtros rápidos.
- Tabela com colunas separadas, iniciais dos fornecedores, nome ao focar/apontar, progresso de respostas e uma indicação de atenção por linha.
- Ordenação por atenção, prazo, projeto, valor, respostas, status e criação, com inversão da ordem.
- Paginação no servidor, de 25, 50 ou 100 registros. Totais e indicadores consideram todos os registros, independentemente da página. Os filtros restringem a listagem; os indicadores do topo representam a central inteira.
- Clique na linha ou no menu de ações abre a rota já existente `cotacoes.html?id=...`, incluindo fornecedores e comparação. Alterar prazo, encerrar e compartilhar links usam as funções existentes.
- O botão Nova cotação escolhe um projeto e uma oportunidade existentes. Havendo cotação aberta, oferece abrir a existente ou criar outra; a arquitetura já aceita múltiplas solicitações por oportunidade. O contexto escolhido é mantido no assistente existente.
- No celular, cada cotação aparece como cartão. No tablet, fornecedores e valor são colunas secundárias ocultas; continuam disponíveis no detalhe.
- Menu Cotações entre Projetos e Fornecedores; Oportunidades continua dentro de Projetos. Não foram inventados módulos ou rotas para Produtos/Financeiro/Relatórios.
- Uma cotação completamente respondida não fica vencida apenas porque a data passou. Alertas de prazo exigem respostas pendentes. O badge ignora encerradas/canceladas e solicita apenas o resumo.

## Arquivos e componentes

- Novos `cotacoes-list.js` e `cotacoes-list.css`: componente `CamberQuotes.CentralList`, tabela/cartões, menu contextual, busca, filtros e paginação. Avatares reutilizam `CamberQuotes.avatar`.
- `cotacoes-central.js`: integra o componente de lista, reutiliza ações e detalhe, adiciona escolha de contexto com aviso de cotação ativa.
- `cotacoes-model.js`: regras compartilhadas de alerta e prazo pendente.
- `cotacoes-wizard.js`: opção de manter fixos projeto/oportunidade escolhidos pela central, sem recriar o assistente.
- `cotacoes-badge.js` e `shell.js`: resumo de atenção e posição no menu.
- `cotacoes.html`: carrega o componente. As demais páginas só receberam versão atualizada dos scripts compartilhados para invalidar o cache.
- `supabase/cotacoes/central.sql`, `central-page.sql` e `README.md`: projeção, leitura paginada e documentação.
- `tests/cotacoes.mjs`, `supabase/cotacoes/test-central.sql` e `test-central-volume.sql`: verificações executáveis.

## Consultas e migration

Migration aplicada: `central_cotacoes_paginacao_e_alertas`.

Atualiza somente funções: a projeção existente `camber_quotation_summary`, o encaminhamento de `dashboard` em `camber_quotes_api` e a nova função de leitura `camber_quotation_page(payload)`. A chamada antiga sem `page` mantém seu contrato, usado nas oportunidades. Nenhuma tabela, cadastro, versão de proposta ou índice foi recriado.

`dashboard` com `page/pageSize/filters/quick/sort/direction` retorna `rows/total/page/pageSize/facets/kpis`. `summaryOnly:true` retorna apenas indicadores. A central usa uma consulta por página, sem consulta individual por linha. As especificações e tokens não são enviados na listagem. O SQL ainda calcula os indicadores sobre a projeção completa, materializada uma vez por consulta; não existe cache persistido ou duplicação de dados. Os índices de participantes por cotação já existiam.

Permissões: `SECURITY INVOKER`, execução exclusiva de `service_role`, autenticação e perfil interno aprovado/ativo verificados pela API existente. `anon` e `authenticated` não executam a função diretamente. O fornecedor externo usa somente seu portal por token.

O Advisor não apontou exposição nas novas funções. As tabelas internas permanecem com RLS sem políticas públicas e privilégios revogados, de forma intencional. Há avisos anteriores em funções de outros módulos e na proteção de senhas; não foram alterados nesta tarefa. Referências de diagnóstico: [funções públicas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [políticas de RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Validação

- 35 validações de valores, datas, consentimento, fuso, contadores, alertas e elegibilidade aprovadas.
- Regressões de oportunidades/propostas, filtro de fornecedores/datas e recarga contínua aprovadas.
- SQL transacional: ALBORNOZ / Marcenaria / R$ 180.000 / Atual Design, Finger e SCA / 3 convidados, 2 recebidas, 1 aguardando. Central, detalhe e projeção retornam os mesmos contadores. Busca por cliente, fornecedor e termo sem acento, paginação, ordenação, prazo sem pendências, restrição de acesso, negociação, histórico e compra idempotente passaram.
- Volume: 1.000 cotações sintéticas e 3.000 participantes; página de 25 registros, limite máximo de 100 e página fora do intervalo corrigida. Consulta de página abaixo de 5 segundos no teste de banco. É uma verificação funcional pontual, não uma medição de carga simultânea. Todos os dados foram revertidos por rollback.
- Navegador com dados isolados: paginação de 30 registros, busca ALBORNOZ, menu de ações, abertura do comparativo existente, aviso de cotação ativa, assistente com contexto fixo, cartões no celular sem transbordamento horizontal e compartilhamento manual de links.

## Como testar

1. Entre no app com um usuário interno habilitado e abra Cotações.
2. Crie uma cotação vinculada a um projeto/oportunidade e compartilhe os links manualmente, se desejar receber respostas reais.
3. Busque pelo cliente ou fornecedor; experimente os filtros, ordenação e tamanho da página.
4. Abra a linha ou o menu “⋯” e confira os fornecedores e o comparativo. Confirme os mesmos números na oportunidade.
5. Clique em Nova cotação e escolha novamente a oportunidade: o aviso deve oferecer a cotação existente.
6. No celular, confira os cartões e o botão de ações.

O ambiente real não foi preenchido com exemplos. Propostas manuais anteriores continuam em suas oportunidades e não se transformam automaticamente em solicitações de cotação novas. Os cenários de teste foram isolados e revertidos.
