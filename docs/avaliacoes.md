# Avaliações físicas no Summer Treinos

## Ativação

1. No Supabase do projeto, abra **SQL Editor → New query**.
2. Execute o conteúdo completo de `supabase/migrations/20261107140000_physical_assessments.sql`. A migração é transacional e pode ser reaplicada sem apagar avaliações.
3. Na Vercel, mantenha `SUPABASE_SERVICE_ROLE_KEY` configurada como segredo do servidor. Ela já é usada pelo projeto; não crie uma variável `NEXT_PUBLIC_` para essa chave.
4. Publique a versão do código contendo esta mudança.
5. Entre com a conta de administrador em `/admin`. Em **Avaliações físicas → Configurar acesso da equipe**, informe um e-mail exclusivo, ainda não cadastrado no site, e uma senha de pelo menos 12 caracteres. O e-mail deve ser controlado pela academia para recuperar a senha.
6. Compartilhe esse acesso com a equipe. A entrada fica em `/professor` e também há um link na tela inicial de login.

Não é necessário dar permissão de administrador à conta da equipe. A configuração mantém somente uma conta compartilhada ativa. Desativar essa conta pelo painel remove imediatamente o acesso aos RPCs de avaliações, inclusive em sessões que já estavam abertas. Sair em um computador encerra somente aquela sessão.

## Uso

- A área da equipe abre com pastas por professor. Toque no cartão para consultar as fichas daquele responsável, buscar alunos e filtrar rascunhos/publicações. O acesso continua compartilhado; as pastas são organização, não contas separadas.
- **Novo professor** inicia a primeira avaliação com o nome preenchido. A pasta permanece no site quando essa ficha é salva. Avaliações antigas sem responsável ficam em **Sem professor**; preencher o nome no rascunho move a ficha para a pasta correspondente. Essa organização não exige nova migração.
- Nova avaliação: localizar a matrícula e confirmar o nome do aluno. Sem cadastro confirmado, preencher nome e matrícula e salvar como rascunho; vincular depois.
- Registrar o professor responsável em cada avaliação. A identidade autenticada é a conta compartilhada, portanto esse nome é uma informação declarada, não uma assinatura individual autenticada.
- Preencher as sete etapas. O rascunho é salvo após uma breve pausa na digitação, com indicação de sucesso ou erro. Nenhum dado da ficha é guardado no localStorage.
- Conferir em **Visualizar como aluno** e publicar. O aluno encontra **Ver avaliação** logo no início da tela principal, além dos acessos no Perfil e no menu do computador, sem depender do plano Pro.
- Publicações são preservadas no histórico. Para uma reavaliação, usar **Nova reavaliação**; os dados de identificação são mantidos, mas as novas medidas começam vazias.
- Em edição simultânea, o segundo salvamento de uma versão antiga é recusado. O professor pode baixar sua cópia Excel antes de reabrir o rascunho atualizado.
- **Baixar Excel (.xlsx)** gera uma planilha real, editável, com seções e unidades. O arquivo usa `AAAA-MM-DD_Avaliacao_MATRICULA.xlsx`. O navegador determina a pasta; ative “Perguntar onde salvar cada arquivo” para selecionar a pasta do professor. Editar essa cópia não altera a avaliação no site.

## Dados e cálculos

O Excel mantém as abas HOMENS/MULHERES e a sequência da ficha original: dados cadastrais, anamnese, análise postural, valores antropométricos, circunferências, resumo funcional e teste aeróbico. A aba do modelo selecionado recebe a avaliação; a outra fica em branco para servir de modelo. O visual usa títulos, cores da academia, medidas pareadas, campos editáveis e área de impressão A4. O arquivo de exemplo e seus dados pessoais não são incluídos no código, no banco ou nos arquivos exportados.

A soma das três dobras só aparece quando todas estão preenchidas. As medidas repetidas no resumo usam referências às células da ficha para acompanhar edições no Excel. As demais fórmulas clínicas do `.xls` antigo não são replicadas automaticamente. Campos não disponíveis no cadastro, como e-mail, ficam em branco para preenchimento no arquivo.

Resultados de composição corporal e testes aeróbicos são informados e revisados pelo professor. Não há cálculo automático de protocolos clínicos não validados. Campos ausentes permanecem vazios. A altura usa centímetros. As faixas aceitas impedem erros grosseiros de digitação e não constituem diagnóstico.

Rascunhos e tabelas de acesso ficam no schema privado, sem leitura direta por usuários. RPCs conferem identidade e permissão no servidor. Alunos só leem suas próprias avaliações publicadas; professores não podem administrar planos. Gráficos exibem até 24 avaliações publicadas, com tabela acessível de valores.

## Validação

Testes automatizados em `tests/assessments-db.test.mjs`, `tests/assessments.test.mjs` e `tests/assessment-excel.test.mjs` cobrem permissões, matrícula, dados inválidos, concorrência, publicação e a leitura do `.xlsx` gerado. Testes de navegador devem usar somente dados fictícios.
