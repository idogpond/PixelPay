import { customAlphabet } from 'nanoid';
import dayjs from 'dayjs';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export function generateOrderNumber(): string {
  const date = dayjs().format('YYYYMMDD');
  return `PP-${date}-${nanoid()}`;
}
