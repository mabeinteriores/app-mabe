# Lembretes da Agenda de Obras

Regra: um dia antes de end (prazo final), a partir de 08:00 America/Sao_Paulo. O agendador verifica a cada 10 minutos; cadastros feitos depois das 08:00 podem receber no mesmo dia. Nao envia atrasados nem concluidos.

Usa responsibleKey salvo pelo seletor: usuario:<uuid> ou terceiro:<id>. Usuarios precisam estar ativos e aprovados; terceiros ativos e habilitadosObra=true. Email vem do cadastro atual, nunca de um campo livre na tarefa. Etapas antigas sem vinculo precisam selecionar novamente o responsavel.

O provedor existente Resend usa a chave no Vault resend_camber; nenhum segredo foi copiado. Payload fixo por lembrete e Idempotency-Key previnem duplicacao durante retries no mesmo dia (https://resend.com/docs/dashboard/emails/idempotency-keys). A tabela agenda_email_log registra ate 6 tentativas, HTTP e aceitacao pelo provedor, nao entrega na caixa postal. Apenas o agendador tem acesso, com RLS e privilegios revogados para anon/authenticated.

setup.sql prepara a rotina desativada. Ativacao: select cron.alter_job((select jobid from cron.job where jobname='agenda-lembrete-conclusao'),active:=true);
Pausa: mesma chamada com active:=false.
Simulacao sem envios: select public.agenda_send_reminders(true);

Verificado: fixtures retornaram 2 elegiveis de 7 tarefas (excluiu concluida, outra data, inativo, fornecedor bloqueado e nome antigo sem ID). Dry-run real: 0 elegiveis. Nenhum email de teste enviado. Seguranca: anon nao executa rotina; authenticated nao le registros. Advisory INFO de RLS sem policies nesta tabela e intencional (registro restrito ao servidor). Avisos preexistentes em outras funcoes nao foram alterados; referencia https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable.
