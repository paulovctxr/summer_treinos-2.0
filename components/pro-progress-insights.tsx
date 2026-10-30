"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  Clock3,
  Dumbbell,
  Flame,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { MAX_SESSIONS, proProgressInsights, type WorkoutSession } from "@/lib/fitness";
import styles from "./pro-membership.module.css";

type Period = "30" | "90" | "all";
const periods = [{ value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "all", label: "Todo o histórico" }] as const;

export function ProProgressInsights({
  sessions,
}: {
  sessions: WorkoutSession[];
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [allRecords, setAllRecords] = useState(false);
  const filteredSessions = useMemo(() => {
    if (period === "all") return sessions;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - Number(period) + 1);
    return sessions.filter((session) => new Date(session.completedAt) >= since);
  }, [period, sessions]);
  const insights = useMemo(() => proProgressInsights(filteredSessions), [filteredSessions]);
  const [selectedExercise, setSelectedExercise] = useState("");
  const selected =
    insights.progress.find((item) => item.name === selectedExercise) ||
    insights.progress[0];
  const points = selected?.points.slice(-12) || [];
  const maxWeight = Math.max(
    1,
    ...points.map((point) => point.weightKg),
  );

  return (
    <div className={`pro-progress-insights ${styles.progress}`}>
      <div className="pro-progress-heading">
        <div>
          <p className="eyebrow">EVOLUÇÃO COMPLETA</p>
          <h3>Estatísticas dos seus treinos</h3>
          <p>Dados reais dos seus treinos concluídos, com base nos últimos {MAX_SESSIONS} registros salvos.</p>
        </div>
        <span className="pro-only-badge">⭐ SUMMER PRO</span>
      </div>

      <div className={styles.periodFilter} role="group" aria-label="Período das estatísticas">
        {periods.map(({ value, label }) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setAllRecords(false); }}>{label}</button>)}
      </div>
      <p className={styles.periodSummary} role="status">{insights.totalSessions} {insights.totalSessions === 1 ? "treino concluído" : "treinos concluídos"} · {period === "all" ? "Todo o histórico salvo" : `Últimos ${period} dias`}</p>

      <div className="pro-stat-grid">
        <article>
          <CalendarCheck size={21} />
          <span>Treinos no período</span>
          <strong>{insights.totalSessions}</strong>
        </article>
        <article>
          <TrendingUp size={21} />
          <span>Média por treino</span>
          <strong>{insights.averageMinutes} <small>min</small></strong>
        </article>
        <article>
          <Clock3 size={21} />
          <span>Tempo total</span>
          <strong>
            {insights.totalMinutes} <small>min</small>
          </strong>
        </article>
        <article>
          <Flame size={21} />
          <span>Sequência no período</span>
          <strong>
            {insights.streakDays} <small>dias</small>
          </strong>
        </article>
      </div>

      {!insights.totalSessions && <div className={styles.progressEmpty}><Dumbbell size={24} aria-hidden="true" /><div><strong>{period === "all" ? "Seu próximo treino começa esta história" : "Nenhum treino neste período"}</strong><p>{period === "all" ? "Conclua um treino para acompanhar sua constância e evolução por aqui." : "Escolha outro período para consultar os seus registros anteriores."}</p>{period !== "all" && <button className="text-button" type="button" onClick={() => setPeriod("all")}>Ver todo o histórico</button>}</div></div>}

      <div className="progress-detail-grid">
        <section className="load-progress-card">
          <div className="section-heading">
            <div>
              <h4>Evolução de cargas</h4>
              <p>Até 12 registros no período selecionado. Cargas em kg.</p>
            </div>
            {insights.progress.length > 0 && (
              <select
                aria-label="Escolher exercício para o gráfico"
                value={selected?.name || ""}
                onChange={(event) => setSelectedExercise(event.target.value)}
              >
                {insights.progress.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            )}
          </div>
          {selected ? (
            <>
            <div className={styles.chartSummary}><span>{selected.name}</span><strong>Última carga: {points[points.length - 1].weightKg.toLocaleString("pt-BR")} kg</strong></div>
            <div className={`load-chart ${styles.loadChart}`} role="region" aria-label={`Evolução de cargas de ${selected.name}. Role para ver os registros.`} tabIndex={0}>
              {points.map((point, index) => (
                <div
                  className="load-bar-column"
                  key={`${point.completedAt}-${index}`}
                >
                  <strong>{point.weightKg.toLocaleString("pt-BR")} kg</strong>
                  <div>
                    <i
                      aria-hidden="true"
                      style={{
                        height: `${Math.max(8, (point.weightKg / maxWeight) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>
                    {new Date(point.completedAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </small>
                </div>
              ))}
            </div>
            <details className={styles.chartData}>
              <summary>Ver registros em tabela</summary>
              <table><caption>Cargas de {selected.name}</caption><thead><tr><th scope="col">Data</th><th scope="col">Carga</th></tr></thead><tbody>{points.map((point, index) => <tr key={`${point.completedAt}-${index}`}><td>{new Date(point.completedAt).toLocaleDateString("pt-BR")}</td><td>{point.weightKg.toLocaleString("pt-BR")} kg</td></tr>)}</tbody></table>
            </details>
            </>
          ) : (
            <div className="progress-empty-inline">
              <Dumbbell size={26} />
              <div>
                <strong>As cargas aparecerão aqui</strong>
                <p>
                  Registre uma carga na ficha e conclua o treino para iniciar o
                  gráfico.
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="records-card">
          <div className="section-heading">
            <div>
              <h4>Recordes pessoais</h4>
              <p>Maior carga registrada por exercício.</p>
            </div>
            <Trophy size={22} />
          </div>
          <div className="records-list">
            {(allRecords ? insights.records : insights.records.slice(0, 10)).map((record, index) => (
              <article key={record.name}>
                <span>{index + 1}</span>
                <div>
                  <strong>{record.name}</strong>
                  <small>
                    {new Date(record.completedAt).toLocaleDateString("pt-BR")}
                  </small>
                </div>
                <b>{record.weightKg.toLocaleString("pt-BR")} kg</b>
              </article>
            ))}
            {!insights.records.length && (
              <p>Nenhum recorde de carga registrado ainda.</p>
            )}
          </div>
          {insights.records.length > 10 && <button type="button" className="text-button" aria-expanded={allRecords} onClick={() => setAllRecords((value) => !value)}>{allRecords ? "Mostrar menos recordes" : `Ver todos os ${insights.records.length} recordes`}</button>}
        </section>
      </div>
    </div>
  );
}
