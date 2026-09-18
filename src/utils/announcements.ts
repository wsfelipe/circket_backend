const LABEL_MAP: Record<string, string> = {
  pair_1: 'Par de 1',
  pair_2: 'Par de 2',
  pair_3: 'Par de 3',
  pair_4: 'Par de 4',
  pair_5: 'Par de 5',
  pair_6: 'Par de 6',
  cricket: 'Cricket',
};

export function formatAnnouncementLabel(key: string | null | undefined): string {
  if (!key) return '—';
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  // Números 4-11: exibir o próprio número
  const num = Number(key);
  if (!Number.isNaN(num) && num >= 4 && num <= 11) {
    return String(num);
  }
  return key;
}
