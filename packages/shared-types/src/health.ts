/** Ответы health и readiness (SRS §10.1). */
export interface HealthResponse {
  status: 'ok'
  uptimeS: number
}

/** Readiness проверяет только БД: недоступные Telegram и S3 не должны выключать
 *  работающий сервис из-за чужого сбоя (SRS §10.1). */
export interface ReadyResponse {
  db: 'up' | 'down'
}
