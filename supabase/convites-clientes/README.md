# Convites de clientes e fornecedores

As telas públicas de cadastro e as funções de resposta validam o documento (incluindo dígitos verificadores), e-mail, telefone brasileiro com DDD, CEP e UF. O CNPJ aceita números ou letras nas 12 primeiras posições; os dois últimos dígitos são numéricos. O fornecedor precisa selecionar serviços presentes no catálogo do escritório. A validação de formato não verifica a titularidade nem a situação fiscal.

**Instalação:** depois dos esquemas de convites e anexos, aplique `validacao-convites.sql` em uma transação. A migração preserva dentro do banco a configuração existente das notificações e não dispara envios. Não altera cadastros anteriores. Publique os arquivos HTML e JavaScript correspondentes juntos.

**Testes:** `node tests/convites-validacao.cjs`, `node tests/convites-finalizacao.cjs` e `test-validacao.sql`. Este último testa a validação e a integração das duas funções sem enviar convites ou notificações. Testes de resposta válida devem usar ambiente isolado com entrega de e-mail simulada.
