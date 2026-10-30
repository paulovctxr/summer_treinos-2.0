import type { MealType, ShoppingItem } from './nutrition.ts';

export type FoodEntryDraft = {
  label: string;
  meal_type: MealType;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

function decimal(raw: string, label: string, min: number, max: number, optional = false) {
  const text = raw.trim().replace(',', '.');
  if (!text && optional) return 0;
  const value = Number(text);
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label}: informe um valor entre ${min} e ${max}.`);
  }
  return value;
}

export function parseFoodEntry(draft: FoodEntryDraft) {
  if (!draft.label.trim()) throw new Error('Informe o alimento ou nome da refeição.');
  return {
    label: draft.label.trim().slice(0, 100),
    meal_type: draft.meal_type,
    calories: Math.round(decimal(draft.calories, 'Calorias', 1, 10000)),
    protein_g: Math.round(decimal(draft.protein_g, 'Proteína', 0, 1000, true) * 10) / 10,
    carbs_g: Math.round(decimal(draft.carbs_g, 'Carboidratos', 0, 1500, true) * 10) / 10,
    fat_g: Math.round(decimal(draft.fat_g, 'Gorduras', 0, 1000, true) * 10) / 10,
  };
}

export function parseWaterAmount(raw: string) {
  const value = decimal(raw, 'Água em ml', 50, 5000);
  if (!Number.isInteger(Number(raw.trim().replace(',', '.')))) throw new Error('Água em ml: informe uma quantidade inteira.');
  return value;
}

export function shiftDiaryDay(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function diaryDayLabel(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}

export function shoppingItems(items: ShoppingItem[]) {
  return items.map((item, index) => ({ ...item, id: JSON.stringify([item.category, item.name, item.quantity, index]) }));
}

export function readShoppingChecks(value: string | null, validIds: string[]) {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id): id is string => typeof id === 'string' && validIds.includes(id)))] : [];
  } catch { return []; }
}

export function shoppingText(items: ShoppingItem[]) {
  return ['Summer Fit · Lista de compras', ...Array.from(new Set(items.map((item) => item.category))).flatMap((category) => [
    '', category, ...items.filter((item) => item.category === category).map((item) => `• ${item.name} — ${item.quantity}`),
  ])].join('\n');
}
