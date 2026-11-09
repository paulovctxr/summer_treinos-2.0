# Avaliações físicas no Summer Treinos

## Ativação

1. No Supabase do projeto, abra **SQL Editor → New query**.
2. Execute, nesta ordem, `supabase/migrations/20261107140000_physical_assessments.sql`, `supabase/migrations/20261107180000_assessment_removal.sql` e `supabase/migrations/20261108120000_team_workspace.sql`. Se as avaliações e remoções já estiverem ativas, execute apenas a última para habilitar avisos, recuperação e treinos. As migrações são transacionais e sua execução não remove avaliações.
3. Na Vercel, mantenha `SUPABASE_SERVICE_ROLE_KEY` configurada como segredo do servidor. Ela já é usada pelo projeto; não crie uma variável `NEXT_PUBLIC_` para essa chave.
4. Publique a versão do código contendo esta mudança.
5. Entre com a conta de administrador em `/admin`. Em **Avaliações físicas → Configurar acesso da equipe**, informe um e-mail exclusivo, ainda não cadastrado no site, e uma senha de pelo menos 12 caracteres. O e-mail deve ser controlado pela academia para recuperar a senha.
6. Compartilhe esse acesso com a equipe. A entrada fica em `/professor` e também há um link na tela inicial de login.

Não é necessário dar permissão de administrador à conta da equipe. A configuração mantém somente uma conta compartilhada ativa. Desativar essa conta pelo painel remove imediatamente o acesso aos RPCs de avaliações, inclusive em sessões que já estavam abertas. Sair em um computador encerra somente aquela sessão.

## Uso

- A área da equipe abre com pastas por professor. Toque no cartão para consultar as fichas daquele responsável, buscar alunos e filtrar rascunhos/publicações. O acesso continua compartilhado; as pastas são organização, não contas separadas.
- **Novo professor** inicia a primeira avaliação com o nome preenchido. A pasta permanece no site quando essa ficha é salva. Avaliações antigas sem responsável ficam em **Sem professor**; preencher o nome no rascunho move a ficha para a pasta correspondente. Essa organização não exige nova migração.
- Nova avaliação: localizar a matrícula e confirmar o nome do aluno quando ele já tiver conta. Se ainda não houver login, preencher nome e matrícula e publicar na pasta do professor; quando a conta ativa for criada com a mesma matrícula, a avaliação publicada aparecerá automaticamente para o aluno.
- Registrar o professor responsável em cada avaliação. A identidade autenticada é a conta compartilhada, portanto esse nome é uma informação declarada, não uma assinatura individual autenticada.
- Preencher as sete etapas. O rascunho é salvo após uma breve pausa na digitação, com indicação de sucesso ou erro. Nenhum dado da ficha é guardado no localStorage.
- Conferir em **Visualizar como aluno** e publicar. O aluno encontra **Ver avaliação** logo no início da tela principal, além dos acessos no Perfil e no menu do computador, sem depender do plano Pro.
- Publicações são preservadas no histórico. Para uma reavaliação, usar **Nova reavaliação**; os dados de identificação são mantidos, mas as novas medidas começam vazias.
- **Remover avaliação** retira uma ficha da área da equipe e do aluno, após confirmação. **Remover pasta** mostra a quantidade total e quantas estão publicadas e exige digitar o nome do professor; remove todas as fichas confirmadas daquela pasta. Se alguma ficha mudou desde o carregamento, a ação é recusada e a lista precisa ser atualizada. Fichas novas criadas depois da conferência do banco são preservadas.
- As remoções ficam na **Lixeira**, acessível apenas à equipe autorizada e à administração. É possível recuperar uma ficha ou todas as removidas de um professor, após confirmação. Publicações recuperadas voltam para os alunos; rascunhos continuam privados. A recuperação preserva os dados e incrementa a revisão para bloquear salvamentos de sessões antigas. Não há prazo automático de limpeza.
- Para habilitar **Excluir definitivamente**, execute também `supabase/migrations/20261108180000_assessment_purge.sql`. O botão aparece somente após essa ativação. A equipe deve digitar **EXCLUIR** para confirmar a ficha indicada. A exclusão apaga o conteúdo guardado na lixeira e não pode ser desfeita na plataforma. Apenas o identificador técnico é mantido para impedir que uma sessão antiga recrie a ficha. Treinos já publicados e cópias Excel ou impressas são independentes. A migração, por si só, não exclui fichas.
- Em edição simultânea, o segundo salvamento de uma versão antiga é recusado. O professor pode baixar sua cópia Excel antes de reabrir o rascunho atualizado.
- **Baixar Excel (.xlsx)** gera uma planilha real, editável, com seções e unidades. O arquivo usa `AAAA-MM-DD_Avaliacao_MATRICULA.xlsx`. O navegador determina a pasta; ative “Perguntar onde salvar cada arquivo” para selecionar a pasta do professor. Editar essa cópia não altera a avaliação no site.

## Avisos e treinos da equipe

