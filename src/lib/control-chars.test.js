import { describe, it, expect } from 'vitest'

// the exact expressions from DataTable.displayCell
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/
const CONTROL_CHARS_G = new RegExp(CONTROL_CHARS.source, 'g')
const show = (s) =>
  CONTROL_CHARS.test(s)
    ? s.replace(CONTROL_CHARS_G, (c) => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0'))
    : s

describe('control characters in grid cells', () => {
  it('names the C1 char that drew as a box', () => {
    expect(show('â\u0080¯')).toBe('â\\u0080¯')
  })
  it('leaves ordinary text alone', () => {
    expect(show('Screenshot 2026-08-12.png')).toBe('Screenshot 2026-08-12.png')
  })
  it('leaves tab, newline and carriage return alone', () => {
    expect(show('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
  it('keeps emoji and astral characters intact', () => {
    expect(show('x🙂y')).toBe('x🙂y')
    expect(show('narrow space')).toBe('narrow space')
  })
  it('escapes NUL and DEL', () => {
    expect(show('a\u0000b\u007Fc')).toBe('a\\u0000b\\u007fc')
  })
})
