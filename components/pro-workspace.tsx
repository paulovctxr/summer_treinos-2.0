"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  Camera,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ChefHat,
  Droplets,
  Dumbbell,
  Gauge,
  ListChecks,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FoodPhotoAnalyzer } from "@/components/food-photo-analyzer";
import { nutritionDraft, parseNutritionDraft, type NutritionDraft } from "@/lib/nutrition-draft";
import { diaryDayLabel, parseFoodEntry, parseWaterAmount, readShoppingChecks, shiftDiaryDay, shoppingItems, shoppingText, type FoodEntryDraft } from "@/lib/nutrition-tools";
import styles from "./pro-workspace.module.css";
import {
  ACTIVITY_LABELS,
  DEFAULT_NUTRITION_PROFILE,
  DIET_LABELS,
  GOAL_LABELS,
  MEAL_LABELS,
  calculateNutritionTargets,
  localDateValue,
  nutritionTotals,
  progressPercent,
  readMealPlan,
  type ActivityLevel,
  type DietaryPreference,
  type MealPlan,
  type Meal,
  type MealType,
  type NutritionAccess,
  type NutritionEntry,
  type NutritionGoal,
  type NutritionProfile,
  type WaterEntry,
} from "@/lib/nutrition";

type Tool = "overview" | "menu" | "diary" | "shopping" | "food-photo";
type FoodDraft = FoodEntryDraft;

const emptyFood: FoodDraft = {
  label: "",
  meal_type: "lunch",
  calories: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
};

const tools = [
  { id: "overview", label: "Visão geral", icon: Gauge },
  { id: "menu", label: "Cardápio", icon: ChefHat },
  { id: "diary", label: "Diário e água", icon: Droplets },
  { id: "shopping", label: "Compras", icon: ShoppingBasket },
  { id: "food-photo", label: "Foto da comida", icon: Camera },
] as const;

function percentage(value: number, target: number) {
  return `${progressPercent(value, target)}%`;
}

function dateLabel(value: string) {
  return value
    ? new Date(value).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    : "—";
}

async function edgeError(error: unknown) {
  const candidate = error as { context?: { json?: () => Promise<unknown> } };
  try {
    if (candidate?.context?.json) {
      const payload = (await candidate.context.json()) as {
        error?: string;
        code?: string;
      };
      return payload.error || "Não foi possível gerar o cardápio.";
    }
  } catch {
    // Use the safe message below when the response is not JSON.
  }
  return "Não foi possível gerar o cardápio. Tente novamente em instantes.";
}

