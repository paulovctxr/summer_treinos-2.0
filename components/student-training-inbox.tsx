'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  workoutsFromTrainingPlan,
  type TrainingPlan,
  type TrainingSummary,
} from '@/lib/training-plans';
import type { Workout } from '@/lib/fitness';

/**
 * Published teacher plans are synchronized into the student's regular
 * workout collection. The component intentionally renders nothing: after
 * synchronization the cards are rendered by the same list as manually
 * created workouts.
 */
export function StudentTrainingInbox({
  onImport,
}: {
  onImport: (workouts: Workout[]) => Promise<boolean>;
}): null {
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;

  const load = useCallback(async () => {
    try {
      const summaries: TrainingSummary[] = [];
      for (let offset = 0; offset < 1000; offset += 30) {
        const { data, error } = await createClient().rpc(
          'summer_training_list',
          { p_offset: offset },
        );
        if (error) {
          if (error.code === 'PGRST202') return;
          throw error;
        }
        const page = Array.isArray(data) ? (data as TrainingSummary[]) : [];
        summaries.push(...page);
        if (page.length < 30) break;
      }
      if (!summaries.length) return;

      const plans = (
        await Promise.all(
          summaries.map(async (summary) => {
            const { data, error } = await createClient().rpc(
              'summer_training_get',
              { p_id: summary.id },
            );
            if (error) throw error;
            return data as TrainingPlan | null;
          }),
        )
      ).filter(
        (plan): plan is TrainingPlan =>
          Boolean(plan && plan.status === 'published'),
      );
      const workouts = plans.flatMap(workoutsFromTrainingPlan);
      if (workouts.length) await onImportRef.current(workouts);
    } catch {
      // The regular workout list remains available if the optional sync is offline.
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden && navigator.onLine) void load();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [load]);

  return null;
}
