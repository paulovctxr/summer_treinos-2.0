import ExcelJS from 'exceljs';
import { ACTIVITY_LABELS, MOVEMENT_HOURS, addDays, type MovementCount, type ScheduleEntry } from './team-schedule.ts';

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF888888' } }, bottom: { style: 'thin', color: { argb: 'FF888888' } },
  left: { style: 'thin', color: { argb: 'FF888888' } }, right: { style: 'thin', color: { argb: 'FF888888' } },
};
const DAY = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const STATUS_FILL = { attended: 'FFDDEEFF', missed: 'FFFFE2E4', scheduled: 'FFFFF5C8', cancelled: 'FFE8E8E5' } as const;
const formatDate = (value: string) => value.split('-').reverse().join('/');

function configureSheet(sheet: ExcelJS.Worksheet, title: string, start: string) {
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false, zoomScale: 90 }];
  sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: .2, right: .2, top: .3, bottom: .3, header: 0, footer: 0 } };
  sheet.columns = [{ width: 11 }, ...Array.from({ length: 7 }, () => ({ width: 27 }))];
  sheet.mergeCells('A1:H1'); sheet.getCell('A1').value = `${title} · ${formatDate(start)} A ${formatDate(addDays(start, 6))}`;
  sheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF8F321C' } }; sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:H2'); sheet.getCell('A2').value = 'Arquivo gerado pela área da equipe · Summer Fit'; sheet.getCell('A2').font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } }; sheet.getCell('A2').alignment = { horizontal: 'center' };
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  sheet.getCell('A4').value = 'HORÁRIO';
  dates.forEach((date, index) => { const cell = sheet.getCell(4, index + 2); cell.value = `${DAY[new Date(`${date}T12:00:00Z`).getUTCDay()]}\n${formatDate(date)}`; });
  sheet.getRow(4).height = 34;
  sheet.getRow(4).eachCell({ includeEmpty: true }, cell => { cell.font = { name: 'Arial', size: 9, bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE996' } }; cell.border = BORDER; });
  return dates;
}

export function teamScheduleWorkbook(entries: ScheduleEntry[], counts: MovementCount[], start: string) {
  const book = new ExcelJS.Workbook(); book.creator = 'Summer Fit'; book.title = 'Agenda e contagem da equipe';
  const agenda = book.addWorksheet('Agenda'); const dates = configureSheet(agenda, 'AGENDA DA EQUIPE', start);
  agenda.getCell('A2').value = 'AZUL: compareceu · VERMELHO: faltou · AMARELO: agendado · CINZA: cancelado';
  const extraTimes = entries.filter(item => dates.includes(item.scheduled_on)).map(item => item.scheduled_time.slice(0, 5));
  const times = [...new Set([...MOVEMENT_HOURS.map(hour => `${String(hour).padStart(2, '0')}:00`), ...extraTimes])].sort();
  times.forEach((time, rowIndex) => {
    const row = rowIndex + 5; agenda.getCell(row, 1).value = time;
    dates.forEach((date, dayIndex) => {
      const items = entries.filter(item => item.scheduled_on === date && item.scheduled_time.slice(0, 5) === time);
      const cell = agenda.getCell(row, dayIndex + 2);
      cell.value = items.map(item => `${item.student_name}${item.registration ? ` · ${item.registration}` : ''}\n${ACTIVITY_LABELS[item.activity]} · ${item.instructor}${item.notes ? `\n${item.notes}` : ''}`).join('\n────────\n');
      if (items.length === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[items[0].status] } };
    });
    agenda.getRow(row).height = Math.max(24, ...dates.map(date => entries.filter(item => item.scheduled_on === date && item.scheduled_time.slice(0, 5) === time).length * 38));
    agenda.getRow(row).eachCell({ includeEmpty: true }, (cell, column) => { cell.font = { name: 'Arial', size: column === 1 ? 9 : 8, bold: column === 1 }; cell.alignment = { horizontal: column === 1 ? 'center' : 'left', vertical: 'middle', wrapText: true }; cell.border = BORDER; });
  });
  agenda.pageSetup.printArea = `A1:H${times.length + 4}`;

  const movement = book.addWorksheet('Contagem musculação'); configureSheet(movement, 'CONTAGEM MUSCULAÇÃO', start);
  MOVEMENT_HOURS.forEach((hour, rowIndex) => {
    const row = rowIndex + 5; movement.getCell(row, 1).value = `${String(hour).padStart(2, '0')}:00`;
    dates.forEach((date, dayIndex) => { movement.getCell(row, dayIndex + 2).value = counts.find(item => item.counted_on === date && item.counted_hour === hour)?.people_count ?? null; });
    movement.getRow(row).height = 25; movement.getRow(row).eachCell({ includeEmpty: true }, (cell, column) => { cell.font = { name: 'Arial', size: 10, bold: column === 1 }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = BORDER; });
  });
  const totalRow = MOVEMENT_HOURS.length + 5; movement.getCell(totalRow, 1).value = 'TOTAL';
  dates.forEach((_, index) => { movement.getCell(totalRow, index + 2).value = { formula: `SUM(${movement.getColumn(index + 2).letter}5:${movement.getColumn(index + 2).letter}${totalRow - 1})` }; });
  movement.getRow(totalRow).eachCell({ includeEmpty: true }, cell => { cell.font = { name: 'Arial', size: 10, bold: true }; cell.alignment = { horizontal: 'center' }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE996' } }; cell.border = BORDER; });
  movement.pageSetup.printArea = `A1:H${totalRow}`;
  return book;
}

export async function createTeamScheduleExcelFile(entries: ScheduleEntry[], counts: MovementCount[], start: string) {
  const bytes = await teamScheduleWorkbook(entries, counts, start).xlsx.writeBuffer();
  return { blob: new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename: `Agenda_Summer_Fit_${formatDate(start).replaceAll('/', '-')}_a_${formatDate(addDays(start, 6)).replaceAll('/', '-')}.xlsx` };
}
