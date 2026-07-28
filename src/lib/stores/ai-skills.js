const SKILLS_KEY = 'stroke:ai-skills'

/**
 * @typedef {{ id: string, name: string, description: string, content: string }} AiSkill
 */

/** @returns {AiSkill[]} */
export function loadSkills() {
  try {
    const raw = localStorage.getItem(SKILLS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** @param {AiSkill[]} skills */
export function saveSkills(skills) {
  try {
    localStorage.setItem(SKILLS_KEY, JSON.stringify(skills))
  } catch {
    /* quota/private-mode - fail soft rather than throw into callers */
  }
}

/**
 * @param {string} filename
 * @param {string} content
 * @returns {AiSkill}
 */
export function parseSkillFile(filename, content) {
  // Try to extract name/description from YAML-like frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  let name = filename.replace(/\.md$/, '')
  let description = ''
  let body = content

  if (fmMatch) {
    const fm = fmMatch[1]
    const nameMatch = fm.match(/^name:\s*(.+)$/m)
    const descMatch = fm.match(/^description:\s*(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
    if (descMatch) description = descMatch[1].trim()
    body = content.slice(fmMatch[0].length).trim()
  } else {
    // Try first H1 as name
    const h1 = content.match(/^#\s+(.+)$/m)
    if (h1) name = h1[1].trim()
  }

  return {
    id: crypto.randomUUID(),
    name,
    description,
    content: body,
  }
}
