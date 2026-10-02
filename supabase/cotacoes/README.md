# Cotações e compras Camber

Implementação integrada ao aplicativo existente (HTML/JS, GitHub Pages, Supabase). Sem envio automático de e-mail ou WhatsApp. Links são compartilhados manualmente.

## Uso

1. Abra **Cotações → Nova cotação** e escolha um projeto e uma oportunidade. Também é possível criar a oportunidade com cotação pelo botão de nova oportunidade no projeto.
2. Defina título, prazo, estimativa, cômodos/grupos, itens e quantidades. Modelo padrão e pedido personalizado permitem anexar o projeto.
3. Selecione os fornecedores; aparecem apenas os ativos que têm o serviço da oportunidade cadastrado. Revise e crie.
4. Compartilhe cada link individual. O fornecedor preenche preço unitário, prazo por item, desconto percentual, frete, montagem, datas, pagamento, validade e observações. Pode anexar PDF, salvar rascunho ou recusar participação.
5. O total é recalculado no servidor. A proposta recebida aparece na cotação e atualiza o fornecedor na oportunidade. No Kanban, os contadores consultam a mesma fonte da central, a cada minuto enquanto a página estiver visível. Não há recarga automática da página.
6. Use as abas da cotação para comparar valores e prazos, consultar documentos/histórico e solicitar revisão. Cada envio tem versão imutável; uma revisão cria a próxima versão. O link continua o mesmo até expirar ou encerrar.
7. Selecione explicitamente uma proposta recebida e confirme os termos. As demais ficam como não selecionadas, sem exclusão. Gere o pedido de compra, que referencia a versão escolhida e aproveita seus itens, valores, datas e condições. A geração não envia pedido ao fornecedor nem efetua pagamento.

## Central e integrações

### Conversão pelo Kanban

Ao arrastar uma oportunidade de Prospecção ou Montando Orçamento para Proposta, a pergunta **Deseja transformar em cotação?** oferece Sim e Não. Não apenas move o cartão. Sim cria uma cotação para o fornecedor indicado, vinculada ao mesmo projeto e, pela central existente, ao mesmo cliente. Com vários fornecedores, a favorita vem selecionada e pode ser trocada; sem fornecedor, somente a movimentação sem cotação está disponível. Fechar a pergunta cancela a movimentação.

`proposal-quotation.sql` acrescenta uma RPC `SECURITY INVOKER`, executável apenas pelo servidor. A ação autenticada `proposal_quotation` valida cargo, etapa original, versão do fornecedor, cadastro ativo e compatibilidade de serviço. O lock do projeto e a transação tornam criação/movimentação atômicas; repetição e cotação aberta do mesmo fornecedor são reaproveitadas. Histórico e probabilidade são preservados. Cadastros legados só são vinculados quando o nome identifica um único fornecedor.

Uma cotação nova aproveita título/escopo da oportunidade, inclui um item global do serviço com quantidade 1 e prazo inicial de 14 dias (Brasília), ficando **Aguardando compartilhamento**. Não envia e-mail nem escolhe vencedor. Se a atualização da tela falhar após a gravação, o botão tenta somente atualizar, sem repetir a criação.

Verificação: `tests/oportunidade-cotacao.cjs` cobre 25 combinações de etapa, Sim/Não, favorito/legado e movimentos simultâneos na interface. `test-proposal-quotation.sql` cobre criação e reutilização reais em transação com rollback, escolha de fornecedor alternativo, validações e permissões. Teste visual isolado cobre arraste das duas origens, escolha do destinatário e recuperação de falhas antes/depois da gravação.

Instalação incremental: aplicar `proposal-quotation.sql` depois dos scripts existentes, publicar a nova versão de `camber-quotes` e os arquivos de interface. Não altera as rotinas de criação manual de cotações.