export function ProWorkspace({ onRefresh, userId, active = true }: { onRefresh: () => void; userId: string; active?: boolean }) {
  const [activeTool, setActiveTool] = useState<Tool>("overview");
  const [photoVisited, setPhotoVisited] = useState(false);
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [draft, setDraft] = useState<NutritionDraft>(
    () => nutritionDraft(DEFAULT_NUTRITION_PROFILE),
  );
  const [profileError, setProfileError] = useState("");
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [access, setAccess] = useState<NutritionAccess | null>(null);
  const [selectedPlanDay, setSelectedPlanDay] = useState(0);
  const [day, setDay] = useState(localDateValue);
  const currentDayRef = useRef(day);
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [food, setFood] = useState<FoodDraft>(emptyFood);
  const [waterAmount, setWaterAmount] = useState("250");
  const [checkedShopping, setCheckedShopping] = useState<string[]>([]);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [shoppingCopy, setShoppingCopy] = useState("");
  const [shoppingNotice, setShoppingNotice] = useState("");
  const [foodError, setFoodError] = useState("");
  const [waterError, setWaterError] = useState("");
  const [loadedDay, setLoadedDay] = useState("");
  const [loading, setLoading] = useState(true);
  const [coreError, setCoreError] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState(false);
  const dayController = useRef<AbortController | null>(null);
  const coreController = useRef<AbortController | null>(null);
  const coreLoaded = useRef(false);
  const operation = useRef(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(nutritionDraft(profile || DEFAULT_NUTRITION_PROFILE));
  const profileDirtyRef = useRef(false);
  const profileDetailsRef = useRef<HTMLDetailsElement>(null);
  const foodFormRef = useRef<HTMLFormElement>(null);
  const toolNavRef = useRef<HTMLElement>(null);
  useEffect(() => { profileDirtyRef.current = draftDirty; }, [draftDirty]);
  useEffect(() => {
    if (!draftDirty && JSON.stringify(food) === JSON.stringify(emptyFood)) return;
    const protect = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [draftDirty, food]);
  useEffect(() => {
    if (active) toolNavRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTool, active]);
  useEffect(() => { if (activeTool === "food-photo") setPhotoVisited(true); }, [activeTool]);

  const loadCore = useCallback(async () => {
    if (operation.current) return;
    coreController.current?.abort();
    const controller = new AbortController();
    coreController.current = controller;
    if (!coreLoaded.current) setLoading(true);
    setCoreError(false);
    setMessage("");
    try {
      const supabase = createClient();
      const [profileResult, planResult, accessResult] = await Promise.all([
        supabase
          .from("summer_nutrition_profiles")
          .select(
            "user_id,goal,age,height_cm,weight_kg,activity_level,dietary_preference,allergies,disliked_foods,meals_per_day,water_target_ml,updated_at",
          )
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase
          .from("summer_meal_plans")
          .select(
            "id,profile_snapshot,targets,days,shopping_list,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .abortSignal(controller.signal)
          .maybeSingle(),
        supabase.rpc("summer_get_nutrition_access").abortSignal(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (profileResult.error) throw profileResult.error;
      if (planResult.error) throw planResult.error;
      if (accessResult.error) throw accessResult.error;
      const savedProfile = profileResult.data as NutritionProfile | null;
      setProfile(savedProfile);
      if (savedProfile && !profileDirtyRef.current) setDraft(nutritionDraft(savedProfile));
      setPlan(readMealPlan(planResult.data));
      setAccess(accessResult.data as NutritionAccess);
      coreLoaded.current = true;
    } catch {
      if (controller.signal.aborted) return;
      setCoreError(!coreLoaded.current);
      setMessage(
        "Não foi possível carregar o painel PRO. Atualize a página e tente novamente.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const loadDay = useCallback(async () => {
    if (day !== currentDayRef.current) return false;
    dayController.current?.abort();
    const controller = new AbortController();
    dayController.current = controller;
    setDayLoading(true);
    setDayError(false);
    setEntries([]);
    setWaterEntries([]);
    try {
      const supabase = createClient();
      const [foodResult, waterResult] = await Promise.all([
        supabase
          .from("summer_calorie_entries")
          .select(
            "id,label,meal_type,calories,protein_g,carbs_g,fat_g",
          )
          .eq("day", day)
          .order("created_at")
          .abortSignal(controller.signal),
        supabase
          .from("summer_water_entries")
          .select("id,amount_ml,created_at")
          .eq("day", day)
          .order("created_at")
          .abortSignal(controller.signal),
      ]);
      if (foodResult.error) throw foodResult.error;
      if (waterResult.error) throw waterResult.error;
      if (controller.signal.aborted || day !== currentDayRef.current) return false;
      setEntries((foodResult.data || []) as NutritionEntry[]);
      setWaterEntries((waterResult.data || []) as WaterEntry[]);
      setLoadedDay(day);
      return true;
    } catch {
      if (controller.signal.aborted || day !== currentDayRef.current) return false;
      setDayError(true);
      setEntries([]);
      setWaterEntries([]);
      setMessage("Não foi possível carregar os registros deste dia.");
      return false;
    } finally {
      if (!controller.signal.aborted && day === currentDayRef.current) setDayLoading(false);
    }
  }, [day]);
  const latestLoadDay = useRef(loadDay);
  useEffect(() => { latestLoadDay.current = loadDay; }, [loadDay]);

  useEffect(() => {
    if (active) void loadCore();
    return () => coreController.current?.abort();
  }, [active, loadCore]);
  useEffect(() => {
    if (active) void loadDay();
    return () => dayController.current?.abort();
  }, [active, loadDay]);

  const targets = useMemo(
    () => plan?.targets || (profile ? calculateNutritionTargets(profile) : calculateNutritionTargets(DEFAULT_NUTRITION_PROFILE)),
    [plan, profile],
  );
  const totals = useMemo(() => nutritionTotals(entries), [entries]);
  const waterTotal = waterEntries.reduce(
    (total, item) => total + Number(item.amount_ml || 0),
    0,
  );
  const dayUnavailable = dayLoading || dayError || loadedDay !== day;
  const groceries = useMemo(() => shoppingItems(plan?.shopping_list || []), [plan]);
  const shoppingKey = plan ? `summer-shopping:${userId}:${plan.id}` : "";
  useEffect(() => {
    setShoppingCopy("");
    setShoppingNotice("");
    setPendingOnly(false);
    try { setCheckedShopping(readShoppingChecks(localStorage.getItem(shoppingKey), groceries.map((item) => item.id))); }
    catch { setCheckedShopping([]); }
  }, [shoppingKey, groceries]);
  function updateShopping(next: string[]) {
    setCheckedShopping(next);
    setShoppingCopy("");
    try { localStorage.setItem(shoppingKey, JSON.stringify(next)); }
    catch { setShoppingNotice("Você pode marcar os itens agora, mas as marcações podem não ser mantidas ao fechar esta página."); }
  }
  async function copyShopping() {
    const text = shoppingText(groceries.filter((item) => !checkedShopping.includes(item.id)));
    try { await navigator.clipboard.writeText(text); setShoppingNotice("Lista de itens pendentes copiada."); }
    catch { setShoppingCopy(text); setShoppingNotice("Selecione e copie a lista abaixo."); }
  }
  function changeDay(next: string) {
    if (!next || busy) return;
    if (JSON.stringify(food) !== JSON.stringify(emptyFood) && !window.confirm("Há uma refeição ainda não registrada. Descartar o preenchimento e mudar o dia?")) return;
    setFood(emptyFood);
    setFoodError("");
    setWaterError("");
    setMessage("");
    currentDayRef.current = next;
    setDay(next);
  }
  function selectTool(tool: Tool) {
    setActiveTool(tool);
    window.requestAnimationFrame(() => toolNavRef.current?.scrollIntoView({ block: "start" }));
  }
  function prepareMeal(meal: Meal) {
    if (busy || (JSON.stringify(food) !== JSON.stringify(emptyFood) && !window.confirm("Substituir a refeição ainda não registrada pelos dados do cardápio?"))) return;
    setFood({ label: meal.name, meal_type: meal.mealType, calories: String(meal.calories), protein_g: String(meal.protein_g), carbs_g: String(meal.carbs_g), fat_g: String(meal.fat_g) });
    setFoodError("");
    setActiveTool("diary");
    setMessage(`Revise a porção e os valores para registrar em ${diaryDayLabel(day)}. A refeição ainda não foi salva.`);
    window.requestAnimationFrame(() => foodFormRef.current?.scrollIntoView({ block: "start" }));
  }

  async function saveProfile(generate: boolean) {
    if (operation.current || busy) return;
    setProfileError("");
    let parsed: NutritionProfile;
    try {
      parsed = parseNutritionDraft(draft);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Revise os dados do perfil nutricional.");
      profileDetailsRef.current?.setAttribute("open", "");
      return;
    }
    if (generate && !access?.allowed) {
      setMessage("Não há gerações de cardápio disponíveis no momento. Você pode salvar seu perfil e continuar usando o cardápio atual.");
      return;
    }
    if (generate && plan && !window.confirm(`Gerar um novo cardápio usa 1 dos ${access?.remaining} disponíveis e substitui o cardápio e a lista de compras atuais. Continuar?`)) return;
    coreController.current?.abort();
    operation.current = true;
    setBusy(generate ? "generate" : "profile");
    setMessage("");
    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError;
      const normalized: NutritionProfile = {
        ...parsed,
        user_id: auth.user.id,
        age: parsed.age,
        height_cm: Math.round(parsed.height_cm * 10) / 10,
        weight_kg: Math.round(parsed.weight_kg * 10) / 10,
        meals_per_day: parsed.meals_per_day,
        water_target_ml: parsed.water_target_ml,
        allergies: draft.allergies.trim(),
        disliked_foods: draft.disliked_foods.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("summer_nutrition_profiles")
        .upsert(normalized, { onConflict: "user_id" });
      if (error) throw error;
      setProfile(normalized);
      setDraft(nutritionDraft(normalized));
      if (!generate) {
        setMessage("Perfil nutricional salvo.");
        return;
      }
      const { data, error: functionError } = await supabase.functions.invoke(
        "generate-nutrition-plan",
        { body: { action: "generate" } },
      );
      if (functionError || !data?.plan) {
        setMessage(await edgeError(functionError));
        return;
      }
      const generated = readMealPlan(data.plan);
      if (!generated) throw new Error("invalid_plan");
      setPlan(generated);
      setCheckedShopping([]);
      setAccess((current) =>
        current
          ? {
              ...current,
              used: current.used + 1,
              remaining: Math.max(0, current.remaining - 1),
              allowed: current.is_pro && current.remaining > 1,
            }
          : current,
      );
      setSelectedPlanDay(0);
      selectTool("menu");
      setMessage("Seu cardápio personalizado de 7 dias está pronto.");
    } catch {
      setMessage(
        "Não foi possível salvar ou gerar o cardápio. Confira sua conexão e tente novamente.",
      );
      onRefresh();
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  async function addFood(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operation.current || busy || dayUnavailable) return;
    let parsed: ReturnType<typeof parseFoodEntry>;
    try { parsed = parseFoodEntry(food); }
    catch (error) { setFoodError(error instanceof Error ? error.message : "Revise os dados da refeição."); return; }
    operation.current = true;
    setFoodError("");
    setBusy("food");
    setMessage("");
    try {
      const { error } = await createClient()
        .from("summer_calorie_entries")
        .insert({
          day,
          ...parsed,
        });
      if (error) throw error;
      setFood(emptyFood);
      const refreshed = await loadDay();
      setMessage(refreshed ? "Refeição registrada." : "Refeição salva. Recarregue os registros do dia para conferir os totais.");
    } catch {
      setMessage("Não foi possível registrar esta refeição.");
      onRefresh();
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  async function removeFood(id: string) {
    if (operation.current || busy || dayUnavailable || !window.confirm("Excluir este registro alimentar?")) return;
    operation.current = true;
    setBusy(`food-${id}`);
    try {
      const { data, error } = await createClient()
        .from("summer_calorie_entries")
        .delete()
        .eq("id", id)
        .select("id");
      if (error || !data?.length) throw error;
      await loadDay();
    } catch {
      setMessage("Não foi possível excluir o registro.");
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  async function addWater(amount: number) {
    if (operation.current || busy || dayUnavailable || !Number.isInteger(amount) || amount < 50 || amount > 5000) return;
    operation.current = true;
    setWaterError("");
    setBusy("water");
    setMessage("");
    try {
      const { error } = await createClient()
        .from("summer_water_entries")
        .insert({ day, amount_ml: amount });
      if (error) throw error;
      const refreshed = await loadDay();
      setMessage(refreshed ? `${amount} ml de água registrados.` : "Água registrada. Recarregue os registros do dia para conferir o total.");
    } catch {
      setMessage("Não foi possível registrar a água.");
      onRefresh();
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  async function removeWater(id: number) {
    if (operation.current || busy || dayUnavailable) return;
    operation.current = true;
    setBusy(`water-${id}`);
    try {
      const { data, error } = await createClient()
        .from("summer_water_entries")
        .delete()
        .eq("id", id)
        .select("id");
      if (error || !data?.length) throw error;
      await loadDay();
    } catch {
      setMessage("Não foi possível remover este registro de água.");
    } finally {
      operation.current = false;
      setBusy("");
    }
  }

  const selectedDay = plan?.days[selectedPlanDay];

  return (
    <section className={`pro-workspace ${styles.workspace}`} aria-label="Ferramentas Summer PRO">
      <div className="pro-workspace-heading">
        <div>
          <p className="eyebrow">SUAS FERRAMENTAS PRO</p>
          <h2 className="panel-title">Nutrição, do seu jeito.</h2>
          <p>Planeje suas refeições. Cuide de você, um dia de cada vez.</p>
        </div>
        {access && (
          <span className="ai-usage-badge">
            <Sparkles size={15} /> {access.remaining} de {access.monthly_limit}{" "}
            cardápios disponíveis
          </span>
        )}
      </div>

      <nav className="pro-tool-tabs" ref={toolNavRef} aria-label="Recursos do Summer PRO">
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={activeTool === id ? "active" : ""}
            aria-pressed={activeTool === id}
            onClick={() => selectTool(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      <div role="status" aria-live="polite" aria-atomic="true">
        {message && <div className="notice"><span>{message}</span><button className="icon-button" aria-label="Fechar mensagem" onClick={() => setMessage("")}><X size={17} /></button></div>}
      </div>

      {loading ? (
        <div className="pro-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          Carregando seu espaço PRO...
        </div>
      ) : coreError ? (
        <div className="empty-state"><h3>Vamos tentar de novo?</h3><p>Seu painel não pôde ser carregado. Seus dados continuam salvos.</p><button className="secondary-button" onClick={() => void loadCore()}><RefreshCw size={16} />Tentar novamente</button></div>
      ) : (
        <>
          {activeTool === "overview" && (
            <div className="pro-overview">
              <section className={styles.dailySummary} aria-label="Resumo do diário alimentar">
                <div className={styles.dailySummaryHeading}>
                  <div><p className="eyebrow">UM CUIDADO DE CADA VEZ</p><h3>{day === localDateValue() ? "Como está seu dia?" : `Seu diário · ${diaryDayLabel(day)}`}</h3><p>Seus registros de alimentação e água, em um só lugar.</p></div>
                  <span className={styles.goalPill}>{profile ? GOAL_LABELS[profile.goal] : "Vamos começar"}</span>
                </div>
                <div className={styles.dailyNumbers}>
                  <div><Apple size={20} /><strong>{dayUnavailable ? "—" : totals.calories.toLocaleString("pt-BR")}<small> kcal registradas</small></strong><span>{profile ? `Referência: ${targets.calories_min.toLocaleString("pt-BR")}–${targets.calories_max.toLocaleString("pt-BR")} kcal` : "Salve o perfil para ver suas referências"}</span></div>
                  <div><Droplets size={20} /><strong>{dayUnavailable ? "—" : (waterTotal / 1000).toLocaleString("pt-BR")}<small> L de água</small></strong><span>{profile ? `Meta: ${(targets.water_ml / 1000).toLocaleString("pt-BR")} L` : "Sua meta será personalizada"}</span></div>
                  <div><Utensils size={20} /><strong>{dayUnavailable ? "—" : entries.length}<small> {entries.length === 1 ? "refeição registrada" : "refeições registradas"}</small></strong><span>Conte o que você já consumiu</span></div>
                </div>
                <div className={styles.summaryActions}>
                  <button className="primary-button" onClick={() => selectTool("diary")}><Plus size={17} />Registrar refeição ou água</button>
                  <button className="secondary-button" onClick={() => selectTool("food-photo")}><Camera size={17} />Usar foto da comida</button>
                </div>
                {dayError && <p className="notice">Não foi possível atualizar este resumo. <button className="text-button" onClick={() => void loadDay()}>Tentar novamente</button></p>}
              </section>
              {profile && <div className="pro-metric-grid">
                <article>
                  <Apple size={20} />
                  <span>Meta calórica</span>
                  <strong>
                    {targets.calories_min}–{targets.calories_max}
                    <small> kcal/dia</small>
                  </strong>
                </article>
                <article>
                  <Dumbbell size={20} />
                  <span>Proteína</span>
                  <strong>
                    {targets.protein_g}<small> g/dia</small>
                  </strong>
                </article>
                <article>
                  <Droplets size={20} />
                  <span>Água</span>
                  <strong>
                    {(targets.water_ml / 1000).toLocaleString("pt-BR")}
                    <small> L/dia</small>
                  </strong>
                </article>
                <article>
                  <CalendarDays size={20} />
                  <span>Cardápio atual</span>
                  <strong>
                    {plan ? "7 dias" : "Pendente"}
                    <small>{plan ? ` · ${dateLabel(plan.created_at)}` : ""}</small>
                  </strong>
                </article>
              </div>}
              {profile && plan && <p className={styles.inlineHint}>As referências acima são do cardápio atual. Alterar o perfil não modifica as refeições já geradas.</p>}

              <section className="pro-action-card featured">
                <div className="pro-action-icon">
                  <Sparkles size={25} />
                </div>
                <div>
                  <p className="eyebrow">NUTRIÇÃO COM IA</p>
                  <h4>
                    {plan
                      ? "Seu cardápio está pronto"
                      : "Crie seu primeiro cardápio personalizado"}
                  </h4>
                  <p>
                    {plan ? "Consulte as refeições e leve a lista de compras com você. Revise as porções antes de registrar o que consumiu." : "Responda ao perfil abaixo e receba sete dias de refeições, metas e lista de compras."}
                  </p>
                </div>
                {plan && (
                  <button
                    className="primary-button"
                    onClick={() => selectTool("menu")}
                  >
                    VER CARDÁPIO
                  </button>
                )}
              </section>

              <details className="nutrition-profile-details" ref={profileDetailsRef} open={!profile}>
                <summary><span>{profile ? "Ajustar meu perfil e preferências" : "Primeiro, vamos conhecer seu objetivo"}</span><span>{profile ? "Editar" : "Preencher perfil"}</span></summary>
              <form
                id="nutrition-profile"
                className="nutrition-profile-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveProfile(true);
                }}
              >
                <div className="section-heading">
                  <div>
                    <h4>Seu perfil nutricional</h4>
                    <p>Essas informações personalizam as metas e refeições.</p>
                  </div>
                  {profile && <span className={styles.profileState}>{draftDirty ? "Alterações não salvas" : "Perfil salvo"}</span>}
                </div>
                <fieldset className={styles.fieldset} disabled={Boolean(busy)}>
                <div className="nutrition-form-grid">
                  <label>
                    Objetivo
                    <select
                      value={draft.goal}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          goal: event.target.value as NutritionGoal,
                        })
                      }
                    >
                      {Object.entries(GOAL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Idade
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ex.: 22"
                      maxLength={3}
                      required
                      value={draft.age}
                      onChange={(event) =>
                        setDraft({ ...draft, age: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Altura (cm)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 175"
                      maxLength={6}
                      required
                      value={draft.height_cm}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          height_cm: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Peso (kg)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 80,5"
                      maxLength={6}
                      required
                      value={draft.weight_kg}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          weight_kg: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Nível de atividade
                    <select
                      value={draft.activity_level}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          activity_level: event.target.value as ActivityLevel,
                        })
                      }
                    >
                      {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Alimentação
                    <select
                      value={draft.dietary_preference}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          dietary_preference: event.target
                            .value as DietaryPreference,
                        })
                      }
                    >
                      {Object.entries(DIET_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Refeições por dia
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="De 3 a 6"
                      maxLength={1}
                      required
                      value={draft.meals_per_day}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          meals_per_day: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Meta de água (ml)
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ex.: 2500"
                      maxLength={4}
                      required
                      value={draft.water_target_ml}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          water_target_ml: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Alergias ou restrições
                    <input
                      maxLength={500}
                      placeholder="Ex.: amendoim, frutos do mar"
                      value={draft.allergies}
                      onChange={(event) =>
                        setDraft({ ...draft, allergies: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Alimentos que não gosta
                    <input
                      maxLength={500}
                      placeholder="Ex.: abacate, aveia"
                      value={draft.disliked_foods}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          disliked_foods: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                {profileError && <p className="nutrition-field-error" role="alert">{profileError}</p>}
                <div className="nutrition-form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(busy)}
                    onClick={() => void saveProfile(false)}
                  >
                    {busy === "profile" ? "SALVANDO PERFIL..." : "SALVAR PERFIL"}
                  </button>
                  <button
                    className="primary-button"
                    disabled={Boolean(busy) || access?.allowed === false}
                  >
                    {busy === "generate" ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    {busy === "generate" ? "PREPARANDO SEU CARDÁPIO..." : plan ? "GERAR NOVO CARDÁPIO" : "GERAR CARDÁPIO DE 7 DIAS"}
                  </button>
                </div>
                </fieldset>
                {busy === "generate" && <p className={styles.inlineHint} role="status">Estamos montando suas refeições. Isso pode levar um pouco; mantenha esta página aberta.</p>}
                <p className={styles.inlineHint}>Salvar o perfil não usa sua cota. Gerar um cardápio usa 1 geração disponível.</p>
                <small className="nutrition-disclaimer">
                  Seus dados de preferências e medidas são enviados à IA para criar sugestões. Não enviamos seu nome ou e-mail. Sugestões gerais para adultos. Não substituem nutricionista ou
                  orientação médica. Confira sempre ingredientes e alergias.
                </small>
              </form>
              </details>
              {profile && <div className="nutrition-quick-actions">
                <button className="secondary-button" onClick={() => selectTool("diary")}><Droplets size={18} />Registrar alimentação e água</button>
                <button className="secondary-button" onClick={() => selectTool("shopping")}><ShoppingBasket size={18} />Minha lista de compras</button>
              </div>}
              {access?.remaining === 0 && <p className="notice">Você usou os cardápios disponíveis neste mês. A cota renova em {dateLabel(access.period_ends_at)}. Seu cardápio atual continua disponível.</p>}
            </div>
          )}

          {activeTool === "menu" && (
            <div className="meal-plan-panel">
              {!plan ? (
                <div className="empty-state compact-empty">
                  <ChefHat size={30} />
                  <h3>Seu cardápio ainda não foi criado</h3>
                  <p>Complete o perfil para a IA montar os sete dias.</p>
                  <button
                    className="primary-button"
                    onClick={() => selectTool("overview")}
                  >
                    COMEÇAR AGORA
                  </button>
                </div>
              ) : (
                <>
                  <div className="meal-plan-header">
                    <div>
                      <p className="eyebrow">CARDÁPIO PERSONALIZADO</p>
                      <h4>7 dias para o seu objetivo</h4>
                      <p>
                        Gerado em {dateLabel(plan.created_at)} ·{" "}
                        {GOAL_LABELS[plan.profile_snapshot.goal]}
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      disabled={Boolean(busy) || access?.allowed === false}
                      onClick={() => void saveProfile(true)}
                    >
                      <RefreshCw size={16} />
                      {busy === "generate" ? "GERANDO..." : "GERAR NOVO"}
                    </button>
                  </div>
                  <div className="plan-day-tabs" aria-label="Dias do cardápio">
                    {plan.days.map((item, index) => (
                      <button
                        key={item.day}
                        className={selectedPlanDay === index ? "active" : ""}
                        aria-pressed={selectedPlanDay === index}
                        aria-label={item.day}
                        onClick={() => setSelectedPlanDay(index)}
                        type="button"
                      >
                        {item.day}
                      </button>
                    ))}
                  </div>
                  <p className="nutrition-disclaimer">Confira ingredientes, porções e alergias antes de seguir as sugestões. Em caso de condição de saúde, gestação ou necessidade alimentar específica, consulte um profissional.</p>
                  {selectedDay && (
                    <>
                      <div className={styles.selectedDayHeading}><h3>{selectedDay.day}</h3><span>{selectedDay.meals.length} refeições sugeridas</span></div>
                      <div className="day-target-summary">
                        <span>
                          <strong>{selectedDay.totals.calories}</strong> kcal
                        </span>
                        <span>
                          <strong>{selectedDay.totals.protein_g}</strong> g proteína
                        </span>
                        <span>
                          <strong>{selectedDay.totals.carbs_g}</strong> g carbo
                        </span>
                        <span>
                          <strong>{selectedDay.totals.fat_g}</strong> g gordura
                        </span>
                      </div>
                      <div className="meal-grid">
                        {selectedDay.meals.map((meal) => (
                          <article className="meal-card" key={meal.id}>
                            <div className="meal-card-top">
                              <span>{MEAL_LABELS[meal.mealType]}</span>
                              <small>{meal.prep_minutes} min</small>
                            </div>
                            <h5>{meal.name}</h5>
                            <p>{meal.description}</p>
                            <strong className="meal-portion">{meal.portion}</strong>
                            <div className="meal-macros">
                              <span>{meal.calories} kcal</span>
                              <span>{meal.protein_g} g proteína</span>
                              <span>{meal.carbs_g} g carboidratos</span>
                              <span>{meal.fat_g} g gorduras</span>
                            </div>
                            <details>
                              <summary>Ver ingredientes</summary>
                              <ul>
                                {meal.ingredients.map((ingredient) => (
                                  <li key={ingredient}>{ingredient}</li>
                                ))}
                              </ul>
                            </details>
                            <button className={`secondary-button ${styles.useMeal}`} disabled={Boolean(busy)} onClick={() => prepareMeal(meal)}><Plus size={16} />Usar no diário<span className={styles.srOnly}>: {meal.name}</span></button>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {activeTool === "diary" && (
            <div className="nutrition-diary">
              <div className="diary-heading">
                <div>
                  <p className="eyebrow">ACOMPANHAMENTO DIÁRIO</p>
                  <h4>Calorias, macros e água</h4>
                </div>
                <div className={styles.dayPicker}>
                  <div className={styles.dayShortcuts}>
                    <button type="button" className="icon-button" aria-label="Dia anterior" disabled={Boolean(busy)} onClick={() => changeDay(shiftDiaryDay(day, -1))}><ChevronLeft size={18} /></button>
                    <button type="button" className="secondary-button" disabled={Boolean(busy) || day === localDateValue()} onClick={() => changeDay(localDateValue())}>Hoje</button>
                    <button type="button" className="icon-button" aria-label="Dia seguinte" disabled={Boolean(busy)} onClick={() => changeDay(shiftDiaryDay(day, 1))}><ChevronRight size={18} /></button>
                  </div>
                <label htmlFor="nutrition-day">
                  Dia do registro
                  <input
                    id="nutrition-day"
                    type="date"
                    value={day}
                    disabled={Boolean(busy)}
                    onChange={(event) => changeDay(event.target.value)}
                  />
                </label>
                </div>
              </div>
              <p className={styles.diaryDate}>{day === localDateValue() ? "Hoje" : diaryDayLabel(day)} · Todos os registros abaixo pertencem a este dia.</p>
              {!profile && <p className="notice">Complete e salve seu perfil em Visão geral para personalizar as metas.</p>}
              {dayLoading && <p role="status" className="notice">Carregando os registros do dia…</p>}
              {dayError && <button className="secondary-button" onClick={() => void loadDay()}>Tentar carregar novamente</button>}
              <div className="macro-progress-grid">
                {[
                  {
                    label: "Calorias",
                    value: totals.calories,
                    target: targets.calories_max,
                    unit: "kcal",
                  },
                  {
                    label: "Proteína",
                    value: totals.protein_g,
                    target: targets.protein_g,
                    unit: "g",
                  },
                  {
                    label: "Carboidratos",
                    value: totals.carbs_g,
                    target: targets.carbs_g,
                    unit: "g",
                  },
                  {
                    label: "Gorduras",
                    value: totals.fat_g,
                    target: targets.fat_g,
                    unit: "g",
                  },
                ].map((item) => (
                  <article key={item.label}>
                    <span>{item.label}</span>
                    <strong>
                      {dayUnavailable ? "—" : item.value.toLocaleString("pt-BR")} <small>/ {profile ? item.target.toLocaleString("pt-BR") : "—"} {item.unit}</small>
                    </strong>
                    <div className="macro-track" role="progressbar" aria-label={item.label} aria-valuenow={dayUnavailable || !profile ? 0 : progressPercent(item.value, item.target)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={dayUnavailable ? "Registros indisponíveis" : `${item.value} ${item.unit} registrados${profile ? `; referência ${item.target} ${item.unit}` : ""}`}>
                      <i style={{ width: dayUnavailable || !profile ? "0%" : percentage(item.value, item.target) }} />
                    </div>
                  </article>
                ))}
              </div>

              <section className="water-card">
                <div className="water-ring">
                  <Droplets size={24} />
                  <strong>{dayUnavailable ? "—" : waterTotal.toLocaleString("pt-BR")} ml</strong>
                  <span>{profile ? `de ${targets.water_ml} ml` : "Meta ainda não definida"}</span>
                </div>
                <div className="water-controls">
                  <h5>Registrar água</h5>
                  <p>
                    {dayUnavailable ? "Carregue os registros para acompanhar sua água." : !profile ? "Salve seu perfil para definir uma meta de água." : waterTotal >= targets.water_ml ? "Meta de água alcançada neste dia." : `${Math.max(0, targets.water_ml - waterTotal).toLocaleString("pt-BR")} ml restantes para sua meta.`}
                  </p>
                  <div>
                    <button
                      className="secondary-button"
                      disabled={Boolean(busy) || dayUnavailable}
                      onClick={() => void addWater(250)}
                    >
                      + 250 ml
                    </button>
                    <button
                      className="secondary-button"
                      disabled={Boolean(busy) || dayUnavailable}
                      onClick={() => void addWater(500)}
                    >
                      + 500 ml
                    </button>
                  </div>
                  <form className="custom-water" noValidate onSubmit={(event) => {
                    event.preventDefault();
                    try { void addWater(parseWaterAmount(waterAmount)); }
                    catch (error) { setWaterError(error instanceof Error ? error.message : "Confira a quantidade de água."); }
                  }}>
                    <input
                      aria-label="Quantidade personalizada de água"
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      disabled={Boolean(busy) || dayUnavailable}
                      aria-describedby={waterError ? "water-amount-error" : undefined}
                      aria-invalid={Boolean(waterError)}
                      value={waterAmount}
                      onChange={(event) => setWaterAmount(event.target.value)}
                    />
                    <button
                      className="primary-button"
                      disabled={Boolean(busy) || dayUnavailable}
                    >
                      ADICIONAR
                    </button>
                  </form>
                  {waterError && <p className={styles.waterError} id="water-amount-error" role="alert">{waterError}</p>}
                </div>
              </section>
              {waterEntries.length > 0 && (
                <div className="water-history">
                  {waterEntries.map((item) => (
                    <span key={item.id}>
                      {item.amount_ml} ml
                      <button
                        aria-label={`Remover ${item.amount_ml} ml`}
                        disabled={Boolean(busy) || dayUnavailable}
                        onClick={() => void removeWater(item.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <form className="food-log-form" ref={foodFormRef} noValidate onSubmit={addFood} aria-busy={busy === "food"}>
                <div className="section-heading">
                  <div>
                    <h4>Registrar refeição</h4>
                    <p>Registro em {diaryDayLabel(day)}. Os macros são opcionais. Calorias são arredondadas para o valor inteiro mais próximo.</p>
                  </div>
                  <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => selectTool("food-photo")}><Camera size={17} />Registrar por foto</button>
                </div>
                <fieldset className={styles.fieldset} disabled={Boolean(busy) || dayUnavailable}>
                <div className="food-log-grid">
                  <label className="wide-field">
                    Alimento ou refeição
                    <input
                      required
                      maxLength={100}
                      placeholder="Ex.: Almoço"
                      value={food.label}
                      onChange={(event) =>
                        setFood({ ...food, label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={food.meal_type}
                      onChange={(event) =>
                        setFood({
                          ...food,
                          meal_type: event.target.value as MealType,
                        })
                      }
                    >
                      {Object.entries(MEAL_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Calorias
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      maxLength={8}
                      value={food.calories}
                      onChange={(event) =>
                        setFood({ ...food, calories: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Proteína (g)
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={7}
                      value={food.protein_g}
                      onChange={(event) =>
                        setFood({ ...food, protein_g: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Carboidratos (g)
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={7}
                      value={food.carbs_g}
                      onChange={(event) =>
                        setFood({ ...food, carbs_g: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Gorduras (g)
                    <input
                      type="text"
                      inputMode="decimal"
                      maxLength={7}
                      value={food.fat_g}
                      onChange={(event) =>
                        setFood({ ...food, fat_g: event.target.value })
                      }
                    />
                  </label>
                  <button className="primary-button" disabled={Boolean(busy)}>
                    {busy === "food" ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} {busy === "food" ? "REGISTRANDO..." : "REGISTRAR REFEIÇÃO"}
                  </button>
                </div>
                </fieldset>
                {foodError && <p className="nutrition-field-error" role="alert">{foodError}</p>}
              </form>

              <div className={styles.entriesHeading}><h4>Refeições registradas</h4><span>{dayUnavailable ? "—" : entries.length} {entries.length === 1 ? "registro" : "registros"}</span></div>
              <div className="food-log-list">
                {entries.map((entry) => (
                  <article key={entry.id}>
                    <div>
                      <span>{MEAL_LABELS[entry.meal_type] || "Refeição"}</span>
                      <strong>{entry.label}</strong>
                    </div>
                    <p>
                      {entry.calories} kcal · {entry.protein_g}g P ·{" "}
                      {entry.carbs_g}g C · {entry.fat_g}g G
                    </p>
                    <button
                      className="icon-button"
                      disabled={Boolean(busy)}
                      aria-label={`Excluir ${entry.label}`}
                      onClick={() => void removeFood(entry.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                ))}
                {!entries.length && !dayUnavailable && <div className={styles.diaryEmpty}><Utensils size={26} /><strong>Seu dia começa com o primeiro registro.</strong><p>Use o formulário acima ou fotografe sua refeição para revisar os valores antes de salvar.</p></div>}
              </div>
            </div>
          )}

          {activeTool === "shopping" && (
            <div className="shopping-panel">
              {!plan ? (
                <div className="empty-state compact-empty">
                  <ShoppingBasket size={30} />
                  <h3>Gere um cardápio primeiro</h3>
                  <p>A lista de compras será montada automaticamente.</p>
                  <button
                    className="primary-button"
                    onClick={() => selectTool("overview")}
                  >
                    CRIAR CARDÁPIO
                  </button>
                </div>
              ) : (
                <>
                  <div className="meal-plan-header">
                    <div>
                      <p className="eyebrow">LISTA AUTOMÁTICA</p>
                      <h4>Compras para os 7 dias</h4>
                      <p>{plan.shopping_list.length} itens organizados por categoria.</p>
                    </div>
                    <span className="shopping-count">
                      <ListChecks size={17} /> {checkedShopping.length} de {groceries.length} itens
                    </span>
                  </div>
                  <div className={styles.shoppingProgress} role="progressbar" aria-label="Compras concluídas" aria-valuemin={0} aria-valuemax={groceries.length || 1} aria-valuenow={checkedShopping.length}><span style={{ width: percentage(checkedShopping.length, groceries.length) }} /></div>
                  <div className={styles.shoppingActions}>
                    <button className="secondary-button" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}><ListChecks size={17} />{pendingOnly ? "Mostrar todos" : "Só os pendentes"}</button>
                    <button className="secondary-button" disabled={checkedShopping.length === groceries.length} onClick={() => void copyShopping()}><ClipboardCopy size={17} />Copiar pendentes</button>
                    <button className="text-button" disabled={!checkedShopping.length} onClick={() => { if (window.confirm("Desmarcar os itens desta lista de compras?")) updateShopping([]); }}>Desmarcar itens</button>
                  </div>
                  <p className={styles.inlineHint}>As marcações ficam guardadas neste aparelho para este cardápio.</p>
                  <div role="status" aria-live="polite">{shoppingNotice && <p className={styles.inlineHint}>{shoppingNotice}</p>}</div>
                  {shoppingCopy && <textarea className={styles.copyList} aria-label="Lista de compras para copiar" readOnly rows={8} value={shoppingCopy} onFocus={(event) => event.target.select()} />}
                  {groceries.length > 0 && checkedShopping.length === groceries.length && <div className={styles.shoppingComplete}><Check size={22} /><div><strong>Tudo marcado. Lista concluída!</strong><p>Você pode consultar todos os itens ou desmarcar para organizar as próximas compras.</p></div></div>}
                  <div className="shopping-groups">
                    {Array.from(
                      new Set(groceries.filter((item) => !pendingOnly || !checkedShopping.includes(item.id)).map((item) => item.category)),
                    ).map((category) => (
                      <section key={category}>
                        <h5>{category}</h5>
                        {groceries
                          .filter((item) => item.category === category && (!pendingOnly || !checkedShopping.includes(item.id)))
                          .map((item) => {
                            const id = item.id;
                            return (
                              <label key={id}>
                                <input
                                  type="checkbox"
                                  checked={checkedShopping.includes(id)}
                                  onChange={(event) =>
                                    updateShopping(
                                      event.target.checked
                                        ? [...checkedShopping, id]
                                        : checkedShopping.filter((value) => value !== id),
                                    )
                                  }
                                />
                                <span>{item.name}</span>
                                <small>{item.quantity}</small>
                              </label>
                            );
                          })}
                      </section>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {(photoVisited || activeTool === "food-photo") && (
            <div hidden={activeTool !== "food-photo"}><div className={styles.photoDate}><span><CalendarDays size={17} />Diário de {diaryDayLabel(day)}</span><button className="text-button" onClick={() => selectTool("diary")}>Alterar dia no diário</button></div><FoodPhotoAnalyzer day={day} onSaved={async () => { if (!await latestLoadDay.current()) throw new Error("refresh_failed"); }} /></div>
          )}
        </>
      )}
    </section>
  );
}