- O aluno vê **Nova avaliação disponível** na tela principal enquanto houver avaliações publicadas que ainda não abriu. Consultar a lista não marca como lida; abrir uma ficha registra a primeira visualização na conta do próprio aluno. A equipe vê essa data. As avaliações antigas começam como não visualizadas, pois não havia registro anterior de leitura. Não são enviados e-mails ou notificações fora do site.
- A área compartilhada `/professor` tem abas **Avaliações** e **Treinos**. Trocar de aba mantém o trabalho aberto. Os treinos usam **Salvar rascunho** explícito e avisam antes de descartar alterações ou fechar a página. A conta continua única e o professor responsável é informado na ficha.
- Na avaliação publicada, **Montar treino para este aluno** inicia um rascunho com aluno, matrícula, professor e referência à avaliação. A avaliação pode ser consultada durante a edição. Não há prescrição automática nem cópia de dados clínicos para o treino.
- Cada ficha aceita até 12 treinos (A, B, C etc.), com até 20 exercícios por treino, sugestões de nomes, séries, repetições/tempo, carga, descanso e orientações. Séries e repetições começam vazias e são obrigatórias para publicar. Há prévia, Excel editável e impressão para a equipe.
- A ficha recebe um nome automático pela data (por exemplo, “Ficha de 08/11/2026”). O formulário não pede título da ficha nem orientações gerais; instruções específicas continuam no campo de cada exercício.
- Em **Buscar aluno em todas as pastas**, a equipe pode localizar uma avaliação por nome ou matrícula e abrir diretamente a ficha, mesmo que ela esteja na pasta de outro professor.
- **Publicar para o aluno** envia direto para a conta vinculada. Sem conta, **Publicar na pasta do professor** preserva a ficha na equipe e a libera automaticamente quando o aluno criar uma conta ativa com a mesma matrícula. O aluno encontra **Fichas do professor** no Início e em Treinos e pode iniciar a sessão pelo fluxo existente, sem depender do plano Pro. O histórico de sessões, as fichas próprias e as cargas anteriores não são substituídos.
- Uma ficha publicada é preservada. **Criar nova versão** gera um novo rascunho com novos identificadores; a versão anterior continua disponível para consulta. A interface identifica a mais recente, sem declarar que ela substitui automaticamente todas as fichas anteriores.
- A ficha inclui objetivo, zona alvo, data, revisão e próxima reavaliação, preenchidos pelo professor e presentes no site, no Excel e na impressão. A zona alvo não é calculada automaticamente.
- **Visualizar ficha** e **Imprimir ficha · meia A4** abrem a mesma prévia dentro do site, sem depender de pop-ups. A prévia mostra os dados atuais, inclusive alterações ainda não salvas, no modelo da academia: logo Summer Fit, identificação e tabela de exercícios, séries, repetições/tempo, carga e observação. Dentro dela, **Imprimir ficha** abre o diálogo de impressão do navegador. **Fechar prévia** ou Escape retorna à edição preservando os campos.
- Cada metade horizontal mede 210 × 148,5 mm (A5); a folha é A4 em retrato, com linha de corte e opção de duas cópias iguais por folha. A prévia se ajusta à largura do celular; a impressão mantém o tamanho real. Cada treino tem sua ficha; a paginação mede o conteúdo e cria continuações sem omitir exercícios ou notas. Usar A4, retrato, escala 100% e desativar cabeçalhos/rodapés do navegador. Cargas não preenchidas ficam em branco para anotação à mão. Rascunhos impressos são identificados como não publicados. A ficha não é enviada automaticamente à impressora.
- **Baixar Excel (.xlsx)** usa o modelo da impressão, com uma ficha por aba, logo, identificação e a mesma tabela de exercícios alinhada nas células A:I. Fichas longas ganham abas de continuação; a planilha não cria uma segunda ficha duplicada. A cópia no computador é independente da ficha no site.
- Tanto nos treinos quanto nas avaliações, o botão indica **Gerando Excel…**. Ao concluir, mantém um link **Salvar arquivo Excel** para baixar manualmente caso o navegador bloqueie o início automático. O link contém a última cópia gerada; após editar a ficha, use **Baixar Excel (.xlsx)** novamente para gerar a versão atualizada. Uma falha ou demora no logo não impede a exportação.

## Dados e cálculos

O Excel mantém as abas HOMENS/MULHERES e a sequência da ficha original: dados cadastrais, anamnese, análise postural, valores antropométricos, circunferências, resumo funcional e teste aeróbico. A aba do modelo selecionado recebe a avaliação; a outra fica em branco para servir de modelo. O visual usa títulos, cores da academia, medidas pareadas, campos editáveis e área de impressão A4. O arquivo de exemplo e seus dados pessoais não são incluídos no código, no banco ou nos arquivos exportados.

A soma das três dobras só aparece quando todas estão preenchidas. As medidas repetidas no resumo usam referências às células da ficha para acompanhar edições no Excel. As demais fórmulas clínicas do `.xls` antigo não são replicadas automaticamente. Campos não disponíveis no cadastro, como e-mail, ficam em branco para preenchimento no arquivo.

Resultados de composição corporal e testes aeróbicos são informados e revisados pelo professor. Não há cálculo automático de protocolos clínicos não validados. Campos ausentes permanecem vazios. A altura usa centímetros. As faixas aceitas impedem erros grosseiros de digitação e não constituem diagnóstico.

Rascunhos e tabelas de acesso ficam no schema privado, sem leitura direta por usuários. RPCs conferem identidade e permissão no servidor. Alunos só leem suas próprias avaliações publicadas; professores não podem administrar planos. Gráficos exibem até 24 avaliações publicadas, com tabela acessível de valores.

## Validação

Testes automatizados em `tests/assessments-db.test.mjs`, `tests/assessments.test.mjs` e `tests/assessment-excel.test.mjs` cobrem permissões, matrícula, dados inválidos, concorrência, publicação e a leitura do `.xlsx` gerado. Testes de navegador devem usar somente dados fictícios.
