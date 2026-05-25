const HOLIDAYS: Record<string, string> = {
  '2025-01-01': 'Nový rok',
  '2025-01-06': 'Zjavenie Pána (Traja králi)',
  '2025-04-18': 'Veľký piatok',
  '2025-04-21': 'Veľkonočný pondelok',
  '2025-05-01': 'Sviatok práce',
  '2025-05-08': 'Deň víťazstva nad fašizmom',
  '2025-07-05': 'Sviatok svätého Cyrila a Metoda',
  '2025-08-29': 'Výročie SNP',
  '2025-09-01': 'Deň Ústavy SR',
  '2025-09-15': 'Sviatok Panny Márie Sedembolestnej',
  '2025-11-01': 'Sviatok všetkých svätých',
  '2025-11-17': 'Deň boja za slobodu a demokraciu',
  '2025-12-24': 'Štedrý deň',
  '2025-12-25': '1. sviatok vianočný',
  '2025-12-26': '2. sviatok vianočný',
  '2026-01-01': 'Nový rok',
  '2026-01-06': 'Zjavenie Pána (Traja králi)',
  '2026-04-03': 'Veľký piatok',
  '2026-04-06': 'Veľkonočný pondelok',
  '2026-05-01': 'Sviatok práce',
  '2026-05-08': 'Deň víťazstva nad fašizmom',
  '2026-07-05': 'Sviatok svätého Cyrila a Metoda',
  '2026-08-29': 'Výročie SNP',
  '2026-09-01': 'Deň Ústavy SR',
  '2026-09-15': 'Sviatok Panny Márie Sedembolestnej',
  '2026-11-01': 'Sviatok všetkých svätých',
  '2026-11-17': 'Deň boja za slobodu a demokraciu',
  '2026-12-24': 'Štedrý deň',
  '2026-12-25': '1. sviatok vianočný',
  '2026-12-26': '2. sviatok vianočný',
};

export function isHoliday(dateStr: string): boolean {
  return dateStr in HOLIDAYS;
}

export function getHolidayName(dateStr: string): string | null {
  return HOLIDAYS[dateStr] || null;
}

export function daysUntilNextHoliday(dateStr: string): number {
  const dates = Object.keys(HOLIDAYS).sort();
  const idx = dates.findIndex(d => d >= dateStr);
  if (idx === -1) return 365;
  const next = new Date(dates[idx] + 'T12:00:00');
  const now = new Date(dateStr + 'T12:00:00');
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
}

export function isBeforeHoliday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00');
  for (let i = 1; i <= 3; i++) {
    const check = new Date(d);
    check.setDate(d.getDate() + i);
    if (isHoliday(check.toISOString().slice(0, 10))) return true;
  }
  return false;
}

export interface DateEnrichment {
  dayOfWeek: number;
  isWeekend: boolean;
  month: number;
  quarter: number;
  isHoliday: boolean;
  holidayName: string | null;
  daysToNextHoliday: number;
  isBeforeHoliday: boolean;
}

export function enrichDate(dateStr: string): DateEnrichment {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  return {
    dayOfWeek: dow,
    isWeekend: dow === 0 || dow === 6,
    month: d.getMonth() + 1,
    quarter: Math.ceil((d.getMonth() + 1) / 3),
    isHoliday: isHoliday(dateStr),
    holidayName: getHolidayName(dateStr),
    daysToNextHoliday: daysUntilNextHoliday(dateStr),
    isBeforeHoliday: isBeforeHoliday(dateStr),
  };
}
