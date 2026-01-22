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
})