- Indicadores, alertas clicáveis, busca e filtros por projeto, cliente, oportunidade/categoria, responsável, fornecedor, estado e datas.
- Ações em lote para links/lembretes manuais, prazo, encerramento e CSV. Apenas ações compatíveis são oferecidas. Se uma operação em lote falhar, as anteriores já concluídas permanecem salvas; atualizar a lista antes de repetir.
- Situações automáticas: aguardando, parcialmente respondida, pronta para comparar e vencida. Situações manuais: rascunho, aguardando compartilhamento, em cotação, encerrada e cancelada. Negociação é ativada por solicitação de revisão.
- O badge lateral conta cotações com pendência, não o total. É consultado na abertura da página.
- Uma oportunidade pode ter várias cotações; cada uma exibe seus próprios contadores. Não se somam preços concorrentes no painel financeiro existente.
- RT é informação interna. O comparativo central mostra a RT cadastrada para administradores; o portal externo não recebe RT, margem ou concorrentes. Valor cliente/margem aparecem como não cadastrados quando inexistentes, sem inventar resultados.
- Compras tem lista, detalhe, documentos e impressão/PDF. Aprovações, pagamentos e logística são etapas futuras; os pedidos são criados aguardando aprovação.

## Banco e alterações incrementais

Aplicar os scripts na ordem, preferencialmente numa transação única:

1. `schema.sql`: solicitações individuais, arquivos privados e função base.
2. `module-v2.sql`: cotações, participantes ligados à cotação, rascunhos com revisão, versões imutáveis, eventos e preparação da escolha por item.
3. `central.sql`: numeração, projeção única de contadores, estados, estimativa, rodadas, seleção e pedidos de compra vinculados à versão escolhida.
4. `central-page.sql`: leitura paginada, filtros, ordenação, facetas e indicadores, sempre sobre a projeção existente. Não cria tabelas ou índices.
5. `kanban-participants.sql`: atualiza a projeção de participantes com resposta/pendência por fornecedor. Aplicar depois de `central.sql`; mantém a função exclusiva do servidor. Participantes retirados, recusados ou cancelados deixam a contagem atual, com histórico preservado.

O CLI não estava instalado; os scripts SQL incrementais foram aplicados diretamente e são a fonte versionada desta entrega. Não foi criada uma sequência fictícia de migrations do CLI.

Projetos, oportunidades e fornecedores continuam em `kv_store`. Não se criaram tabelas concorrentes para esses cadastros. As tabelas preexistentes `propostas`/`proposta_comodos` são de orçamento de projeto ao cliente (área/m²), não de concorrência de fornecedores; foram preservadas. IDs dos fornecedores são os do cadastro atual. Nomes e especificações nas solicitações são snapshots históricos, não novos cadastros.

`camber_quotation_summary()` é a projeção comum da central, do detalhe e dos cards. Contadores não são campos manuais. Pedidos de compra usam FK para a versão escolhida em vez de copiar valores editáveis. `camber_quote_item_selections` prepara seleção por item; `camber_purchase_orders` prepara datas confirmadas, entrega parcial/completa, recebimento, instalação, eventos, fotos/documentos futuros.

## Publicação e segurança

- Publicar Edge Function `camber-quotes` com `index.ts` e `validation.mjs` (Supabase JS 2.45.4 fixo). `verify_jwt=false` é necessário para o portal sem login; a própria função valida o usuário com `getUser` nas ações internas e valida o token individual nas ações públicas.
- Tabelas novas têm RLS habilitada, privilégios diretos revogados de `anon`/`authenticated` e RPCs `SECURITY INVOKER`, exclusivas de `service_role`. O acesso interno exige perfil ativo, aprovado e permissão Projetos ou administrador.
- Bucket `camber-cotacoes` privado; download assinado por cinco minutos. O fornecedor acessa apenas sua própria solicitação, com token UUID aleatório no fragmento e `no-referrer`. Links inválidos, vencidos, cancelados ou desclassificados não permitem gravação.
- Limites: 100 itens e 100 participantes por cotação, 10 anexos de projeto de 25 MB por solicitação, um PDF por versão, validade até 90 dias. Não há serviço de e-mail nem serviço pago adicional.
- Locks no projeto e na solicitação serializam mudanças; revisão de rascunho rejeita edição concorrente; submissões repetidas e geração de compra são idempotentes.
- Os avisos informativos “RLS Enabled No Policy” nas novas tabelas são intencionais: acesso somente pelo servidor, nenhuma política pública permissiva. Avisos antigos em outras funções/Auth não pertencem a esta alteração. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Arquivos

Frontend: `cotacoes.html`, `compras.html`, `cotacoes-central.js`, `cotacoes-wizard.js`, `cotacoes-model.js`, `cotacoes-shared.js`, `cotacoes-office.js`, `cotacoes-opportunity.js`, `cotacoes-badge.js`, `cotacoes.css`, `responder-proposta.html/js`.

