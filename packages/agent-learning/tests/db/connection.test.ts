import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createConnection, closeConnection } from '../../src/db/connection'

describe('Database Connection', () => {
  afterEach(async () => {
    await closeConnection()
  })

  it('should create a connection with default config', () => {
    const sql = createConnection('postgres://localhost/test')
    expect(sql).toBeDefined()
  })

  it('should create connection with pooling', () => {
    const sql = createConnection('postgres://localhost/test', { max: 5 })
    expect(sql).toBeDefined()
  })

  it('should reuse existing connection', () => {
    const sql1 = createConnection('postgres://localhost/test')
    const sql2 = createConnection('postgres://localhost/test')
    expect(sql1).toBe(sql2) // Same instance
  })

  it('should close connection', async () => {
    createConnection('postgres://localhost/test')
    await expect(closeConnection()).resolves.toBeUndefined()
  })

  // New tests for critical scenarios
  it('should throw error when connection string is empty', () => {
    expect(() => createConnection('')).toThrow('Connection string cannot be empty')
  })

  it('should throw error when connection string is whitespace', () => {
    expect(() => createConnection('   ')).toThrow('Connection string cannot be empty')
  })

  it('should throw error when switching databases without closing', () => {
    createConnection('postgres://localhost/test1')
    expect(() => createConnection('postgres://localhost/test2')).toThrow(
      /Cannot create connection.*already connected/
    )
  })

  it('should allow reconnecting to same database', () => {
    const sql1 = createConnection('postgres://localhost/test')
    const sql2 = createConnection('postgres://localhost/test')
    expect(sql1).toBe(sql2) // Should not throw
  })

  it('should allow connecting to different database after close', async () => {
    createConnection('postgres://localhost/test1')
    await closeConnection()
    const sql = createConnection('postgres://localhost/test2')
    expect(sql).toBeDefined() // Should not throw
  })

  it('should not throw when closing non-existent connection', async () => {
    await expect(closeConnection()).resolves.toBeUndefined()
  })
})
