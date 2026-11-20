export function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatClassification(
  classification: 'SUBSTITUIDA' | 'VAGA' | 'DISPENSADA' | null
): string {
  switch (classification) {
    case 'SUBSTITUIDA':
      return 'Substituída';
    case 'VAGA':
      return 'Vaga';
    case 'DISPENSADA':
      return 'Dispensada';
    default:
      return 'Aguardando decisão';
  }
}
