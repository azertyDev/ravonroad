import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** Таймаут SELECT 1 из SRS §10.1: зависшая БД обязана дать 503 за две секунды,
 *  а не держать проверку до таймаута самого клиента. */
const DB_PROBE_TIMEOUT_MS = 2000

export async function withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  uptimeS(): number {
    return Math.floor(process.uptime())
  }

  async isDatabaseUp(): Promise<boolean> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS)
      return true
    } catch {
      return false
    }
  }
}
