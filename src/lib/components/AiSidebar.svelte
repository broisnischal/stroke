<script>
  import { tick, onMount, onDestroy } from "svelte";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import Send from "@lucide/svelte/icons/send";
  import Square from "@lucide/svelte/icons/square";
  import Play from "@lucide/svelte/icons/play";
  import Copy from "@lucide/svelte/icons/copy";
  import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Table2 from "@lucide/svelte/icons/table-2";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import X from "@lucide/svelte/icons/x";
  import History from "@lucide/svelte/icons/history";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import At from "@lucide/svelte/icons/at-sign";
  import Database from "@lucide/svelte/icons/database";
  import { cn } from "$lib/utils.js";
  import { executeSql } from "$lib/api.js";
  import DataTable from "$lib/components/DataTable.svelte";
  import AiMarkdown from "$lib/components/AiMarkdown.svelte";
  import AiSqlBlock from "$lib/components/AiSqlBlock.svelte";
  import ShikiBlock from "$lib/components/ShikiBlock.svelte";
  import AiChartRenderer from "$lib/components/AiChartRenderer.svelte";
  import AiModelPicker from "$lib/components/AiModelPicker.svelte";
  import ResizeHandle from "$lib/components/ResizeHandle.svelte";
  import {
    chatCompletionStream,
    manageHistory,
    MAX_AI_RETRIES,
    AI_TOOLS,
    isDestructiveSql,
    parseAssistantMessage,
    buildSystemPrompt,
    classifyDbError,
    filterSchemaForQuery,
  } from "$lib/ai.js";
  import {
    aiSettings,
    isAiConfigured,
  } from "$lib/stores/ai-settings.js";
  import { loadSkills } from "$lib/stores/ai-skills.js";
  import {
    clampAiSidebarWidth,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";
  import { formatCompactCount } from "$lib/table-list.js";
  import {
    listConversations,
    createConversation,
    updateConversation,
    deleteConversation,
    clearConversations,
  } from "$lib/stores/conversations.js";

  /**
   * @typedef {
   *   | { id: string, kind: 'user', text: string }
   *   | { id: string, kind: 'assistant', parts: import('$lib/ai.js').AssistantPart[] }
   *   | { id: string, kind: 'streaming' }
   *   | { id: string, kind: 'result', sql: string, columns: {name:string,dataType?:string}[], rows: unknown[][], total: number, error: string|null, isSchema?: boolean, capped?: boolean }
   *   | { id: string, kind: 'chart', spec: { type: string, title: string, data: object[], x_key: string, y_keys: {key:string,label:string}[] }, error: string|null }
   *   | { id: string, kind: 'confirm', sql: string, resolve: (ok: boolean) => void }
   *   | { id: string, kind: 'thinking' }
   *   | { id: string, kind: 'executing', sql: string }
   * } ChatItem
   */

  let {
    schemaContext = /** @type {any} */ ({
      schemas: [],
      activeSchema: "public",
      tables: [],
      activeTable: null,
      columns: [],
      primaryKey: [],
      foreignKeys: [],
    }),
    connectionId = "",
    isActive = false,
    currentView = /** @type {'table' | 'sql' | 'orm' | 'schema' | 'welcome' | string} */ ("table"),
    currentSql = "",
    currentCode = "",
    ormMode = /** @type {'drizzle' | 'prisma'} */ ("drizzle"),
    onclose = () => {},
    /** @param {{ kind: 'sql' | 'code', lang?: string, content: string }} detail */
    onaccept = (detail) => {},
    onopensettings = () => {},
  } = $props();

  const uid = () => crypto.randomUUID();
  const configured = $derived(isAiConfigured($aiSettings));

  // ── Chat state ───────────────────────────────────────────────────────────
  /** @type {ChatItem[]} */
  let items = $state([]);
  /** @type {import('$lib/ai.js').ApiMessage[]} */
  let apiHistory = $state([]);
  let rawApiHistory = $state([]);
  let loading = $state(false);
  let error = $state("");
  let aiStatusHint = $state("");
  let inputText = $state("");
  let turnSystemPrompt = "";
  let executedCalls = new Set();
  /** @type {Map<string, { count: number, lastError: string }>} */
  let failureTracker = new Map();
  /** @type {Record<string, {name:string, dataType:string, nullable:boolean}[]>} */
  let fetchedSchemas = $state({});
  /** @type {Set<string>} */
  let collapsed = $state(new Set());
  /** @type {string | null} */
  let openResultId = $state(null);

  /** @type {HTMLTextAreaElement | null} */
  let inputRef = $state(null);
  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null);
  let userScrolledUp = $state(false);

  // ── Thinking cycling (matches AiChat) ────────────────────────────────────
  const THINKING_PHRASES = [
    'Thinking…', 'Analyzing schema…', 'Writing the query…',
    'Reading the data…', 'Checking relationships…', 'Running the numbers…',
    'Exploring tables…', 'Crafting response…', 'Almost there…',
  ]
  let thinkingPhrase = $state(THINKING_PHRASES[0])
  let thinkingVisible = $state(true)

  $effect(() => {
    if (!loading) { thinkingPhrase = THINKING_PHRASES[0]; thinkingVisible = true; return }
    let i = 0
    const tick2 = () => {
      thinkingVisible = false
      setTimeout(() => { i = (i + 1) % THINKING_PHRASES.length; thinkingPhrase = THINKING_PHRASES[i]; thinkingVisible = true }, 220)
    }
    const id = setInterval(tick2, 2600)
    return () => clearInterval(id)
  })

  // ── @ mention system ──────────────────────────────────────────────────────
  let mentionOpen = $state(false)
  let mentionQuery = $state('')
  let mentionStart = $state(0)
  let mentionIdx = $state(0)

  /** @type {HTMLDivElement | null} */
  let mentionEl = $state(null)

  const allTables = $derived(schemaContext.tables ?? [])

  const mentionItems = $derived.by(() => {
    const q = mentionQuery.toLowerCase()
    const tables = q
      ? allTables.filter(t => t.name.toLowerCase().includes(q))
      : allTables
    return tables.slice(0, 8).map(t => ({
      label: t.name,
      sub: schemaContext.activeSchema,
      insert: `${schemaContext.activeSchema}.${t.name}`,
    }))
  })

  $effect(() => { mentionIdx = 0 })

  function handleInputKeydown(/** @type {KeyboardEvent} */ e) {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mentionIdx = (mentionIdx + 1) % Math.max(1, mentionItems.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); mentionIdx = (mentionIdx - 1 + Math.max(1, mentionItems.length)) % Math.max(1, mentionItems.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = mentionItems[mentionIdx]
        if (item) insertMention(item.insert)
        else mentionOpen = false
        return
      }
      if (e.key === 'Escape') { mentionOpen = false; return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); return }
  }

  function handleInputChange(/** @type {Event} */ e) {
    const el = /** @type {HTMLTextAreaElement} */ (e.target)
    inputText = el.value
    resizeInput()
    // Detect @ trigger
    const cursor = el.selectionStart ?? 0
    const before = inputText.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx >= 0) {
      const after = before.slice(atIdx + 1)
      if (!/\s/.test(after)) {
        mentionQuery = after
        mentionStart = atIdx
        mentionOpen = true
        return
      }
    }
    mentionOpen = false
  }

  function insertMention(/** @type {string} */ text) {
    const before = inputText.slice(0, mentionStart)
    const afterAt = inputText.slice(mentionStart + 1 + mentionQuery.length)
    inputText = before + '@' + text + ' ' + afterAt
    mentionOpen = false
    void tick().then(() => { resizeInput(); inputRef?.focus() })
  }

  // ── Scroll helpers ────────────────────────────────────────────────────────
  function onScrollAreaScroll() {
    if (!scrollEl) return
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    userScrolledUp = distFromBottom > 80
  }
  function jumpToBottom() {
    userScrolledUp = false
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  // ── Conversations ─────────────────────────────────────────────────────────
  /** @type {import('$lib/stores/conversations.js').Conversation[]} */
  let convList = $state([])
  /** @type {string | null} */
  let activeConvId = $state(null)
  let historyOpen = $state(false)

  async function loadConvList() {
    convList = await listConversations(connectionId || undefined, "sidebar")
  }

  async function restoreLatest() {
    await loadConvList()
    if (items.length || !convList.length) return
    const latest = convList[0]
    activeConvId = latest.id
    items = /** @type {ChatItem[]} */ ((latest.items ?? []).filter(
      (i) => ['user','assistant','result','chart'].includes(/** @type {any} */ (i).kind)
    ))
    apiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (latest.apiHistory ?? [])
    rawApiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (latest.apiHistory ?? [])
    await tick()
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  async function persistCurrent() {
    const saveable = items.filter(i => ['user','assistant','result','chart'].includes(i.kind))
    if (saveable.length === 0) return
    const firstUser = saveable.find(i => i.kind === 'user')
    const title = firstUser?.kind === 'user' ? firstUser.text.slice(0, 60) + (firstUser.text.length > 60 ? '…' : '') : 'Conversation'
    const plainItems = $state.snapshot(saveable)
    const plainHistory = $state.snapshot(rawApiHistory)
    if (activeConvId) {
      await updateConversation(activeConvId, { title, items: plainItems, apiHistory: plainHistory })
      convList = convList.map(c => c.id === activeConvId ? { ...c, title } : c)
    } else {
      const conv = await createConversation({ title, source: 'sidebar', schema: schemaContext.activeSchema, connectionId, items: plainItems, apiHistory: plainHistory })
      activeConvId = conv.id
      convList = [conv, ...convList]
    }
  }

  async function selectConversation(/** @type {string} */ id) {
    if (id === activeConvId) { historyOpen = false; return }
    abortCurrentRequest(); await persistCurrent()
    const conv = convList.find(c => c.id === id)
    if (!conv) return
    activeConvId = id
    items = /** @type {ChatItem[]} */ ((conv.items ?? []).filter(i => ['user','assistant','result','chart'].includes(/** @type {any} */ (i).kind)))
    apiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (conv.apiHistory ?? [])
    rawApiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (conv.apiHistory ?? [])
    error = ''; historyOpen = false
    await tick()
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  async function removeConversation(/** @type {string} */ id) {
    await deleteConversation(id)
    convList = convList.filter(c => c.id !== id)
    if (activeConvId === id) { activeConvId = null; items = []; apiHistory = []; rawApiHistory = []; error = '' }
  }

  async function clearAllConversations() {
    await clearConversations(connectionId || undefined, 'sidebar')
    convList = []; activeConvId = null; items = []; apiHistory = []; rawApiHistory = []; error = ''; historyOpen = false
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  const initialLayout = loadLayout()
  let width = $state(initialLayout.aiSidebarWidth)
  let resizeStartWidth = initialLayout.aiSidebarWidth

  // ── Streaming ─────────────────────────────────────────────────────────────
  let streamingContent = $state('')
  let _pendingStreamContent = ''
  let _streamTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  let _lastStreamCommit = 0
  const STREAM_COMMIT_MS = 90
  let streamingId = $state(/** @type {string | null} */ (null))
  let abortController = /** @type {AbortController | null} */ (null)

  function scheduleStreamingUpdate(content) {
    _pendingStreamContent = content
    if (_streamTimer !== null) return
    const elapsed = performance.now() - _lastStreamCommit
    const delay = elapsed >= STREAM_COMMIT_MS ? 0 : STREAM_COMMIT_MS - elapsed
    _streamTimer = setTimeout(() => { _streamTimer = null; _lastStreamCommit = performance.now(); streamingContent = _pendingStreamContent }, delay)
  }
  function flushStreamingContent() {
    if (_streamTimer !== null) { clearTimeout(_streamTimer); _streamTimer = null; _lastStreamCommit = performance.now(); streamingContent = _pendingStreamContent }
  }
  const displayStreamingContent = $derived(
    streamingContent.includes('<think>')
      ? streamingContent.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim()
      : streamingContent.trim()
  )

  $effect(() => { if (isActive) void Promise.resolve().then(() => inputRef?.focus()) })

  onMount(() => { void restoreLatest() })
  let rafId = /** @type {number | null} */ (null)
  onDestroy(() => {
    void persistCurrent()
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  })

  function scrollBottomSoon() {
    if (userScrolledUp || rafId !== null) return
    rafId = requestAnimationFrame(() => { rafId = null; if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight })
  }
  async function scrollBottom() {
    await tick(); userScrolledUp = false
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  function toggleCollapse(key) { const n = new Set(collapsed); n.has(key) ? n.delete(key) : n.add(key); collapsed = n }
  function toggleResult(id) { openResultId = openResultId === id ? null : id }
  function autoOpenResult(/** @type {string} */ id, isSchema = false) { if (!isSchema) openResultId = id }

  async function newChat() {
    abortCurrentRequest(); await persistCurrent()
    activeConvId = null; items = []; apiHistory = []; rawApiHistory = []; error = ''; aiStatusHint = ''; inputText = ''; historyOpen = false
    await tick(); inputRef?.focus()
  }
  function abortCurrentRequest() { abortController?.abort(); abortController = null; loading = false }
  function stop() { flushStreamingContent(); abortController?.abort() }
  async function copyText(text) { await navigator.clipboard.writeText(text).catch(() => {}) }

  /** @param {number} ts */
  function relTime(ts) {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  function buildViewContext() {
    const lines = ['', '=== CURRENT WORKSPACE CONTEXT ===']
    if (schemaContext.activeTable) lines.push(`The user is viewing table "${schemaContext.activeSchema}.${schemaContext.activeTable}".`)
    if (currentView === 'sql') {
      lines.push('The user has the SQL editor open. Return runnable SQL in ```sql blocks.')
      const t = (currentSql ?? '').trim()
      if (t) { lines.push('Current SQL:'); lines.push('```sql'); lines.push(t.slice(0, 4000)); lines.push('```') }
    } else if (currentView === 'orm') {
      lines.push(`The user has the ORM runner open in ${ormMode} mode.`)
    } else {
      lines.push('Return SQL in ```sql blocks when relevant.')
    }
    lines.push('Keep answers concise; this is a compact side panel.')
    return lines.join('\n')
  }

  async function ensureFullSchemaCache() {
    if (!schemaContext.tables?.length) return
    const isMysql = schemaContext.dbType === 'mysql'
    const sc = schemaContext.activeSchema
    const combined = { ...schemaContext.allTableColumns, ...fetchedSchemas }
    const missing = schemaContext.tables.filter(t => !combined[`${sc}.${t.name}`])
    if (!missing.length) return
    try {
      const scSafe = sc.replace(/'/g, "''")
      const sql = isMysql
        ? `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${scSafe}' ORDER BY TABLE_NAME, ORDINAL_POSITION`
        : `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = '${scSafe}' ORDER BY table_name, ordinal_position`
      const data = await executeSql(sql)
      /** @type {Record<string, {name:string, dataType:string, nullable:boolean}[]>} */
      const byTable = {}
      for (const row of data.rows ?? []) {
        const key = `${sc}.${String(row[0])}`
        if (!byTable[key]) byTable[key] = []
        byTable[key].push({ name: String(row[1]), dataType: String(row[2]), nullable: String(row[3]).toUpperCase() === 'YES' })
      }
      fetchedSchemas = { ...fetchedSchemas, ...byTable }
    } catch {}
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send(/** @type {string[]} */ [overrideText] = []) {
    const text = (overrideText ?? inputText).trim()
    if (!text || loading) return
    if (!configured) { onopensettings(); return }
    error = ''; aiStatusHint = ''
    if (!overrideText) { inputText = ''; resetInputHeight() }

    items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'user', text }))
    apiHistory.push({ role: 'user', content: text })
    rawApiHistory.push({ role: 'user', content: text })
    await scrollBottom()

    const thinkingId = uid()
    items.push(/** @type {ChatItem} */ ({ id: thinkingId, kind: 'thinking' }))
    await scrollBottom()

    loading = true; abortController = new AbortController(); executedCalls = new Set(); failureTracker = new Map()

    const looksLikeDataQuery = text.length > 4 || /select|from|show|list|count|table|schema|column|insert|update|delete/i.test(text)
    if (looksLikeDataQuery) await ensureFullSchemaCache()

    const skills = loadSkills()
    const filteredCtx = filterSchemaForQuery({ ...schemaContext, allTableColumns: { ...schemaContext.allTableColumns, ...fetchedSchemas }, userSkills: skills }, text)
    turnSystemPrompt = buildSystemPrompt(filteredCtx) + '\n' + buildViewContext()

    const { history: managedHistory } = await manageHistory($aiSettings, apiHistory, { maxChars: 200_000, keepLastN: 14, summarizeThreshold: 60_000, onStatus: (msg) => { aiStatusHint = msg } })
    const managedLen = managedHistory.length
    apiHistory = managedHistory

    try {
      await runAiTurn(0)
    } catch (e) {
      if (/** @type {any} */ (e)?.name !== 'AbortError') error = String(e)
    } finally {
      flushStreamingContent()
      if (streamingId) {
        const partial = streamingContent.trim(); const sid = streamingId
        items = items.filter(i => i.kind !== 'thinking' && i.kind !== 'executing').map(i => i.id === sid ? /** @type {ChatItem} */ ({ id: sid, kind: 'assistant', parts: parseAssistantMessage(partial || '…') }) : i)
        streamingId = null; streamingContent = ''; _pendingStreamContent = ''
      } else {
        items = items.filter(i => i.kind !== 'thinking' && i.kind !== 'executing')
      }
      abortController = null; loading = false; openResultId = null; aiStatusHint = ''
      rawApiHistory.push(...apiHistory.slice(managedLen))
      void persistCurrent()
      await tick(); inputRef?.focus()
    }
  }

  /**
   * Programmatically send a message — called by the parent (e.g. "Fix with AI").
   * @param {string} text
   */
  export function sendMessage(text) {
    if (!text.trim()) return
    void send([text])
  }

  const AI_ROW_LIMIT = 500; const AI_DISPLAY_ROWS = 100

  function guardSelectLimit(sql) {
    const cleaned = sql.trimEnd().replace(/;+$/, '')
    const t = cleaned.trimStart()
    if (!/^(with\b|select\b)/i.test(t)) return { sql: cleaned, capped: false }
    if (/\blimit\s+\d/i.test(t)) return { sql: cleaned, capped: false }
    return { sql: `${cleaned}\nLIMIT ${AI_ROW_LIMIT}`, capped: true }
  }

  async function runAiTurn(depth) {
    if (depth > 40) throw new Error('Too many AI iterations')
    if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    if (depth > 0) {
      await new Promise(r => setTimeout(r, 300))
      if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }
    let fullContent = ''; /** @type {import('$lib/ai.js').ToolCall[]} */ let toolCalls = []; let itemId = /** @type {string | null} */ (null)
    for await (const chunk of chatCompletionStream($aiSettings, [{ role: 'system', content: turnSystemPrompt }, ...apiHistory], AI_TOOLS, abortController?.signal, ({ attempt, waitMs }) => { aiStatusHint = `Rate limited — retrying in ${Math.ceil(waitMs/1000)}s…` })) {
      if (chunk.textDelta) {
        aiStatusHint = ''; fullContent += chunk.textDelta
        if (!itemId) {
          itemId = uid(); streamingId = itemId
          const idx = items.findIndex(i => i.kind === 'thinking'); if (idx >= 0) items.splice(idx, 1)
          items.push(/** @type {ChatItem} */ ({ id: itemId, kind: 'streaming' }))
        }
        scheduleStreamingUpdate(fullContent); scrollBottomSoon()
      }
      if (chunk.toolCalls) toolCalls = chunk.toolCalls
    }
    if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    flushStreamingContent()
    if (itemId && streamingId) {
      streamingId = null; streamingContent = ''; _pendingStreamContent = ''
      items = items.map(i => i.id === itemId ? /** @type {ChatItem} */ ({ id: itemId, kind: 'assistant', parts: parseAssistantMessage(fullContent) }) : i)
    }
    if (toolCalls.length > 0) {
      const idx = items.findIndex(i => i.kind === 'thinking'); if (idx >= 0) items.splice(idx, 1)
      apiHistory.push({ role: 'assistant', content: fullContent || null, tool_calls: toolCalls })
      for (const call of toolCalls) await runToolCall(call)
      items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'thinking' })); scrollBottomSoon()
      await runAiTurn(depth + 1)
    } else if (fullContent) {
      apiHistory.push({ role: 'assistant', content: fullContent })
      if (!itemId) { items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'assistant', parts: parseAssistantMessage(fullContent) })); await scrollBottom() }
    }
  }

  async function runToolCall(call) {
    const callKey = `${call.function.name}:${call.function.arguments}`
    if (executedCalls.has(callKey)) { apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Duplicate call.' }) }); return }
    const prior = failureTracker.get(callKey); if (prior && prior.count >= 2) { apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: `Failed ${prior.count} times. Do not retry.`, last_error: prior.lastError }) }); return }
    executedCalls.add(callKey)
    let toolResult = ''
    try {
      const args = JSON.parse(call.function.arguments || '{}')
      if (call.function.name === 'execute_sql') {
        const sql = String(args.sql ?? '').trim()
        if (!sql) { apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Empty SQL' }) }); return }
        if (isDestructiveSql(sql)) { const ok = await waitForConfirm(sql); if (!ok) { apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ cancelled: true }) }); return } }
        const { sql: g, capped } = guardSelectLimit(sql)
        const execId = uid(); items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql })); await scrollBottom()
        try {
          const data = await executeSql(g); const cols = data.columns ?? []; const rows = data.rows ?? []; const total = data.rowCount ?? rows.length
          const resultId = uid(); const resultItem = /** @type {ChatItem} */ ({ id: resultId, kind: 'result', sql, columns: cols, rows: rows.slice(0, AI_DISPLAY_ROWS), total, error: null, capped })
          const idx = items.findIndex(i => i.id === execId); if (idx >= 0) items.splice(idx, 1, resultItem); else items.push(resultItem)
          autoOpenResult(resultId); await scrollBottom()
          toolResult = JSON.stringify({ columns: cols.map(c => c.name), rows: rows.slice(0, 30), total_rows: total })
        } catch (sqlErr) {
          const idx = items.findIndex(i => i.id === execId); if (idx >= 0) items.splice(idx, 1)
          const msg = String(sqlErr); const hint = classifyDbError(msg); const ex = failureTracker.get(callKey) ?? { count: 0, lastError: '' }; failureTracker.set(callKey, { count: ex.count + 1, lastError: msg })
          toolResult = JSON.stringify({ error: msg, ...(hint ? { hint } : {}), attempt: ex.count + 1 })
        }
      } else if (call.function.name === 'describe_table') {
        const schema = String(args.schema ?? schemaContext.activeSchema).replace(/'/g, "''"); const table = String(args.table ?? '').replace(/'/g, "''")
        const descSql = schemaContext.dbType === 'mysql' ? `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION` : `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY ordinal_position`
        const data = await executeSql(descSql); const cols = data.columns ?? []; const rows = data.rows ?? []
        const sid = uid(); items.push(/** @type {ChatItem} */ ({ id: sid, kind: 'result', sql: `${schema}.${table} schema`, columns: cols, rows, total: rows.length, error: null, isSchema: true }))
        autoOpenResult(sid, true); await scrollBottom()
        toolResult = JSON.stringify({ table: `${schema}.${table}`, columns: rows.map(r => ({ name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] ?? null })) })
      } else if (call.function.name === 'render_chart') {
        const chartId = uid()
        if (!args.data?.length) { items.push(/** @type {ChatItem} */ ({ id: chartId, kind: 'chart', spec: args, error: 'No data provided.' })); toolResult = JSON.stringify({ error: 'No data.' }) }
        else { items.push(/** @type {ChatItem} */ ({ id: chartId, kind: 'chart', spec: args, error: null })); await scrollBottom(); toolResult = JSON.stringify({ success: true }) }
      } else if (call.function.name === 'list_tables') {
        toolResult = JSON.stringify({ schema: schemaContext.activeSchema, tables: schemaContext.tables.map(t => ({ name: t.name, rowCount: t.rowCount })), total: schemaContext.tables.length })
      } else if (call.function.name === 'get_schema') {
        const targetTable = String(args.table ?? '').trim()
        try {
          const isMysql = schemaContext.dbType === 'mysql'; const sc = schemaContext.activeSchema.replace(/'/g, "''")
          if (targetTable) {
            const tt = targetTable.replace(/'/g, "''"); const sql = isMysql ? `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${sc}' AND TABLE_NAME = '${tt}' ORDER BY ORDINAL_POSITION` : `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${sc}' AND table_name = '${tt}' ORDER BY ordinal_position`
            const data = await executeSql(sql); toolResult = JSON.stringify({ table: `${schemaContext.activeSchema}.${targetTable}`, columns: (data.rows ?? []).map(r => ({ name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] ?? null })) })
          } else {
            const sql = isMysql ? `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${sc}' ORDER BY TABLE_NAME, ORDINAL_POSITION` : `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = '${sc}' ORDER BY table_name, ordinal_position`
            const data = await executeSql(sql); const byTable = /** @type {Record<string, unknown[]>} */ ({})
            for (const row of data.rows ?? []) { const n = String(row[0]); if (!byTable[n]) byTable[n] = []; byTable[n].push({ name: row[1], type: row[2], nullable: row[3] === 'YES' }) }
            toolResult = JSON.stringify({ schema: schemaContext.activeSchema, tables: byTable })
          }
        } catch (e) { toolResult = JSON.stringify({ error: String(e) }) }
      } else { toolResult = JSON.stringify({ error: `Unknown tool: ${call.function.name}` }) }
    } catch (e) {
      items = items.filter(i => i.kind !== 'executing')
      const msg = String(e); const hint = classifyDbError(msg); const ex = failureTracker.get(callKey) ?? { count: 0, lastError: '' }; failureTracker.set(callKey, { count: ex.count + 1, lastError: msg })
      toolResult = JSON.stringify({ error: msg, ...(hint ? { hint } : {}), attempt: ex.count + 1 })
    }
    apiHistory.push({ role: 'tool', tool_call_id: call.id, content: toolResult })
  }

  async function runSqlBlock(/** @type {string} */ sql) {
    if (loading) return; error = ''
    if (isDestructiveSql(sql)) { const ok = await waitForConfirm(sql); if (!ok) return }
    loading = true; const execId = uid(); items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql })); await scrollBottom()
    try {
      const data = await executeSql(sql); const cols = data.columns ?? []; const rows = data.rows ?? []
      const resId = uid(); const ri = /** @type {ChatItem} */ ({ id: resId, kind: 'result', sql, columns: cols, rows, total: data.rowCount ?? rows.length, error: null })
      const idx = items.findIndex(i => i.id === execId); if (idx >= 0) items.splice(idx, 1, ri); else items.push(ri)
      autoOpenResult(resId); await scrollBottom()
    } catch (e) {
      const errId = uid(); const ei = /** @type {ChatItem} */ ({ id: errId, kind: 'result', sql, columns: [], rows: [], total: 0, error: String(e) })
      const idx = items.findIndex(i => i.id === execId); if (idx >= 0) items.splice(idx, 1, ei); else items.push(ei)
      autoOpenResult(errId); await scrollBottom()
    } finally { loading = false }
  }

  function waitForConfirm(/** @type {string} */ sql) {
    return new Promise((resolve) => {
      const itemId = uid()
      items.push(/** @type {ChatItem} */ ({ id: itemId, kind: 'confirm', sql, resolve: (ok) => { const idx = items.findIndex(i => i.id === itemId); if (idx >= 0) items.splice(idx, 1); resolve(ok) } }))
      void scrollBottom()
    })
  }

  function acceptSql(sql) { onaccept({ kind: 'sql', content: sql }) }
  function acceptCode(lang, code) { onaccept({ kind: 'code', lang, content: code }) }

  function resizeInput() {
    if (!inputRef) return
    inputRef.style.height = 'auto'
    inputRef.style.height = `${Math.min(inputRef.scrollHeight, 160)}px`
  }
  function resetInputHeight() { if (inputRef) inputRef.style.height = 'auto' }

  const suggestions = $derived.by(() => {
    /** @type {string[]} */
    const out = []
    if (currentView === 'sql' && (currentSql ?? '').trim()) out.push('Explain this query', 'Optimize this query')
    else if (currentView === 'orm') out.push(`Write a ${ormMode} query for the active table`)
    if (schemaContext.activeTable) { out.push(`Show 10 recent rows from ${schemaContext.activeTable}`, `Describe ${schemaContext.activeTable}`) }
    else { out.push('List the tables', 'Draw an ERD of this schema') }
    return out.slice(0, 4)
  })

  const showWorking = $derived(loading && !items.some(i => i.kind === 'thinking' || i.kind === 'streaming' || i.kind === 'executing'))
