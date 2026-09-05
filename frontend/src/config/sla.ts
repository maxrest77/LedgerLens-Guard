export interface SLAConfig {
  hours: number;
  label: string;
}

// Configurable SLA thresholds across severity tiers
export const SLA_THRESHOLDS: Record<string, SLAConfig> = {
  CRITICAL: {
    hours: 24, // 24 hours
    label: '24h SLA',
  },
  HIGH: {
    hours: 72, // 3 days
    label: '3d SLA',
  },
  MEDIUM: {
    hours: 168, // 7 days
    label: '7d SLA',
  },
  LOW: {
    hours: 336, // 14 days
    label: '14d SLA',
  },
};

export type SLABreachStatus = 'OK' | 'DUE_SOON' | 'BREACHED';

export function getSLABreachStatus(severity?: string, openedAt?: string | Date | null): {
  status: SLABreachStatus;
  ageHours: number;
  slaHours: number;
  remainingHours: number;
  badgeLabel: string;
} {
  const sevKey = (severity || 'MEDIUM').toUpperCase();
  const sla = SLA_THRESHOLDS[sevKey] || SLA_THRESHOLDS.MEDIUM;

  if (!openedAt) {
    return {
      status: 'OK',
      ageHours: 0,
      slaHours: sla.hours,
      remainingHours: sla.hours,
      badgeLabel: `0h / ${sla.label}`,
    };
  }

  const opened = new Date(openedAt).getTime();
  const now = Date.now();
  const ageHours = Math.max(0, (now - opened) / (1000 * 60 * 60));
  const remainingHours = sla.hours - ageHours;

  let status: SLABreachStatus = 'OK';
  if (remainingHours <= 0) {
    status = 'BREACHED';
  } else if (remainingHours <= sla.hours * 0.25) {
    status = 'DUE_SOON';
  }

  let badgeLabel = `${Math.floor(ageHours)}h old (${sla.label})`;
  if (status === 'BREACHED') {
    badgeLabel = `BREACHED (+${Math.abs(Math.floor(remainingHours))}h)`;
  } else if (status === 'DUE_SOON') {
    badgeLabel = `DUE SOON (${Math.floor(remainingHours)}h left)`;
  }

  return {
    status,
    ageHours: Math.round(ageHours * 10) / 10,
    slaHours: sla.hours,
    remainingHours: Math.round(remainingHours * 10) / 10,
    badgeLabel,
  };
}
