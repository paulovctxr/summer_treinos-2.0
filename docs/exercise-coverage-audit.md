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

`hasImages` indica que há pelo menos uma referência disponível. Em exercícios combinados com `+`, somente as partes reconhecidas recebem fotos; isso não significa que a combinação inteira esteja coberta. O nome completo e as orientações da ficha permanecem intactos.

Na leitura de 31/10/2026, a mesma lista agregada tinha 487 nomes e 658 ocorrências. A ampliação de 30 para 54 demonstrações, com 67 associações revisadas, aumentou de 18 para 125 os nomes com alguma referência em fotos e de 32 para 215 as ocorrências correspondentes. Dessas 215 ocorrências, 182 têm associação do nome completo e 33 são combinações com pelo menos uma parte reconhecida. A consulta foi somente de leitura; nenhuma ficha foi regravada. Os critérios e pendências estão em [exercise-name-review.md](exercise-name-review.md).
