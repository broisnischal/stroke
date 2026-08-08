import { describe, it, expect } from 'vitest'
import { parseMssqlUri, parseConnectionUri } from './connection-uri.js'

describe('parseMssqlUri', () => {
  it('reads the semicolon form Prisma and JDBC actually write', () => {
    // A studio pointed at SQL Server hands us exactly this shape.
    expect(
      parseMssqlUri('sqlserver://db.example.com:1433;database=app;user=sa;password=p@ss;encrypt=true'),
    ).toEqual({
      host: 'db.example.com',
      port: '1433',
      database: 'app',
      user: 'sa',
      password: 'p@ss',
      encrypt: true,
      trustCert: true,
    })
  })

  it('defaults the port and honours trustServerCertificate=false', () => {
    const parsed = parseMssqlUri('sqlserver://localhost;database=master;trustServerCertificate=false')
    expect(parsed).toMatchObject({ host: 'localhost', port: '1433', database: 'master', trustCert: false })
  })

  it('still reads the URL form', () => {
    expect(parseMssqlUri('sqlserver://sa:pw@10.0.0.5:1444/reporting')).toMatchObject({
      host: '10.0.0.5', port: '1444', database: 'reporting', user: 'sa', password: 'pw',
    })
  })

  it('rejects something that is not a connection URI', () => {
    expect(parseMssqlUri('just some text')).toEqual({ error: 'Expected a sqlserver:// connection URI' })
  })
})

describe('parseConnectionUri', () => {
  it('routes remote provider URLs to usable fields', () => {
    expect(parseConnectionUri('postgres', 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require'))
      .toMatchObject({ host: 'ep-x.eu-central-1.aws.neon.tech', database: 'neondb', user: 'u', ssl: true })
    expect(parseConnectionUri('mysql', 'mysql://user:pw@aws.connect.psdb.cloud/app'))
      .toMatchObject({ host: 'aws.connect.psdb.cloud', database: 'app', user: 'user' })
  })
})
