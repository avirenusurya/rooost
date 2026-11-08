import { dateKeyFromToday } from './dates';
import {
  uid,
  type Board,
  type BoardColor,
  type Card,
  type Column,
  type Label,
  type Session,
  type Workspace,
} from './types';

type SampleCard = {
  title: string;
  description?: string;
  labels?: string[];
  due?: number;
  pinned?: boolean;
  checklist?: [string, boolean][];
  /** How often this card gets worked on. Quick chores stay near zero. */
  effort?: number;
};

type SampleBoard = {
  title: string;
  color: BoardColor;
  columns: { title: string; cards: SampleCard[] }[];
};

const SAMPLE_LABELS: Label[] = [
  { id: 'design', name: 'Design', color: 'yellow' },
  { id: 'writing', name: 'Writing', color: 'blue' },
  { id: 'errand', name: 'Errand', color: 'teal' },
  { id: 'urgent', name: 'Urgent', color: 'red' },
];

const SAMPLE: SampleBoard[] = [
  {
    title: 'Ceramics shop',
    color: 'green',
    columns: [
      {
        title: 'To do',
        cards: [
          { title: 'Photograph the autumn mug set', labels: ['design'], due: 3, effort: 4 },
          { title: 'Write care notes for the new glazes', labels: ['writing'], due: 6, effort: 3 },
          { title: 'Compare three shipping quotes', labels: ['errand'], due: 9, effort: 0.5 },
        ],
      },
      {
        title: 'In progress',
        cards: [
          {
            title: 'Get ready for the Saturday market',
            description: 'Stall 14, near the north gate. Setup from 7.',
            labels: ['errand', 'urgent'],
            due: 12,
            pinned: true,
            effort: 7,
            checklist: [
              ['Price tags', true],
              ['Card reader', true],
              ['Table display', false],
              ['Packing list', false],
            ],
          },
          { title: 'Redesign the product page', labels: ['design'], due: 1, effort: 8 },
        ],
      },
      {
        title: 'Done',
        cards: [
          { title: 'Order 200 kraft boxes', labels: ['errand'], effort: 0.4 },
          { title: 'Write the shop’s about page', labels: ['writing'], effort: 3 },
        ],
      },
    ],
  },
  {
    title: 'Home',
    color: 'purple',
    columns: [
      {
        title: 'To do',
        cards: [
          { title: 'Book the boiler service', labels: ['errand'], due: 2, effort: 0.1 },
          { title: 'Plan the spring garden beds', labels: ['design'], due: 14, effort: 1 },
        ],
      },
      {
        title: 'In progress',
        cards: [
          { title: 'Renew the passport', labels: ['errand', 'urgent'], due: 5, pinned: true, effort: 0.2 },
        ],
      },
      {
        title: 'Done',
        cards: [{ title: 'Donate the old bookshelves', labels: ['errand'], effort: 0.1 }],
      },
    ],
  },
];

function randomSource(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleSessions(boards: Board[], efforts: Map<string, number>): Session[] {
  const random = randomSource(42);
  const now = Date.now();
  const work = boards.flatMap((board) =>
    Object.values(board.cards).map((card) => ({ board, card, effort: efforts.get(card.id) ?? 1 })),
  );
  const totalEffort = work.reduce((sum, item) => sum + item.effort, 0);
  const sessions: Session[] = [];

  const pick = () => {
    let roll = random() * totalEffort;
    for (const item of work) {
      roll -= item.effort;
      if (roll <= 0) return item;
    }
    return work[work.length - 1];
  };

  const add = (startedAt: number, longest: number) => {
    const { board, card, effort } = pick();
    const minutes = effort < 1 ? 10 + Math.floor(random() * 25) : 20 + Math.floor(random() * longest);
    const seconds = minutes * 60;
    sessions.push({
      id: uid(),
      boardId: board.id,
      cardId: card.id,
      boardTitle: board.title,
      cardTitle: card.title,
      startedAt,
      endedAt: startedAt + seconds * 1000,
      seconds,
      labelIds: card.labelIds,
    });
    return minutes;
  };

  for (let daysAgo = 1; daysAgo <= 300; daysAgo += 1) {
    const activity = daysAgo < 30 ? 0.9 : daysAgo < 120 ? 0.68 : 0.36;
    if (daysAgo > 7 && random() > activity) continue;
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    day.setHours(9 + Math.floor(random() * 4), Math.floor(random() * 60), 0, 0);
    let cursor = day.getTime();
    const count = 1 + Math.floor(random() * 3);
    for (let index = 0; index < count; index += 1) {
      cursor += (add(cursor, 120) + 45) * 60000;
    }
  }

  add(now - 150 * 60000, 40);
  add(now - 80 * 60000, 40);
  return sessions;
}

export function createSampleWorkspace(): Workspace {
  const efforts = new Map<string, number>();
  const boards = SAMPLE.map((sample): Board => {
    const cards: Record<string, Card> = {};
    const columns: Column[] = sample.columns.map((column) => ({
      id: uid(),
      title: column.title,
      cardIds: column.cards.map((seed) => {
        const id = uid();
        efforts.set(id, seed.effort ?? 1);
        cards[id] = {
          id,
          title: seed.title,
          description: seed.description ?? '',
          labelIds: seed.labels ?? [],
          due: seed.due === undefined ? null : dateKeyFromToday(seed.due),
          checklist: (seed.checklist ?? []).map(([text, done]) => ({ id: uid(), text, done })),
          pinned: seed.pinned ?? false,
        };
        return id;
      }),
    }));
    return { id: uid(), title: sample.title, color: sample.color, columns, cards };
  });

  return {
    labels: SAMPLE_LABELS,
    boards,
    activeBoardId: boards[0].id,
    sessions: sampleSessions(boards, efforts),
    timer: null,
  };
}
