export function formatPaisa(paisa: number): string {
  const rupees = Math.abs(paisa) / 100
  const sign = paisa < 0 ? '-' : ''
  return `${sign}₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatINR(rupees: number): string {
  const sign = rupees < 0 ? '-' : ''
  const abs = Math.abs(rupees)
  return `${sign}₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return 'N/A'
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatDate(isoString: string): string {
  if (!isoString) return 'N/A'
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
