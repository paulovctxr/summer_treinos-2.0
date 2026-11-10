import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AssessmentWorkspace } from '@/components/assessment-workspace';
export const dynamic = 'force-dynamic';
export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const [{ data: team }, { data: admin }] = await Promise.all([
    supabase.rpc('summer_is_assessment_team'),
    supabase.rpc('summer_is_admin'),
  ]);
  if (team === true || admin === true) redirect('/professor');
  return <AssessmentWorkspace />;
}
