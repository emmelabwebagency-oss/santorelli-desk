type Preferences = { preferred_days: number[]; time_from: string; time_to: string; notice_hours: number; status: string };

export function matchesWaitingSlot(preferences: Preferences, startsAt: string, now = Date.now()) {
  if (preferences.status !== 'IN ATTESA') return false;
  const start = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', weekday: 'short' }).format(start);
  const day = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(weekday) + 1;
  const time = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start);
  return preferences.preferred_days.includes(day)
    && time >= preferences.time_from.slice(0, 5)
    && time <= preferences.time_to.slice(0, 5)
    && start.getTime() - now >= preferences.notice_hours * 3600000;
}