Integração: `cloud.js` (permissões e atualização explícita), `shell.js` (menu), `projeto.html`, `oportunidade-propostas.js`; demais páginas receberam somente atualização da versão dos scripts comuns.

## Exclusão de oportunidades

- **Excluir** aparece no cartão, na tabela e no detalhe da oportunidade. A confirmação identifica serviço e projeto e informa os vínculos encontrados.
- `opportunity-delete.sql` adiciona a função `camber_opportunity_delete`, `SECURITY INVOKER`, executável somente por `service_role`. O Edge valida a sessão; a função exige perfil aprovado e ativo com permissão Projetos ou administrador.
- A prévia fornece uma versão da oportunidade e das cotações. A exclusão confirma essa versão sob o mesmo lock de projeto das demais operações de cotação; alterações concorrentes exigem nova confirmação.
- A transação remove somente a oportunidade escolhida, recalcula o resumo do projeto, cancela as cotações e encerra os links associados. Preserva respostas, arquivos e eventos. O gatilho existente `kv_store_snapshot` mantém a versão anterior dos dados.
- Fornecedor escolhido ou pedido de compra impede a exclusão. Nenhum e-mail é enviado. Repetir uma solicitação já concluída não duplica eventos.
- No navegador, a lista só é atualizada após a confirmação do servidor. Se a exclusão funcionar e a atualização falhar, a interface oferece atualizar a lista sem repetir a exclusão.
- `test-opportunity-delete.sql` valida exclusão pontual, resumo, conflito de versão, vínculos, proteção de seleção/compra, acesso e repetição dentro de uma transação com rollback. A validação visual usa uma obra fictícia local; nenhuma oportunidade comercial é excluída nos testes.

A verificação de segurança não apontou a nova função. Alertas anteriores de funções legadas e Auth permanecem fora deste ajuste; as tabelas de cotações acessadas apenas pelo servidor mantêm a configuração documentada acima. Referência do verificador: https://supabase.com/docs/guides/database/database-linter.

Backend: esta pasta (`schema.sql`, `module-v2.sql`, `central.sql`, `index.ts`, `validation.mjs`). Testes: `tests/cotacoes.mjs`, `test-central.sql`, `tests/cotacoes-http.mjs`.

## Testes realizados

- Remoção individual de fornecedor: `remove-supplier.sql` adiciona a função `camber_remove_supplier`, chamada pela ação autenticada `remove_supplier`. A confirmação remove somente a participação, preserva o cadastro e o histórico, desativa todas as rodadas do fornecedor e recalcula a referência e os totais. Seleção ou compra bloqueiam a remoção. O servidor valida permissão e versão da oportunidade, com repetição idempotente. Testes de modelo e PostgreSQL local cobrem favorito, último fornecedor, legado, concorrência, permissões e rollback.

- Validações de preços unitários, quantidade, desconto, datas, confirmação, fuso horário, fornecedores elegíveis e diferença percentual.
- Teste transacional real com rollback: ALBORNOZ JORDAO ADVOGADOS ASSOCIADOS / Marcenaria / Atual Design, Finger, SCA → **3 convidados, 2 propostas recebidas, 1 aguardando**. Central e detalhe retornam a mesma projeção usada pelos cards.
- Negociação, versões imutáveis, escolha, compra idempotente, rascunhos concorrentes, permissão e serviço incompatível.
- Navegador: criação guiada com três fornecedores, lista lateral de selecionados e remoção, filtro excluindo fornecedor de Pisos, revisão, central, detalhe, comparação, confirmação de escolha e rodadas. Card e detalhe exibiram 3/2/1; a atualização dos contadores foi corrigida para não provocar um ciclo contínuo de renderização. Portal conferido em tela estreita.
- Portal contra banco real isolado: rascunho persistido e recuperado, proposta R$ 5.900; revisão R$ 5.540; anexo PDF privado e download assinado.
- HTTP: 10 reenvios simultâneos preservam a proposta; 10 rascunhos com a mesma revisão resultam em uma gravação e nove conflitos. Ações internas sem autenticação e token inválido bloqueados.
- Regressão: oportunidade-propostas, propostas-fornecedores-datas, refresh-loop e concurrency (31 verificações). Scripts internos das páginas alteradas também verificados.

