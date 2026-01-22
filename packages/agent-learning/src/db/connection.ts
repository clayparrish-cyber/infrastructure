import postgres from 'postgres'

let sqlInstance: ReturnType<typeof postgres> | null = null

export interface ConnectionOptions {
  max?: number // Max pool size
  idle_timeout?: number // Idle connection timeout (seconds)
  connect_timeout?: number // Connection timeout (seconds)
}

/**
 * Create or retrieve a PostgreSQL connection with pooling.
 * Reuses the same connection if called multiple times.
 */
export function createConnection(
  connectionString: string,
  options: ConnectionOptions = {}
): ReturnType<typeof postgres> {
  if (!sqlInstance) {
    sqlInstance = postgres(connectionString, {
      max: options.max ?? 10,
      idle_timeout: options.idle_timeout ?? 20,
      connect_timeout: options.connect_timeout ?? 10,
    })
  }
  return sqlInstance
}

/**
 * Close the database connection and clean up resources.
 */
export async function closeConnection(): Promise<void> {
  if (sqlInstance) {
    await sqlInstance.end()
    sqlInstance = null
  }
}
