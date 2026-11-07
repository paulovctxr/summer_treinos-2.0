import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AssessmentWorkspace } from '@/components/assessment-workspace';
export const dynamic = 'force-dynamic';
export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: team } = await supabase.rpc('summer_is_assessment_team');
  if (team === true) redirect('/professor');
  return <AssessmentWorkspace />;
}
