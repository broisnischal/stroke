/**
 * Shared icon registry — maps a stable semantic name to both a Lucide component
 * and a Hugeicons data object, so the <Icon> wrapper can render either family
 * based on the user's icon-set setting.
 *
 * Coverage is intentionally incremental: a name may have a Lucide entry only.
 * <Icon> falls back to Lucide whenever a Hugeicons mapping is missing, so the UI
 * never breaks and the Hugeicons look can be extended one name at a time.
 *
 * Add a new icon:
 *   1. import its Lucide component + Hugeicons data below,
 *   2. add a `name: { lucide, huge }` entry,
 *   3. render it anywhere with `<Icon name="…" class="size-4" />`.
 */

// ── Lucide components ────────────────────────────────────────────────────────
import X from '@lucide/svelte/icons/x'
import Check from '@lucide/svelte/icons/check'
import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
import ChevronDown from '@lucide/svelte/icons/chevron-down'
import ChevronUp from '@lucide/svelte/icons/chevron-up'
import ChevronRight from '@lucide/svelte/icons/chevron-right'
import ChevronLeft from '@lucide/svelte/icons/chevron-left'
import Plus from '@lucide/svelte/icons/plus'
import Minus from '@lucide/svelte/icons/minus'
import Search from '@lucide/svelte/icons/search'
import Trash2 from '@lucide/svelte/icons/trash-2'
import Table2 from '@lucide/svelte/icons/table-2'
import RefreshCw from '@lucide/svelte/icons/refresh-cw'
import Copy from '@lucide/svelte/icons/copy'
import Loader2 from '@lucide/svelte/icons/loader-2'
import KeyRound from '@lucide/svelte/icons/key-round'
import ExternalLink from '@lucide/svelte/icons/external-link'
import Database from '@lucide/svelte/icons/database'
import Code2 from '@lucide/svelte/icons/code-2'
import Terminal from '@lucide/svelte/icons/terminal'
import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
import Sparkles from '@lucide/svelte/icons/sparkles'
import GitBranch from '@lucide/svelte/icons/git-branch'
import Download from '@lucide/svelte/icons/download'
import Play from '@lucide/svelte/icons/play'
import Eye from '@lucide/svelte/icons/eye'
import EyeOff from '@lucide/svelte/icons/eye-off'
import Bot from '@lucide/svelte/icons/bot'
import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
import AlertCircle from '@lucide/svelte/icons/alert-circle'
import ShieldCheck from '@lucide/svelte/icons/shield-check'
import Pencil from '@lucide/svelte/icons/pencil'
import Braces from '@lucide/svelte/icons/braces'
import Lock from '@lucide/svelte/icons/lock'
import LayoutTemplate from '@lucide/svelte/icons/layout-template'
import History from '@lucide/svelte/icons/history'
import ArrowRight from '@lucide/svelte/icons/arrow-right'
import Clock from '@lucide/svelte/icons/clock'
import Zap from '@lucide/svelte/icons/zap'
import Settings from '@lucide/svelte/icons/settings'
import Maximize2 from '@lucide/svelte/icons/maximize-2'
import Filter from '@lucide/svelte/icons/filter'
import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
import Menu from '@lucide/svelte/icons/menu'
import FolderOpen from '@lucide/svelte/icons/folder-open'

// ── Hugeicons data ───────────────────────────────────────────────────────────
import {
  Cancel01Icon, Tick01Icon, CheckmarkCircle02Icon, ArrowDown01Icon, ArrowUp01Icon,
  ArrowRight01Icon, ArrowLeft01Icon, Add01Icon, MinusSignIcon, Search01Icon,
  Delete02Icon, Table01Icon, RefreshIcon, Copy01Icon, Loading03Icon, Key01Icon,
  LinkSquare01Icon, Database01Icon, SourceCodeIcon, TerminalIcon, ChartLineData02Icon,
  SparklesIcon, GitBranchIcon, Download04Icon, PlayIcon, ViewIcon, ViewOffSlashIcon,
  AiBrain01Icon, Alert02Icon, AlertCircleIcon, Shield01Icon, PencilEdit01Icon,
  BracketsIcon, SquareLock01Icon, DashboardSquare01Icon, HistoryIcon, Clock01Icon,
  FlashIcon, Settings01Icon, Maximize01Icon, FilterIcon, MoreHorizontalIcon,
  Menu01Icon, FolderOpenIcon,
} from '@hugeicons/core-free-icons'

