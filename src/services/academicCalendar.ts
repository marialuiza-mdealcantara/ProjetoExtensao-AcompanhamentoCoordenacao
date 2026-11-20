export interface SchedulePeriod {
  start_time: string;
  end_time: string;
}

export interface CalendarSchedule {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface CalendarOccurrenceInput {
  schedule_id: string;
  class_date: string;
}

export function filterNewOccurrences(
  generated: CalendarOccurrenceInput[],
  existing: CalendarOccurrenceInput[]
): CalendarOccurrenceInput[] {
  const key = ({ schedule_id, class_date }: CalendarOccurrenceInput) => `${schedule_id}|${class_date}`;
  const seen = new Set(existing.map(key));
  return generated.filter((row) => {
    const rowKey = key(row);
    if (seen.has(rowKey)) return false;
    seen.add(rowKey);
    return true;
  });
}

function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error('Informe um horário válido.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error('Informe um horário válido.');
  return hours * 60 + minutes;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, '0');
  const minutes = (value % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function splitIntoHourlyPeriods(
  startTime: string,
  endTime: string
): SchedulePeriod[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const duration = end - start;
  if (duration <= 0) throw new Error('O horário final deve ser posterior ao inicial.');
  if (duration % 60 !== 0) {
    throw new Error('A duração deve corresponder a períodos completos de uma hora.');
  }

  return Array.from({ length: duration / 60 }, (_, index) => ({
    start_time: minutesToTime(start + index * 60),
    end_time: minutesToTime(start + (index + 1) * 60),
  }));
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('O período letivo possui uma data inválida.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error('O período letivo possui uma data inválida.');
  }
  return date;
}

export function buildTermOccurrences(
  schedules: CalendarSchedule[],
  startDate: string,
  endDate: string
): CalendarOccurrenceInput[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (end < start) throw new Error('O fim do semestre deve ser posterior ao início.');

  const rows: CalendarOccurrenceInput[] = [];
  for (const schedule of schedules) {
    if (!Number.isInteger(schedule.weekday) || schedule.weekday < 0 || schedule.weekday > 6) {
      throw new Error('Um horário possui dia da semana inválido.');
    }
    const duration = timeToMinutes(schedule.end_time) - timeToMinutes(schedule.start_time);
    if (duration !== 60) continue;

    const date = new Date(start);
    while (date <= end) {
      if (date.getUTCDay() === schedule.weekday) {
        rows.push({ schedule_id: schedule.id, class_date: date.toISOString().slice(0, 10) });
      }
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  return rows;
}

export function scheduleHasSupportedPeriod(schedule: CalendarSchedule): boolean {
  return timeToMinutes(schedule.end_time) - timeToMinutes(schedule.start_time) === 60;
}
