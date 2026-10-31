# Revisão dos nomes das fichas

A revisão usa somente nomes agregados de exercícios obtidos pela auditoria de leitura das fichas. Não inclui nomes, e-mails, matrículas, identificadores dos alunos ou títulos das fichas. Nenhuma ficha existente foi regravada para adicionar imagens.

## Critério de associação

- O catálogo e `lib/exercise-reviewed-aliases.ts` contêm associações explícitas. Variações de caixa, acentos, pontuação e abreviações ortográficas conhecidas podem identificar a mesma associação; semelhança de palavras não escolhe uma foto automaticamente.
- Nomes equivalentes e completos, como `Cad. abdutora`, podem receber o nome padronizado na importação por foto.
- As 67 entradas revisadas incluem referências ao movimento ou aparelho com `preserveName: true`. Nesses casos, o nome original fica intacto, incluindo números de equipamento, ordem dos exercícios, tempos, isometria e outras orientações. O diálogo identifica a referência fotografada separadamente da prescrição.
- `Esteira`, `Cardio (esteira)` e a orientação de alternar corrida/caminhada usam fotos da caminhada como referência do aparelho. Essas fotos não definem o ritmo nem substituem a orientação da ficha. `Bike` e `Cardio (bike)` usam referência da bicicleta ergométrica; `Cardio (transport)` identifica o elíptico. Esses nomes permanecem como escritos na ficha.
- Exercícios unidos por `+` conservam o nome completo. Cada parte reconhecida pode oferecer sua própria demonstração; uma parte desconhecida não recebe a foto da outra parte.
- As fotografias de cadeira extensora, abdutora, adutora e flexora podem servir como referência do movimento base quando a ficha inclui um código de máquina ou uma instrução de isometria. As fotos estáticas não demonstram a duração ou o protocolo inteiro.

## Casos que continuam sem associação automática

- `Cardio`, `Cardio livre`, `Aeróbio`, `Aquecimento` e equivalentes não indicam o aparelho.
- As siglas locais `HBC`, `HBL`, `HBM`, `HBW`, `P.P`, `P.S` e `P.N` não foram expandidas por suposição. A confirmação do significado no cadastro da academia ainda é necessária.
- `Extensão de tronco no módulo`, `Extensão de tronco no módulo (22)`, `Extensão lombar módulo` e `Extensão Lombar Moudlo` não recebem fotos do banco romano: o módulo pode ser outro aparelho. O catálogo oferece a demonstração apenas quando o nome identifica o banco corretamente.
- O leg press horizontal não usa fotos do leg press inclinado. Agachamento no TRX não usa uma imagem do Smith ou de agachamento livre. Não foi localizada uma foto adequada para essas variações no conjunto de imagens adotado.
- `Ponte ventral` e `Prancha D. ventral` não especificam o apoio dos braços. Nomes genéricos de supino, desenvolvimento, abdominais sem postura ou solo definidos e variantes unilaterais sem foto correspondente também conservam sua identificação original.
- `Hip thrust` sem indicação da carga não é convertido automaticamente em `Hip thrust com barra`. A nova imagem com barra está disponível para o nome específico do catálogo.

As imagens, legendas, licença declarada pela fonte e checksums dos arquivos estão documentados em [exercise-media-sources.md](exercise-media-sources.md).
