/**
 * Minimal CSV parser (handles "quoted,fields" and \r\n). No deps.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  const len = text.length

  const pushCell = () => {
    row.push(cur)
    cur = ''
  }
  const pushRow = () => {
    pushCell()
    const isEmpty = row.length === 1 && row[0] === ''
    if (!isEmpty) rows.push(row)
    row = []
  }

  for (let i = 0; i < len; i++) {
    const c = text[i]!
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') pushCell()
      else if (c === '\n') pushRow()
      else if (c === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') i++
        pushRow()
      } else {
        cur += c
      }
    }
  }
  pushCell()
  const trailingEmpty = row.length === 1 && row[0] === ''
  if (!trailingEmpty) rows.push(row)

  return rows
}