/** @type {Record<string, { lucide: any, huge?: any }>} */
export const ICON_MAP = {
  'x':              { lucide: X,             huge: Cancel01Icon },
  'check':          { lucide: Check,         huge: Tick01Icon },
  'check-circle-2': { lucide: CheckCircle2,  huge: CheckmarkCircle02Icon },
  'chevron-down':   { lucide: ChevronDown,   huge: ArrowDown01Icon },
  'chevron-up':     { lucide: ChevronUp,     huge: ArrowUp01Icon },
  'chevron-right':  { lucide: ChevronRight,  huge: ArrowRight01Icon },
  'chevron-left':   { lucide: ChevronLeft,   huge: ArrowLeft01Icon },
  'plus':           { lucide: Plus,          huge: Add01Icon },
  'minus':          { lucide: Minus,         huge: MinusSignIcon },
  'search':         { lucide: Search,        huge: Search01Icon },
  'trash-2':        { lucide: Trash2,        huge: Delete02Icon },
  'table-2':        { lucide: Table2,        huge: Table01Icon },
  'refresh-cw':     { lucide: RefreshCw,     huge: RefreshIcon },
  'copy':           { lucide: Copy,          huge: Copy01Icon },
  'loader-2':       { lucide: Loader2,       huge: Loading03Icon },
  'key-round':      { lucide: KeyRound,      huge: Key01Icon },
  'external-link':  { lucide: ExternalLink,  huge: LinkSquare01Icon },
  'database':       { lucide: Database,      huge: Database01Icon },
  'code-2':         { lucide: Code2,         huge: SourceCodeIcon },
  'terminal':       { lucide: Terminal,      huge: TerminalIcon },
  'bar-chart-2':    { lucide: BarChart2,     huge: ChartLineData02Icon },
  'sparkles':       { lucide: Sparkles,      huge: SparklesIcon },
  'git-branch':     { lucide: GitBranch,     huge: GitBranchIcon },
  'download':       { lucide: Download,      huge: Download04Icon },
  'play':           { lucide: Play,          huge: PlayIcon },
  'eye':            { lucide: Eye,           huge: ViewIcon },
  'eye-off':        { lucide: EyeOff,        huge: ViewOffSlashIcon },
  'bot':            { lucide: Bot,           huge: AiBrain01Icon },
  'alert-triangle': { lucide: AlertTriangle, huge: Alert02Icon },
  'alert-circle':   { lucide: AlertCircle,   huge: AlertCircleIcon },
  'shield-check':   { lucide: ShieldCheck,   huge: Shield01Icon },
  'pencil':         { lucide: Pencil,        huge: PencilEdit01Icon },
  'braces':         { lucide: Braces,        huge: BracketsIcon },
  'lock':           { lucide: Lock,          huge: SquareLock01Icon },
  'layout-template':{ lucide: LayoutTemplate,huge: DashboardSquare01Icon },
  'history':        { lucide: History,       huge: HistoryIcon },
  'arrow-right':    { lucide: ArrowRight,    huge: ArrowRight01Icon },
  'clock':          { lucide: Clock,         huge: Clock01Icon },
  'zap':            { lucide: Zap,           huge: FlashIcon },
  'settings':       { lucide: Settings,      huge: Settings01Icon },
  'maximize-2':     { lucide: Maximize2,     huge: Maximize01Icon },
  'filter':         { lucide: Filter,        huge: FilterIcon },
  'more-horizontal':{ lucide: MoreHorizontal,huge: MoreHorizontalIcon },
  'menu':           { lucide: Menu,          huge: Menu01Icon },
  'folder-open':    { lucide: FolderOpen,    huge: FolderOpenIcon },
}
