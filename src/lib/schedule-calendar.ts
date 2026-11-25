export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function appointmentDayKey(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}

export function calendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(),month.getMonth(),1,12);
  const offset = (first.getDay()+6)%7;
  const count = Math.ceil((offset+new Date(month.getFullYear(),month.getMonth()+1,0).getDate())/7)*7;
  return Array.from({length:count},(_,index)=>new Date(month.getFullYear(),month.getMonth(),1-offset+index,12));
}
