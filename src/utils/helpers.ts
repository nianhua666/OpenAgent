import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'

export function genId(): string {
  return uuidv4()
}

export function formatTime(ts: number, format = 'YYYY-MM-DD HH:mm:ss'): string {
  return dayjs(ts).format(format)
}

export function formatDate(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DD')
}

export function isToday(ts: number): boolean {
  return dayjs(ts).isSame(dayjs(), 'day')
}

export function isSameDay(ts1: number, ts2: number): boolean {
  return dayjs(ts1).isSame(dayjs(ts2), 'day')
}

export function startOfDay(ts: number): number {
  return dayjs(ts).startOf('day').valueOf()
}

export function endOfDay(ts: number): number {
  return dayjs(ts).endOf('day').valueOf()
}

/** 格式化金额 */
export function formatMoney(amount: number, symbol = '¥'): string {
  const abs = Math.abs(amount)
  const str = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${amount < 0 ? '-' : ''}${symbol}${str}`
}

/** 安全解析浮点数 */
export function parseFloat2(val: string): number {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** 将文本按分隔符解析为账号数组 */
export function parseAccountsText(
  text: string,
  accountSeparator: string,
  fieldSeparator: string,
  fieldKeys: string[]
): Record<string, string>[] {
  const sep = accountSeparator || '\n'
  const lines = text.split(sep).map(l => l.trim()).filter(Boolean)
  return lines.map(line => {
    const values = fieldSeparator ? line.split(fieldSeparator) : [line]
    const record: Record<string, string> = {}
    fieldKeys.forEach((key, i) => {
      record[key] = (values[i] || '').trim()
    })
    return record
  })
}

/** 将账号数组格式化为文本 */
export function formatAccountsText(
  accounts: Record<string, string>[],
  fieldKeys: string[],
  fieldSeparator: string,
  accountSeparator: string
): string {
  const sep = accountSeparator || '\n'
  return accounts.map(acc =>
    fieldKeys.map(k => acc[k] || '').join(fieldSeparator)
  ).join(sep)
}

/** 深拷贝 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
