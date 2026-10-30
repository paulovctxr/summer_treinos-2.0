// Photos are copied unchanged from the pinned public-domain dataset listed in docs/exercise-media-sources.md.
export type ExerciseMedia = {
  id: string;
  title: string;
  aliases: readonly string[];
  images: readonly [string, string];
  captions: readonly [string, string];
  sourceUrl: string;
};

export const EXERCISE_MEDIA: readonly ExerciseMedia[] = [
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
      "Supino com halteres",
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
      "Desenvolvimento de ombros com halteres",
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
  }
];
