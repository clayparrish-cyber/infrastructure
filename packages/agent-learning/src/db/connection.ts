import postgres from 'postgres'

let sqlInstance: ReturnType<typeof postgres> | null = null
let currentConnectionString: string | null = null

export interface ConnectionOptions {
  max?: number // Max pool size
  idle_timeout?: number // Idle connection timeout (seconds)
  connect_timeout?: number // Connection timeout (seconds)
}

/**
 * Create or retrieve a PostgreSQL connection with pooling.
 *
 * IMPORTANT: This function implements a singleton pattern. It will reuse
 * the same connection instance if called multiple times. If you need to
 * connect to a different database, call closeConnection() first.
 *
 * @throws Error if connection string is empty or if a different connection
 *         string is provided while a connection already exists
 */
export function createConnection(
  connectionString: string,
  options: ConnectionOptions = {}
): ReturnType<typeof postgres> {
  // Validate connection string
  if (!connectionString || connectionString.trim() === '') {
    throw new Error('Connection string cannot be empty')
  }

  // Check if trying to connect to a different database
  if (sqlInstance && currentConnectionString !== connectionString) {
    throw new Error(
      `Cannot create connection to "${connectionString}" while already connected to "${currentConnectionString}". ` +
      'Call closeConnection() first to switch databases.'
    )
  }

  if (!sqlInstance) {
    sqlInstance = postgres(connectionString, {
      max: options.max ?? 10,
      idle_timeout: options.idle_timeout ?? 20,
      connect_timeout: options.connect_timeout ?? 10,
    })
    currentConnectionString = connectionString
  }

  return sqlInstance
}

/**
 * Close the database connection and clean up resources.
 * Safe to call multiple times - will not throw if no connection exists.
 *
 * @throws Error if connection cleanup fails
 */
export async function closeConnection(): Promise<void> {
  if (sqlInstance) {
    try {
      await sqlInstance.end()
    } catch (error) {
      // Clean up state even if end() fails
      sqlInstance = null
      currentConnectionString = null
      throw new Error(
        `Failed to close database connection: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    sqlInstance = null
    currentConnectionString = null
  }
}
