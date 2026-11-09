# Controles de cotações

Na central, abra o cliente e o menu **⋯** da cotação. Os mesmos controles aparecem no detalhe.

- **Pausar**: exige motivo e suspende gravação de propostas, rascunhos e anexos pelo fornecedor.
- **Retomar / reabrir**: define novo prazo (até 90 dias), preserva o token e as respostas; reativa o recebimento.
- **Cancelar**: exige motivo, fecha o recebimento e preserva registros.
- **Arquivar**: disponível para encerradas/canceladas, inclusive quando já existe seleção. Fica em Arquivadas.
- **Excluir cotação** move a cotação escolhida para a Lixeira do cliente. Os links de fornecedores ficam suspensos. Propostas, anexos, histórico e pedidos de compra continuam vinculados.
- **Restaurar cotação** na Lixeira devolve a cotação à situação em que estava. Uma cotação aberta volta a aceitar respostas dentro do prazo original. Quando a oportunidade já foi excluída, a cotação volta ao histórico como cancelada.

Pausadas, Canceladas, Arquivadas e Lixeira têm filtros próprios. Uma cotação com fornecedor escolhido ou pedido de compra também pode ser movida para a Lixeira e restaurada.

## Instalação

Aplicar `quotation-control.sql` e `opportunity-delete.sql` após os scripts existentes. A coluna `trash_previous` guarda a situação anterior à exclusão para permitir a restauração.

Publicar a proteção de `control_state` no serviço `camber-quotes`, depois os arquivos da interface com versão `control1`. A conversão de oportunidade em cotação é outra alteração, independente deste módulo.

A ação existente `workflow` recebe `state`, `expectedVersion`, `mutationId` e, conforme a ação, `reason` ou `expiresAt`. Um lock por projeto e lock da linha serializam alterações. Versões divergentes são rejeitadas; repetição do mesmo identificador não duplica o histórico. O servidor valida as restrições independentemente dos botões.

## Validação

- `node tests/cotacoes-control.cjs`: ações por estado, proteção de fornecedor escolhido, lixeira, filtros e totais.
- `node tests/cotacoes-clientes.cjs`: agrupamento de clientes, paginação, filtros e KPIs.
- `node tests/cotacoes.mjs`: valores, datas, permissões de participação e contadores.
- Executar `begin;`, o instalador, `test-quotation-control.sql` e `rollback;` para teste completo sem dados persistentes. Testa pausa, bloqueio de gravações pelo fornecedor, retomada com o mesmo token e rascunho, cancelamento, arquivamento, restauração, lixeira, propostas recebidas, seleção, conflito de versão e acesso direto negado.
- Navegador: lista real e controles reais com API simulada, sem conexão ao banco. Testa pausa, retomada, filtros e lixeira/restauração.

Nenhuma mensagem é enviada por esta funcionalidade.
