import { createClient } from '@/lib/supabase/server';
import { AssessmentLogin } from '@/components/assessment-login';
import { AssessmentWorkspace } from '@/components/assessment-workspace';
export const dynamic = 'force-dynamic';
export default async function ProfessorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <AssessmentLogin />;
  const [{ data: team }, { data: admin }] = await Promise.all([supabase.rpc('summer_is_assessment_team'),supabase.rpc('summer_is_admin')]);
  if (team !== true && admin !== true) return <AssessmentLogin restricted />;
  return <AssessmentWorkspace teacher />;
}
