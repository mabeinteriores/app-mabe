# Indicações reais — 19/09/2026

## Uso

Abra `indicacoes.html`. Atendimento, Funil, Parceiros e links e Comissões usam os dados reais de `mabe_ind`. A demonstração continua isolada em `indicacoes-demo.html`.

1. Em **Parceiros e links**, crie o link do corretor e copie o endereço. Criar novamente mantém o mesmo link. Substituir invalida o anterior; desativar interrompe novos envios.
2. O corretor abre `indicar.html?token=...`, informa cliente, telefone, e-mail opcional e autorização para contato. A origem é definida no servidor, nunca por um ID editável no formulário.
3. A equipe abre a fila, atribui um usuário ativo, status e próxima ação/data. Ações vencidas aparecem destacadas. A ficha mostra contato, contexto e histórico. Arquivar é reversível.
4. Ao fechar, informe o valor; a taxa de comissão é congelada conforme as regras existentes. O acesso à precificação permanece disponível. Somente administradores podem liberar/registrar uma comissão paga; a referência do pagamento é obrigatória. Isso não transfere dinheiro.
5. A gestão anterior de parceiros, cadastro manual, regras e bônus permanece acessível pelo link superior.

## Implantação

Projeto Supabase: `vlvadvlfsbgwcldaxhah`. `setup.sql` é o script idempotente aplicado por `execute_sql` e versionado aqui para reprodução. A função `camber-referrals` usa `index.ts` com `verify_jwt=false` porque lookup/submit são públicos. As ações internas validam o JWT por `auth.getUser`, perfil ativo/aprovado e acesso à aba; o banco repete a autorização. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis automáticas do ambiente da função, nunca publicadas no cliente.

As tabelas `referral_links` e `referral_limits` têm RLS e nenhum acesso anon/authenticated. As funções SQL são SECURITY INVOKER e executáveis somente por service_role. A ausência de políticas nessas tabelas é intencional. O frontend usa somente a chave publicável.

O registro canônico continua em `kv_store` para manter compatibilidade. Escritas da nova API bloqueiam a linha durante uma transação curta. Atualizações da ficha conferem revisão; o gatilho também incrementa a revisão para alterações pelo sistema anterior e bloqueia novas duplicidades de telefone/e-mail. Nenhum dado de demonstração é importado. Testes de banco usam transação com ROLLBACK, incluindo o histórico automático existente.

## Proteções e limites

- Link UUID aleatório, revalidação do corretor e da ativação durante o envio; resposta pública contém somente corretor/imobiliária.
- Limite de 20 tentativas de envio por hora por identificador derivado do IP informado pela infraestrutura; formulário com campo antiautomação. Isso é proteção básica, não substitui CAPTCHA/WAF se houver abuso distribuído.
- Idempotência por envio e normalização do telefone; duplicatas por telefone/e-mail retornam confirmação genérica ao público, sem revelar quem já está na base e sem criar novo registro. A origem existente é preservada.
- Toda entrada exibida no novo painel é escapada. Dados públicos rejeitam marcação HTML antes de alcançar as telas anteriores.
- Armazenamento e atendimento dependem da conexão; o formulário não promete envio offline. Um timeout pode ser repetido com o mesmo identificador.
- O modo localhost não autentica nem carrega os dados reais; use a demonstração ou fixture isolada para QA visual.
- Auditoria de links registra último autor/data, mas não histórico completo de rotações. A ficha registra autor, data e alterações de atendimento/financeiras.
- O painel não envia e-mails ou mensagens ao corretor/cliente. Comissões não têm upload de comprovante; usam referência textual.

## Validação executada

- `test.sql`: consentimento obrigatório, telefone inválido, rejeição de HTML, origem, repetição de envio, duplicidade telefone/e-mail, acesso sem autorização, revisão concorrente, histórico, taxa congelada, liberação/pagamento, arquivamento/restauração, desativação/rotação de link. Fixtures descartadas por rollback.
- HTTP: leitura interna sem JWT retorna 401; token público inválido retorna 400 sem dados internos.
- Navegador com fixture local e código real: abertura de ficha, alteração de status/responsável/ação, criação de link; visualização a 390 px sem rolagem horizontal do documento.
- Regressão: 19 verificações de indicações existentes e 29 verificações de concorrência simulada aprovadas. Estas últimas não representam um teste de carga em produção.
- Advisor Supabase: novas tabelas aparecem apenas como RLS sem políticas (intencional); avisos de funções antigas SECURITY DEFINER e proteção de senhas preexistem e não foram alterados neste escopo.

## Reversão

Para reverter apenas a interface, restaurar o iframe de `indicacoes.html` para `indicacoes-app.html`. Os dados permanecem no mesmo `mabe_ind`. Desativar os links pela interface interrompe recebimentos públicos sem excluir indicações. Não excluir tabelas para reverter o layout.