</script>

<div
  class="relative flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border/50 bg-background"
  style="width: {width}px; min-width: {width}px; max-width: {width}px"
  data-studio-region="ai-sidebar"
>
  <div class="absolute inset-y-0 left-0 z-20">
    <ResizeHandle edge="start" onresizestart={() => { resizeStartWidth = width }} onresize={(dx) => { width = clampAiSidebarWidth(resizeStartWidth + dx) }} onresizeend={() => saveLayout({ aiSidebarWidth: width })} />
  </div>

  <!-- Header -->
  <div class="studio-chrome flex h-10 shrink-0 items-center gap-1.5 border-b border-border/50 px-3" data-studio-chrome>
    <Sparkles class="size-3.5 shrink-0 text-primary/70" />
    <span class="min-w-0 flex-1 text-ui-xs font-semibold text-foreground/70">Assistant</span>

    <!-- Model picker -->
    <AiModelPicker onopenSettings={onopensettings} />

    <div class="flex items-center">
      <button type="button"
        class={cn('inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground', historyOpen && 'bg-accent text-foreground')}
        title="Conversation history"
        onclick={() => { historyOpen = !historyOpen; if (historyOpen) void loadConvList() }}
      ><History class="size-3.5" /></button>
      <button type="button"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
        title="New chat"
        disabled={items.length === 0 && !loading}
        onclick={() => void newChat()}
      ><Plus class="size-3.5" /></button>
      <button type="button"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
        title="Close (⌘I)"
        onclick={onclose}
      ><X class="size-3.5" /></button>
    </div>
  </div>

  <!-- History dropdown -->
  {#if historyOpen}
    <button type="button" class="absolute inset-0 z-30 cursor-default" aria-label="Close history" onclick={() => (historyOpen = false)}></button>
    <div class="absolute right-2 top-11 z-40 flex max-h-[55%] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
      <div class="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <span class="text-ui-xs font-medium text-foreground/70">History</span>
        {#if convList.length}
          <button type="button" class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive" onclick={() => void clearAllConversations()}>
            <Trash2 class="size-3" />Clear all
          </button>
        {/if}
      </div>
      <div class="app-scroll min-h-0 flex-1 overflow-y-auto p-1">
        {#if convList.length === 0}
          <p class="px-3 py-5 text-center text-ui-xs text-muted-foreground/50">No saved chats yet</p>
        {:else}
          {#each convList as conv (conv.id)}
            <div class={cn('group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40', conv.id === activeConvId && 'bg-accent/60')}>
              <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left" onclick={() => void selectConversation(conv.id)}>
                <span class="w-full truncate text-ui-xs text-foreground/80">{conv.title}</span>
                <span class="text-ui-2xs text-muted-foreground/50">{relTime(conv.updatedAt)}</span>
              </button>
              <button type="button" class="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/30 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" onclick={() => void removeConversation(conv.id)}>
                <Trash2 class="size-3" />
              </button>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div bind:this={scrollEl} onscroll={onScrollAreaScroll}
    class="app-scroll relative min-h-0 flex-1 overflow-y-auto [will-change:transform] [overflow-anchor:none]">

    {#if items.length === 0}
      <!-- Empty state -->
      <div class="flex h-full flex-col items-center justify-center gap-5 px-4 py-6 text-center">
        <div class="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/8">
          <Sparkles class="size-4 text-primary" />
        </div>
        <div class="space-y-1.5">
          <p class="text-ui-sm font-medium text-foreground/80">Ask anything</p>
          {#if schemaContext.activeTable}
            <p class="font-mono text-ui-xs text-muted-foreground/55">{schemaContext.activeSchema}.{schemaContext.activeTable}</p>
          {:else if schemaContext.tables?.length}
            <p class="font-mono text-ui-xs text-muted-foreground/55">{schemaContext.activeSchema} · {schemaContext.tables.length} tables</p>
          {:else}
            <p class="text-ui-xs text-muted-foreground/50">Knows your schema, table, and editor</p>
          {/if}
        </div>

        {#if !configured}
          <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-ui-xs text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/12" onclick={onopensettings}>
            <AlertTriangle class="size-3.5" />Configure a model to start
          </button>
        {:else}
          <div class="w-full overflow-hidden rounded-xl border border-border/35">
            <div class="grid grid-cols-1 gap-px bg-border/25">
              {#each suggestions as s}
                <button type="button"
                  class="flex items-center gap-2.5 bg-background px-3.5 py-2.5 text-left transition-colors hover:bg-muted/25 disabled:opacity-40"
                  onclick={() => void send([s])}
                >
                  <Sparkles class="size-3 shrink-0 text-muted-foreground/30" />
                  <span class="text-ui-xs text-muted-foreground/65">{s}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

    {:else}
      <!-- Messages list -->
      <div class="flex flex-col gap-3 px-3 py-3" data-studio-selectable="text">

        {#each items as item (item.id)}

          {#if item.kind === 'user'}
            <div class="flex justify-end">
              <div class="max-w-[88%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-ui-xs leading-relaxed text-primary-foreground whitespace-pre-wrap">{item.text}</div>
            </div>

          {:else if item.kind === 'thinking'}
            <div class="flex items-center gap-2.5">
              <Sparkles class="size-3 shrink-0 animate-pulse text-primary/70" />
              <span class="text-ui-xs text-muted-foreground/60 transition-opacity duration-200 {thinkingVisible ? 'opacity-100' : 'opacity-0'}">{aiStatusHint || thinkingPhrase}</span>
              <span class="flex gap-0.5">
                <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:0ms"></span>
                <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:120ms"></span>
                <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:240ms"></span>
              </span>
            </div>

          {:else if item.kind === 'streaming'}
            <AiMarkdown content={displayStreamingContent} debounceMs={180} streaming class="text-ui-xs" />

          {:else if item.kind === 'assistant'}
            <div class="flex flex-col gap-2">
              {#each item.parts as part, pi}
                {#if part.type === 'text'}
                  <AiMarkdown content={part.content} class="text-ui-xs" />

                {:else if part.type === 'sql'}
                  {@const sqlKey = `${item.id}-${pi}`}
                  {@const sqlOpen = !collapsed.has(sqlKey)}
                  <div class="overflow-hidden rounded-lg border border-border/50 bg-card/30">
                    <div class="group/sqlbar flex items-center gap-2 border-b border-border/30 bg-muted/8 px-2.5 py-1.5">
                      <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left" onclick={() => toggleCollapse(sqlKey)}>
                        <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground/40">
                          {#if sqlOpen}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}
                        </span>
                        <span class="shrink-0 rounded border border-border/40 bg-muted/50 px-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/55">SQL</span>
                        <span class="min-w-0 truncate font-mono text-ui-2xs text-muted-foreground/45">{part.content.trim().replace(/\s+/g, ' ').slice(0, 60)}</span>
                      </button>
                      <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/sqlbar:opacity-100">
                        <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground" title="Copy" onclick={() => copyText(part.content)}><Copy class="size-3" /></button>
                        <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground" title="Accept" onclick={() => acceptSql(part.content)}><CornerDownLeft class="size-3" /></button>
                        <button type="button" class="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40" disabled={loading} onclick={() => void runSqlBlock(part.content)}><Play class="size-2.5" />Run</button>
                      </div>
                    </div>
                    <AiSqlBlock sql={part.content} open={sqlOpen} />
                  </div>

                {:else if part.type === 'mermaid'}
                  <div class="overflow-hidden rounded-lg border border-border/50">
                    <div class="flex items-center justify-between gap-1 border-b border-border/30 bg-muted/10 px-2.5 py-1.5">
                      <span class="font-mono text-ui-2xs text-muted-foreground/55">diagram</span>
                      <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground" onclick={() => copyText(part.content)}><Copy class="size-3" /></button>
                    </div>
                    <ShikiBlock code={part.content} lang="plaintext" embedded />
                  </div>

                {:else if part.type === 'error'}
                  <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-ui-xs text-destructive">
                    <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span>{part.content}</span>
                  </div>

                {:else if part.type === 'confirm_prompt'}
                  <div class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/6 px-3 py-2 text-ui-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span>{part.content}</span>
                  </div>

                {:else}
                  {@const codeKey = `${item.id}-${pi}`}
                  {@const codeOpen = !collapsed.has(codeKey)}
                  <div class="overflow-hidden rounded-lg border border-border/50">
                    <div class="flex items-center justify-between gap-1 border-b border-border/30 bg-muted/10 px-2.5 py-1.5">
                      <button type="button" class="flex items-center gap-1 text-ui-2xs text-muted-foreground/55 hover:text-foreground" onclick={() => toggleCollapse(codeKey)}>
                        {#if codeOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
                        <span class="font-mono">{part.lang || 'code'}</span>
                      </button>
                      <div class="flex gap-0.5">
                        <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground" onclick={() => copyText(part.content)}><Copy class="size-3" /></button>
                        <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground" title="Accept" onclick={() => acceptCode(part.lang, part.content)}><CornerDownLeft class="size-3" /></button>
                      </div>
                    </div>
                    {#if codeOpen}<ShikiBlock code={part.content} lang={part.lang || 'plaintext'} embedded />{/if}
                  </div>
                {/if}
              {/each}
            </div>

          {:else if item.kind === 'executing'}
            <div class="flex items-center gap-2.5">
              <Loader2 class="size-3 shrink-0 animate-spin text-muted-foreground/50" />
              <span class="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-medium text-amber-500/70">SQL</span>
              <span class="min-w-0 truncate text-ui-xs text-muted-foreground/45">{item.sql}</span>
            </div>

          {:else if item.kind === 'result'}
            {@const resOpen = openResultId === item.id}
            <div class={cn('overflow-hidden rounded-lg border text-ui-2xs', item.error ? 'border-destructive/35 bg-destructive/4' : item.isSchema ? 'border-primary/20 bg-primary/3' : 'border-border/40 bg-muted/8')}>
              <button type="button"
                class={cn('flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/20', resOpen && 'border-b border-border/30')}
                onclick={() => toggleResult(item.id)}>
                {#if resOpen}<ChevronDown class="size-3 shrink-0 text-muted-foreground/40" />{:else}<ChevronRight class="size-3 shrink-0 text-muted-foreground/40" />{/if}
                <Table2 class={cn('size-3 shrink-0', item.isSchema ? 'text-primary/50' : 'text-muted-foreground/40')} />
                <span class="min-w-0 flex-1 truncate text-ui-xs text-muted-foreground/55">{item.sql || 'Query'}</span>
                {#if !item.error}
                  <span class="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground/50">{formatCompactCount(item.total)} {item.total === 1 ? 'row' : 'rows'}</span>
                {/if}
              </button>
              {#if resOpen}
                {#if item.error}
                  <div class="flex items-start gap-2 px-2.5 py-2">
                    <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    <p class="font-mono text-[11px] leading-relaxed text-destructive">{item.error}</p>
                  </div>
                {:else if item.rows.length === 0}
                  <p class="px-2.5 py-2.5 text-center text-ui-2xs italic text-muted-foreground/50">No rows returned.</p>
                {:else}
                  <div class="overflow-x-auto"><DataTable columns={item.columns} rows={item.rows.slice(0, 15)} embedded showSelection={false} /></div>
                  {#if item.total > 15}<p class="border-t border-border/20 px-2.5 py-1 text-[10px] text-muted-foreground/40">Showing 15 of {formatCompactCount(item.total)} rows</p>{/if}
                {/if}
              {/if}
            </div>

          {:else if item.kind === 'confirm'}
            <div class="overflow-hidden rounded-lg border border-destructive/35 bg-destructive/4">
              <div class="flex items-center gap-2 border-b border-destructive/25 px-2.5 py-2">
                <AlertTriangle class="size-3.5 shrink-0 text-destructive" />
                <span class="text-ui-2xs font-medium text-destructive">Confirm destructive operation</span>
              </div>
              <pre class="whitespace-pre-wrap px-2.5 py-2 font-mono text-ui-2xs text-foreground">{item.sql}</pre>
              <div class="flex items-center justify-end gap-2 border-t border-destructive/15 px-2.5 py-1.5">
                <button type="button" class="inline-flex h-7 items-center rounded-md border border-border px-3 text-ui-2xs text-muted-foreground hover:bg-accent" onclick={() => item.resolve(false)}>Cancel</button>
                <button type="button" class="inline-flex h-7 items-center rounded-md bg-destructive px-3 text-ui-2xs font-medium text-destructive-foreground hover:opacity-90" onclick={() => item.resolve(true)}>Execute</button>
              </div>
            </div>

          {:else if item.kind === 'chart'}
            <div class="group/chart">
              {#if item.error}
                <p class="flex items-center gap-1.5 text-ui-xs text-destructive">
                  <AlertTriangle class="size-3 shrink-0" />{item.error}
                </p>
              {:else}
                <div class="mb-0.5 flex items-center gap-1.5">
                  <span class="min-w-0 flex-1 truncate font-mono text-[10px] font-medium text-foreground/55">{item.spec.title || ''}</span>
                  <span class="font-mono text-[9px] capitalize text-muted-foreground/25 opacity-0 transition-opacity group-hover/chart:opacity-100">{item.spec.type}</span>
                </div>
                <div style="height:{['choropleth','dendrogram','tree','sankey'].includes(item.spec.type) ? 340 : 240}px; width:100%">
                  <AiChartRenderer spec={item.spec} noTitle={true} />
                </div>
              {/if}
            </div>
          {/if}

        {/each}

        {#if showWorking}
          <div class="flex items-center gap-2.5">
            <Sparkles class="size-3 shrink-0 animate-pulse text-primary/70" />
            <span class="text-ui-xs text-muted-foreground/60 transition-opacity duration-200 {thinkingVisible ? 'opacity-100' : 'opacity-0'}">{aiStatusHint || thinkingPhrase}</span>
            <span class="flex gap-0.5">
              <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:0ms"></span>
              <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:120ms"></span>
              <span class="size-1 animate-bounce rounded-full bg-muted-foreground/30" style="animation-delay:240ms"></span>
            </span>
          </div>
        {/if}

      </div>
    {/if}

    {#if error}
      <div class="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-ui-xs text-destructive">
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
        <span class="min-w-0 break-words">{error}</span>
      </div>
    {/if}
  </div>

  <!-- Jump to bottom -->
  {#if userScrolledUp}
    <div class="pointer-events-none absolute inset-x-0 bottom-20 z-10 flex justify-center">
      <button type="button" onclick={jumpToBottom} class="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1.5 text-ui-2xs font-medium text-foreground shadow-lg transition-all hover:bg-accent">
        <ChevronDown class="size-3" />Jump to bottom
      </button>
    </div>
  {/if}

  <!-- Input area -->
  <div class="relative shrink-0 border-t border-border/50 bg-background p-2.5">

    <!-- @ mention popup -->
    {#if mentionOpen && mentionItems.length > 0}
      <div bind:this={mentionEl}
        class="absolute bottom-full left-2.5 right-2.5 z-50 mb-1 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
        <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <Database class="size-3 text-muted-foreground/50" />
          <span class="text-ui-2xs font-medium text-muted-foreground/60">Tables · {schemaContext.activeSchema}</span>
        </div>
        <div class="app-scroll max-h-44 overflow-y-auto p-1">
          {#each mentionItems as item, idx (item.insert)}
            <button type="button"
              class={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors', idx === mentionIdx ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50')}
              onmousedown={(e) => { e.preventDefault(); insertMention(item.insert) }}
            >
              <Table2 class="size-3 shrink-0 text-muted-foreground/50" />
              <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">{item.label}</span>
              <span class="shrink-0 text-ui-2xs text-muted-foreground/40">{item.sub}</span>
            </button>
          {/each}
        </div>
        <div class="border-t border-border/30 px-3 py-1.5">
          <span class="text-ui-2xs text-muted-foreground/40">↑↓ navigate · ↵ select · Esc dismiss</span>
        </div>
      </div>
    {/if}

    <!-- Input box -->
    <div class="overflow-hidden rounded-xl border border-border/50 bg-muted/10 transition-colors focus-within:border-border/80 focus-within:bg-background">
      <!-- Context bar: show active table/view -->
      {#if schemaContext.activeTable || currentView === 'sql'}
        <div class="flex items-center gap-1.5 border-b border-border/30 px-3 py-1.5">
          {#if schemaContext.activeTable}
            <span class="inline-flex items-center gap-1 rounded-md bg-primary/8 px-1.5 py-0.5 font-mono text-[10px] text-primary/70">
              <Table2 class="size-2.5" />{schemaContext.activeSchema}.{schemaContext.activeTable}
            </span>
          {/if}
          {#if currentView === 'sql' && currentSql.trim()}
            <span class="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">
              SQL editor
            </span>
          {/if}
        </div>
      {/if}

      <textarea
        bind:this={inputRef}
        value={inputText}
        oninput={handleInputChange}
        onkeydown={handleInputKeydown}
        rows="1"
        placeholder={configured ? 'Ask anything… type @ for tables' : 'Configure a model first'}
        disabled={!configured}
        class="max-h-40 min-h-[2.25rem] w-full resize-none bg-transparent px-3 pt-2 pb-1 text-ui-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-60"
      ></textarea>

      <!-- Bottom toolbar -->
      <div class="flex items-center gap-1 px-2 pb-1.5">
        <button type="button"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
          title="Mention a table (@)"
          onclick={() => { inputText += '@'; inputRef?.focus(); void tick().then(resizeInput) }}
        ><At class="size-3.5" /></button>
        <div class="flex-1"></div>
        {#if loading}
          <button type="button" class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background text-foreground/60 shadow-sm transition-colors hover:border-ring/50 hover:text-foreground" onclick={stop} title="Stop">
            <Square class="size-2.5 fill-current" />
          </button>
        {:else}
          <button type="button"
            class={cn('flex size-7 shrink-0 items-center justify-center rounded-lg transition-all', inputText.trim() && configured ? 'bg-foreground text-background shadow-sm hover:opacity-85' : 'bg-muted/40 text-muted-foreground/25 cursor-not-allowed')}
            disabled={!inputText.trim() || !configured}
            onclick={() => void send()}
            title="Send (Enter)"
          ><Send class="size-3" /></button>
        {/if}
      </div>
    </div>
  </div>
</div>
