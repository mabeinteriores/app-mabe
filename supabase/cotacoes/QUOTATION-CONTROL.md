# Controles de cotações

Na central, abra o cliente e o menu **⋯** da cotação. Os mesmos controles aparecem no detalhe.

- **Pausar**: exige motivo e suspende gravação de propostas, rascunhos e anexos pelo fornecedor.
- **Retomar / reabrir**: define novo prazo (até 90 dias), preserva o token e as respostas; reativa o recebimento.
- **Cancelar**: exige motivo, fecha o recebimento e preserva registros.
- **Arquivar**: disponível para encerradas/canceladas, inclusive quando já existe seleção. Fica em Arquivadas.
- **Mover para a lixeira**: apenas rascunhos sem respostas ou versões recebidas. Exclusão recuperável, sem apagar arquivos.
- **Restaurar**: recupera a situação anterior, mantendo o recebimento fechado. Rascunho restaurado pode ser reaberto com novo prazo.

Pausadas, Canceladas, Arquivadas e Lixeira têm filtros próprios. Arquivadas e Lixeira não aparecem em Todas. Valores e alertas em aberto não incluem cotações suspensas. A existência de fornecedor escolhido ou compra impede cancelamento, pausa e lixeira.

## Instalação

Aplicar `quotation-control.sql` numa transação após os scripts existentes. O arquivo atualiza três funções existentes (`SECURITY INVOKER`) e acrescenta quatro campos de controle à tabela de cotações. Mantém os privilégios atuais, RLS e autenticação; não instala novas funções ou concede permissões. Não modifica registros comerciais na instalação.

Publicar a proteção de `control_state` no serviço `camber-quotes`, depois os arquivos da interface com versão `control1`. A conversão de oportunidade em cotação é outra alteração, independente deste módulo.

A ação existente `workflow` recebe `state`, `expectedVersion`, `mutationId` e, conforme a ação, `reason` ou `expiresAt`. Um lock por projeto e lock da linha serializam alterações. Versões divergentes são rejeitadas; repetição do mesmo identificador não duplica o histórico. O servidor valida as restrições independentemente dos botões.

## Validação

- `node tests/cotacoes-control.cjs`: ações por estado, proteção de fornecedor escolhido, lixeira, filtros e totais.
- `node tests/cotacoes-clientes.cjs`: agrupamento de clientes, paginação, filtros e KPIs.
- `node tests/cotacoes.mjs`: valores, datas, permissões de participação e contadores.
- Executar `begin;`, o instalador, `test-quotation-control.sql` e `rollback;` para teste completo sem dados persistentes. Testa pausa, bloqueio de gravações pelo fornecedor, retomada com o mesmo token e rascunho, cancelamento, arquivamento, restauração, lixeira, propostas recebidas, seleção, conflito de versão e acesso direto negado.
- Navegador: lista real e controles reais com API simulada, sem conexão ao banco. Testa pausa, retomada, filtros e lixeira/restauração.

Nenhuma mensagem é enviada por esta funcionalidade.
