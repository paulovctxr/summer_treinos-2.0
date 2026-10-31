// Read-only maintenance command. Run with Node 24 and the inherited proxy/CA trust.
import { readExerciseCoverage } from '../lib/exercise-coverage-read.ts';

const address = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!address || !key) {
  process.stderr.write('Conexão indisponível: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas configurações seguras do ambiente. A chave administrativa nunca deve usar prefixo NEXT_PUBLIC_.\n');
  process.exit(2);
}

try {
  const report = await readExerciseCoverage(address, key);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  const code = error instanceof Error && /^(http_\d{3}|invalid_url|invalid_response)$/.test(error.message) ? error.message : 'connection_failed';
  process.stderr.write(`Não foi possível concluir a leitura das fichas (${code}). Confira acesso e rede nas configurações. Nenhum dado foi alterado.\n`);
  process.exitCode = 1;
}
