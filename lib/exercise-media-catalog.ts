// Photos are copied unchanged from the pinned public-domain dataset listed in docs/exercise-media-sources.md.
import { EXERCISE_MEDIA_EXPANSION } from './exercise-media-expansion.ts';
export type ExerciseMedia = {
  id: string;
  title: string;
  aliases: readonly string[];
  images: readonly [string, string];
  captions: readonly [string, string];
  sourceUrl: string;
};

export const EXERCISE_MEDIA: readonly ExerciseMedia[] = [
  ...EXERCISE_MEDIA_EXPANSION,
  {
    "id": "supino-barra",
    "title": "Supino reto com barra",
    "aliases": [
      "Supino reto com barra",
      "Supino reto barra",
      "Supino barra reta"
    ],
    "images": [
      "/exercise-demos/supino-barra/0.jpg",
      "/exercise-demos/supino-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Barbell_Bench_Press_-_Medium_Grip.json",
    "captions": [
      "Braços estendidos",
      "Barra próxima ao peito"
    ]
  },
  {
    "id": "supino-halteres",
    "title": "Supino reto com halteres",
    "aliases": [
      "Supino reto com halteres",
      "Supino reto halteres"
    ],
    "images": [
      "/exercise-demos/supino-halteres/0.jpg",
      "/exercise-demos/supino-halteres/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Dumbbell_Bench_Press.json",
    "captions": [
      "Halteres ao lado do peito",
      "Braços estendidos"
    ]
  },
  {
    "id": "agachamento-barra",
    "title": "Agachamento livre com barra",
    "aliases": [
      "Agachamento livre com barra",
      "Agachamento com barra"
    ],
    "images": [
      "/exercise-demos/agachamento-barra/0.jpg",
      "/exercise-demos/agachamento-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Barbell_Full_Squat.json",
    "captions": [
      "Em pé com a barra",
      "Joelhos e quadris flexionados"
    ]
  },
  {
    "id": "leg-press-45",
    "title": "Leg press 45°",
    "aliases": [
      "Leg press 45",
      "Leg press 45°",
      "Leg press inclinado"
    ],
    "images": [
      "/exercise-demos/leg-press-45/0.jpg",
      "/exercise-demos/leg-press-45/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Leg_Press.json",
    "captions": [
      "Pernas estendidas",
      "Joelhos flexionados"
    ]
  },
  {
    "id": "elevacao-lateral",
    "title": "Elevação lateral com halteres",
    "aliases": [
      "Elevação lateral com halteres",
      "Elevação lateral halteres"
    ],
    "images": [
      "/exercise-demos/elevacao-lateral/0.jpg",
      "/exercise-demos/elevacao-lateral/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Side_Lateral_Raise.json",
    "captions": [
      "Halteres ao lado do corpo",
      "Braços elevados lateralmente"
    ]
  },
  {
    "id": "desenvolvimento-halteres",
    "title": "Desenvolvimento sentado com halteres",
    "aliases": [
      "Desenvolvimento sentado com halteres",
      "Desenvolvimento com halteres sentado"
    ],
    "images": [
      "/exercise-demos/desenvolvimento-halteres/0.jpg",
      "/exercise-demos/desenvolvimento-halteres/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Dumbbell_Shoulder_Press.json",
    "captions": [
      "Halteres na altura dos ombros",
      "Braços estendidos acima"
    ]
  },
  {
    "id": "rosca-barra",
    "title": "Rosca direta com barra",
    "aliases": [
      "Rosca direta com barra",
      "Rosca direta barra",
      "Rosca direta barra reta"
    ],
    "images": [
      "/exercise-demos/rosca-barra/0.jpg",
      "/exercise-demos/rosca-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Barbell_Curl.json",
    "captions": [
      "Braços estendidos",
      "Cotovelos flexionados"
    ]
  },
  {
    "id": "rosca-alternada",
    "title": "Rosca alternada com halteres",
    "aliases": [
      "Rosca alternada com halteres",
      "Rosca alternada halteres",
      "Rosca alternada"
    ],
    "images": [
      "/exercise-demos/rosca-alternada/0.jpg",
      "/exercise-demos/rosca-alternada/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Dumbbell_Alternate_Bicep_Curl.json",
    "captions": [
      "Alternância — lado 1",
      "Alternância — lado 2"
    ]
  },
  {
    "id": "puxada-aberta",
    "title": "Puxada frontal com pegada aberta",
    "aliases": [
      "Puxada frontal com pegada aberta",
      "Puxada aberta na frente",
      "Puxada alta aberta",
      "Puxada frente aberta"
    ],
    "images": [
      "/exercise-demos/puxada-aberta/0.jpg",
      "/exercise-demos/puxada-aberta/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Wide-Grip_Lat_Pulldown.json",
    "captions": [
      "Braços estendidos acima",
      "Barra à frente do peito"
    ]
  },
  {
    "id": "triceps-corda",
    "title": "Tríceps na polia com corda",
    "aliases": [
      "Tríceps na polia com corda",
      "Tríceps corda",
      "Tríceps polia corda",
      "Tríceps com corda"
    ],
    "images": [
      "/exercise-demos/triceps-corda/0.jpg",
      "/exercise-demos/triceps-corda/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Triceps_Pushdown_-_Rope_Attachment.json",
    "captions": [
      "Cotovelos flexionados",
      "Braços estendidos"
    ]
  },
  {
    "id": "prancha",
    "title": "Prancha abdominal",
    "aliases": [
      "Prancha abdominal",
      "Prancha isométrica",
      "Prancha de antebraços"
    ],
    "images": [
      "/exercise-demos/prancha/0.jpg",
      "/exercise-demos/prancha/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Plank.json",
    "captions": [
      "Preparação no chão",
      "Prancha nos antebraços"
    ]
  },
  {
    "id": "remada-barra",
    "title": "Remada curvada com barra",
    "aliases": [
      "Remada curvada com barra",
      "Remada curvada barra",
      "Remada com barra curvada"
    ],
    "images": [
      "/exercise-demos/remada-barra/0.jpg",
      "/exercise-demos/remada-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Bent_Over_Barbell_Row.json",
    "captions": [
      "Braços estendidos",
      "Barra próxima ao tronco"
    ]
  },
  {
    "id": "supino-inclinado-barra",
    "title": "Supino inclinado com barra",
    "aliases": [
      "Supino inclinado com barra",
      "Supino inclinado barra"
    ],
    "images": [
      "/exercise-demos/supino-inclinado-barra/0.jpg",
      "/exercise-demos/supino-inclinado-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip.json",
    "captions": [
      "Braços estendidos no banco inclinado",
      "Barra próxima à parte superior do peito"
    ]
  },
  {
    "id": "supino-inclinado-halteres",
    "title": "Supino inclinado com halteres",
    "aliases": [
      "Supino inclinado com halteres",
      "Supino inclinado halteres"
    ],
    "images": [
      "/exercise-demos/supino-inclinado-halteres/0.jpg",
      "/exercise-demos/supino-inclinado-halteres/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Incline_Dumbbell_Press.json",
    "captions": [
      "Halteres ao lado do peito no banco inclinado",
      "Braços estendidos acima"
    ]
  },
  {
    "id": "crucifixo-reto-halteres",
    "title": "Crucifixo reto com halteres",
    "aliases": [
      "Crucifixo reto com halteres",
      "Crucifixo reto halteres",
      "Crucifixo com halteres no banco reto"
    ],
    "images": [
      "/exercise-demos/crucifixo-reto-halteres/0.jpg",
      "/exercise-demos/crucifixo-reto-halteres/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Dumbbell_Flyes.json",
    "captions": [
      "Halteres aproximados acima do peito",
      "Braços abertos ao lado do banco"
    ]
  },
  {
    "id": "peck-deck",
    "title": "Crucifixo na máquina (peck deck)",
    "aliases": [
      "Crucifixo na máquina (peck deck)",
      "Peck deck",
      "Peck-deck",
      "Voador peitoral",
      "Crucifixo na máquina"
    ],
    "images": [
      "/exercise-demos/peck-deck/0.jpg",
      "/exercise-demos/peck-deck/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Butterfly.json",
    "captions": [
      "Braços aproximados à frente",
      "Braços abertos na máquina"
    ]
  },
  {
    "id": "remada-baixa-cabo",
    "title": "Remada baixa no cabo com pegada neutra",
    "aliases": [
      "Remada baixa no cabo com pegada neutra",
      "Remada baixa com triângulo",
      "Remada baixa no cabo com triângulo",
      "Remada sentada no cabo com pegada neutra"
    ],
    "images": [
      "/exercise-demos/remada-baixa-cabo/0.jpg",
      "/exercise-demos/remada-baixa-cabo/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Seated_Cable_Rows.json",
    "captions": [
      "Braços estendidos à frente",
      "Puxador próximo ao tronco"
    ]
  },
  {
    "id": "remada-unilateral-halter",
    "title": "Remada unilateral com halter",
    "aliases": [
      "Remada unilateral com halter",
      "Remada unilateral com halteres",
      "Remada serrote com halter",
      "Remada serrote"
    ],
    "images": [
      "/exercise-demos/remada-unilateral-halter/0.jpg",
      "/exercise-demos/remada-unilateral-halter/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/One-Arm_Dumbbell_Row.json",
    "captions": [
      "Braço estendido com apoio no banco",
      "Halter próximo ao tronco"
    ]
  },
  {
    "id": "cadeira-extensora",
    "title": "Cadeira extensora",
    "aliases": [
      "Cadeira extensora",
      "Extensora",
      "Extensão de pernas na máquina"
    ],
    "images": [
      "/exercise-demos/cadeira-extensora/0.jpg",
      "/exercise-demos/cadeira-extensora/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Leg_Extensions.json",
    "captions": [
      "Joelhos flexionados",
      "Pernas estendidas à frente"
    ]
  },
  {
    "id": "mesa-flexora",
    "title": "Mesa flexora",
    "aliases": [
      "Mesa flexora",
      "Flexora deitada",
      "Flexão de pernas deitado na máquina"
    ],
    "images": [
      "/exercise-demos/mesa-flexora/0.jpg",
      "/exercise-demos/mesa-flexora/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Lying_Leg_Curls.json",
    "captions": [
      "Pernas estendidas na máquina",
      "Joelhos flexionados"
    ]
  },
  {
    "id": "cadeira-flexora",
    "title": "Cadeira flexora",
    "aliases": [
      "Cadeira flexora",
      "Flexora sentada",
      "Flexão de pernas sentado na máquina"
    ],
    "images": [
      "/exercise-demos/cadeira-flexora/0.jpg",
      "/exercise-demos/cadeira-flexora/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Seated_Leg_Curl.json",
    "captions": [
      "Pernas estendidas à frente",
      "Joelhos flexionados para baixo"
    ]
  },
  {
    "id": "cadeira-abdutora",
    "title": "Cadeira abdutora",
    "aliases": [
      "Cadeira abdutora",
      "Abdutora",
      "Abdução de quadril na máquina"
    ],
    "images": [
      "/exercise-demos/cadeira-abdutora/0.jpg",
      "/exercise-demos/cadeira-abdutora/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Thigh_Abductor.json",
    "captions": [
      "Pernas aproximadas",
      "Pernas afastadas"
    ]
  },
  {
    "id": "cadeira-adutora",
    "title": "Cadeira adutora",
    "aliases": [
      "Cadeira adutora",
      "Adutora",
      "Adução de quadril na máquina"
    ],
    "images": [
      "/exercise-demos/cadeira-adutora/0.jpg",
      "/exercise-demos/cadeira-adutora/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Thigh_Adductor.json",
    "captions": [
      "Pernas afastadas",
      "Pernas aproximadas"
    ]
  },
  {
    "id": "panturrilha-sentado-maquina",
    "title": "Panturrilha sentado na máquina",
    "aliases": [
      "Panturrilha sentado na máquina",
      "Panturrilha sentada na máquina",
      "Panturrilha no aparelho sentado"
    ],
    "images": [
      "/exercise-demos/panturrilha-sentado-maquina/0.jpg",
      "/exercise-demos/panturrilha-sentado-maquina/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Seated_Calf_Raise.json",
    "captions": [
      "Calcanhares abaixados",
      "Calcanhares elevados"
    ]
  },
  {
    "id": "panturrilha-em-pe-maquina",
    "title": "Panturrilha em pé na máquina",
    "aliases": [
      "Panturrilha em pé na máquina",
      "Panturrilha em pé no aparelho",
      "Elevação de panturrilhas em pé na máquina"
    ],
    "images": [
      "/exercise-demos/panturrilha-em-pe-maquina/0.jpg",
      "/exercise-demos/panturrilha-em-pe-maquina/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Standing_Calf_Raises.json",
    "captions": [
      "Calcanhares abaixados",
      "Calcanhares elevados"
    ]
  },
  {
    "id": "terra-romeno-barra",
    "title": "Levantamento terra romeno com barra",
    "aliases": [
      "Levantamento terra romeno com barra",
      "Terra romeno com barra",
      "RDL com barra",
      "Terra romeno barra"
    ],
    "images": [
      "/exercise-demos/terra-romeno-barra/0.jpg",
      "/exercise-demos/terra-romeno-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Romanian_Deadlift.json",
    "captions": [
      "Quadris flexionados com a barra abaixo",
      "Tronco ereto com a barra junto às coxas"
    ]
  },
  {
    "id": "rosca-martelo-halteres",
    "title": "Rosca martelo com halteres",
    "aliases": [
      "Rosca martelo com halteres",
      "Rosca martelo halteres",
      "Rosca martelo com halter"
    ],
    "images": [
      "/exercise-demos/rosca-martelo-halteres/0.jpg",
      "/exercise-demos/rosca-martelo-halteres/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Hammer_Curls.json",
    "captions": [
      "Braços estendidos com pegada neutra",
      "Cotovelos flexionados com pegada neutra"
    ]
  },
  {
    "id": "rosca-scott-barra",
    "title": "Rosca Scott com barra EZ",
    "aliases": [
      "Rosca Scott com barra EZ",
      "Rosca Scott barra EZ",
      "Rosca Scott com barra W",
      "Rosca Scott barra W"
    ],
    "images": [
      "/exercise-demos/rosca-scott-barra/0.jpg",
      "/exercise-demos/rosca-scott-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Preacher_Curl.json",
    "captions": [
      "Braços apoiados e estendidos",
      "Cotovelos flexionados no apoio"
    ]
  },
  {
    "id": "triceps-polia-barra",
    "title": "Tríceps na polia com barra reta",
    "aliases": [
      "Tríceps na polia com barra reta",
      "Tríceps polia barra reta",
      "Tríceps pulley com barra reta",
      "Tríceps na polia com barra"
    ],
    "images": [
      "/exercise-demos/triceps-polia-barra/0.jpg",
      "/exercise-demos/triceps-polia-barra/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Triceps_Pushdown.json",
    "captions": [
      "Cotovelos flexionados",
      "Braços estendidos para baixo"
    ]
  },
  {
    "id": "abdominal-crunch",
    "title": "Abdominal crunch no chão",
    "aliases": [
      "Abdominal crunch no chão",
      "Abdominal crunch",
      "Crunch no chão",
      "Abdominal curto no chão"
    ],
    "images": [
      "/exercise-demos/abdominal-crunch/0.jpg",
      "/exercise-demos/abdominal-crunch/1.jpg"
    ],
    "sourceUrl": "https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/Crunches.json",
    "captions": [
      "Tronco apoiado no chão",
      "Parte superior do tronco elevada"
    ]
  }
];