Para repetir testes HTTP, crie uma fixture descartável no banco e forneça seu token pela variável `CAMBER_QA_TOKEN`. Nunca use uma cotação comercial real. O teste modifica a fixture e anexa um PDF de teste. Testes locais visuais usam dados fictícios e não são publicados. A cotação temporária e seu PDF foram removidos após autorização; as cotações comerciais foram preservadas.

## Próximas extensões previstas no pedido

Escolha de combinação por item, aprovações/pagamentos de compras, logística completa e painéis históricos têm estrutura preparada; sua interface completa não faz parte desta etapa, conforme as exceções do escopo. Notificações automáticas seguem desativadas por orientação do usuário.

## Atualização visual de 01/10/2026

### Criar cotação a partir do Kanban

Em **Projeto → Oportunidades comerciais → Prospecção → +**, a sequência passa a ser **Oportunidade → Fornecedores → Pedido → Revisão**. O projeto fica fixo e o cliente é herdado dele. A seleção apresenta somente fornecedores ativos com o serviço cadastrado. Trocar o serviço limpa a seleção anterior; atualizar o cadastro retira fornecedores que deixaram de ser elegíveis.

**Solicitar cotação** cria a oportunidade em Prospecção e uma única cotação com todos os participantes escolhidos, retornando ao Kanban com acesso aos links individuais. Pedido, itens, prazo e anexos continuam disponíveis. Não envia e-mail. A criação usa os mesmos identificadores ao repetir uma tentativa após falha, evitando duplicações. A criação de uma nova cotação para oportunidade existente mantém seu fluxo anterior.

Os cartões mostram nomes, situação individual, número de respostas, pendências e barra de progresso por cotação. Até três nomes ficam visíveis inicialmente; os demais podem ser expandidos. Respostas de rodadas anteriores não contam como resposta da revisão atual. Os totais vêm da mesma projeção da central.

Validação desta etapa: `tests/cotacoes-kanban.cjs`, regressões de modelo/clientes, testes visuais com três fornecedores e falha após salvar (uma cotação após duas tentativas), troca de serviço, fluxo anterior preservado, ausência de erros no console. `test-kanban-flow.sql` e `test-central.sql` passaram no banco em transações com rollback, cobrindo vínculo cliente/projeto, Prospecção, 3/2/1 participantes/respostas/pendências, repetição, retirada, histórico, negociação, seleção, compra e permissões. Testes PostgreSQL locais verificaram contagem durante nova rodada.

O último pedido menciona uma nova imagem de referência que ainda não foi recebida. Esta etapa reorganiza o processo e os cartões sobre o layout existente; a correspondência visual à nova imagem permanece pendente.

### Impressão da comparação

O botão **Imprimir comparação** no detalhe da cotação abre três modelos: tabela lado a lado, resumo comparativo e detalhado por fornecedor. Permite escolher participantes, A4 horizontal/vertical e comissão interna (desmarcada inicialmente, disponível apenas quando o servidor fornece os dados financeiros autorizados). **Gerar PDF** abre a impressão do navegador; escolha **Salvar como PDF** como destino.

O relatório usa uma cópia dos dados carregados, não envia e-mails nem altera a cotação. Tokens, links privados e scripts não entram no documento. Propostas antigas, inativas, canceladas e desclassificadas não participam dos destaques de preço/prazo. Comparações extensas dividem os fornecedores em grupos e mantêm condições longas em seção própria. Validação: `tests/cotacoes-impressao.cjs`, integração visual e PDFs de teste com 1, 2 e 5 páginas, incluindo sete fornecedores.

Layout adaptado à referência enviada: menu escuro com nomes, cards compactos, criação em quatro etapas com fornecedores selecionados à direita, comparativo com resumo lateral e portal com tabela de itens no computador e blocos no celular. Arquivos de apresentação: camber-layout.css, cotacoes-layout.css e cotacoes-layout.js. Mantém os mesmos contratos de gravação e autenticação.

Verificações desta atualização: navegação das abas dentro da oportunidade, comparação com participante aguardando, seleção e remoção de fornecedores, avanço do formulário e total de R$ 5.900,00, largura móvel sem rolagem horizontal da página, regressões existentes e sintaxe das páginas.
