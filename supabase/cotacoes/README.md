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

Backend: esta pasta (`schema.sql`, `module-v2.sql`, `central.sql`, `index.ts`, `validation.mjs`). Testes: `tests/cotacoes.mjs`, `test-central.sql`, `tests/cotacoes-http.mjs`.

## Testes realizados

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
