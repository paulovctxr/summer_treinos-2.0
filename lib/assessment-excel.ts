import { assessmentFilename, type Assessment } from './assessments.ts';
import { buildAssessmentWorkbook } from './assessment-excel-template.ts';

export async function assessmentWorkbook(a: Assessment, options: { logoBase64?: string } = {}) {
  return buildAssessmentWorkbook(a, options.logoBase64);
}

export async function downloadAssessmentExcel(a: Assessment) {
  let logoBase64: string | undefined;
  try {
    const response = await fetch('/summer-fit-brand.jpeg');
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
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = assessmentFilename(a); document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
