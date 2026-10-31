# Levantamento de demonstrações nas fichas

O comando de manutenção abaixo consulta as fichas existentes em modo de leitura e produz apenas uma lista agregada de nomes de exercícios, frequência, nome correspondente e disponibilidade de imagens. Não altera fichas nem retorna nomes de alunos, e-mails, identificadores, títulos de treinos ou histórico.

Configure `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) e uma credencial administrativa `SUPABASE_SERVICE_ROLE_KEY` nas configurações seguras do ambiente. Não coloque a chave em arquivos versionados, no chat ou em variáveis `NEXT_PUBLIC_*`. A chave pública do navegador, sozinha, não permite analisar as fichas de todas as contas por causa do isolamento por usuário.

Use o proxy e a confiança TLS já configurados. Em Node 24:

```sh
cd /workspace/summer_treinos-2.0
NODE_USE_ENV_PROXY=1 node --experimental-strip-types scripts/audit-exercise-coverage.mjs
```

O domínio do projeto Supabase precisa estar permitido na rede do ambiente. Credenciais e acesso devem pertencer ao projeto autorizado para a consulta. Um resultado vazio requer conferir o escopo da conexão; não prova que não existam fichas. A paginação lê os registros retornados pela conexão sem snapshot transacional, portanto alterações simultâneas podem exigir uma nova leitura.

Itens sem imagem ou com nome ambíguo aparecem primeiro. Esses resultados podem orientar novas fotos e aliases revisados. A lista não autoriza substituir aparelhos, ângulos ou pegadas para obter uma imagem. A correspondência automática padroniza somente equivalências confiáveis; a revisão da importação mostra o texto identificado na foto quando o nome é alterado.
