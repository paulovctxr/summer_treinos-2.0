import { assessmentFilename, type Assessment } from './assessments.ts';
import { buildAssessmentWorkbook } from './assessment-excel-template.ts';

export async function assessmentWorkbook(a: Assessment, options: { logoBase64?: string } = {}) {
  return buildAssessmentWorkbook(a, options.logoBase64);
}

export async function createAssessmentExcelFile(a: Assessment) {
  let logoBase64: string | undefined;
  try {
    const response = await fetch('/summer-fit-brand.jpeg', { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* The optional logo must not prevent exporting the assessment. */ }
  const bytes = await (await assessmentWorkbook(a, { logoBase64 })).xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { blob, filename: assessmentFilename(a) };
}
