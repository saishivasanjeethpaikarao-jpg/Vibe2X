export function greetingForHour(hour: number): string {
  if (hour < 5 || hour >= 21) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
