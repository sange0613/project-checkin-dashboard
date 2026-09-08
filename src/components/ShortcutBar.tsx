import { BookOpen, Github, MoreHorizontal } from 'lucide-react'
import { Fragment, useState } from 'react'

type IntegratedToolId = 'daily' | 'checklist' | 'wuwu'

export type Shortcut = { label: string; short: string; href: string; icon?: string; menuName?: string; hidden?: boolean; pinned?: boolean }
export const defaultShortcuts: Shortcut[] = [
  { label: '英语抄写', short: '抄', href: 'https://sange1022.github.io/english-copywork-trainer/', icon: 'book' },
  { label: 'Learn Buffett', short: '巴', href: 'https://learnbuffett.com' },
  { label: 'Munger Models', short: '芒', href: 'https://mungermodels.com' },
  { label: 'GoGoScrum', short: '项', href: 'https://gogoscrum.com' },
  { label: '公众号编辑器', short: '公', href: 'https://sange1022.github.io/xuwu-wechat-editor/' },
  { label: '图片拼贴', short: '拼', href: 'https://sange1022.github.io/xuwu-image-collage/' },
  { label: '图片转 PDF', short: 'P', href: 'https://sange1022.github.io/image-to-pdf-studio/' },
  { label: '图片水印', short: '水', href: 'https://sange1022.github.io/image-watermark-web/' },
  { label: '配色工具', short: '色', href: 'https://sange1022.github.io/shise-palette/' },
  { label: '平面图制作', short: '彩', href: 'https://sange1022.github.io/floor-plan-maker/' },
  { label: '构', menuName: '构图工具', short: '构', href: 'https://sange1022.github.io/qf-07-9a6c3e21/' },
  { label: '间', menuName: '随机平面构成', short: '间', href: 'https://sange1022.github.io/random-planar-composition/' },
  { label: '海', menuName: '轮廓文字', short: '海', href: 'https://sange1022.github.io/contour-text-studio/?v=5787e7a' },
]

type Props = {
  onOpenIntegratedTool: (toolId: IntegratedToolId) => void
  links?: Shortcut[]
  order?: string[]
}

export function shortcutEntries(links: Shortcut[]) {
  return [
    { id: 'daily', label: '饮 · 每日卡路里' }, { id: 'checklist', label: '清 · 清单打卡' }, { id: 'wuwu', label: '物 · 物品日均成本' },
    { id: 'text', label: '字 · 字间排版' }, { id: 'vocabulary', label: '词 · 英语词汇学习' },
    ...links.map(link => ({ id: link.href, label: `${link.short} · ${link.label}` })), { id: 'github', label: 'GitHub' },
  ]
}
export function sortShortcuts<T extends { id: string }>(entries: T[], order: string[] = []): T[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...entries].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length))
}

export function ShortcutBar({ onOpenIntegratedTool, links: secondaryLinks = defaultShortcuts, order = [] }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const primary = [
    ...(['daily', 'checklist', 'wuwu'] as const).map((id, i) => ({ id, node: <button type="button" className="icon-button shortcut-character" aria-label={['每日卡路里', '清单打卡', '物品日均成本'][i]} title={['每日卡路里', '清单打卡', '物品日均成本'][i]} onClick={() => onOpenIntegratedTool(id)}>{['饮', '清', '物'][i]}</button> })),
    { id: 'text', node: <a className="icon-button shortcut-character" href="https://sange1022.github.io/zijian-text-layout/" target="_blank" rel="noopener noreferrer" aria-label="字间排版" title="字间排版">字</a> },
    { id: 'vocabulary', node: <a className="icon-button shortcut-character vocabulary-shortcut" href="https://sange1022.github.io/english-vocabulary-study/" target="_blank" rel="noopener noreferrer" aria-label="词" title="英语词汇学习">词</a> },
    ...secondaryLinks.filter((link, index) => !link.hidden && (link.pinned ?? index < 4)).map(link => ({ id: link.href, node: <span className="desktop-shortcuts"><a className="icon-button shortcut-character" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}>{link.icon === 'book' ? <BookOpen size={17} /> : link.short}</a></span> })),
    { id: 'github', node: <span className="desktop-shortcuts"><a className="icon-button" href="https://github.com/sange1022" target="_blank" rel="noopener noreferrer" aria-label="GitHub 主页" title="GitHub 主页"><Github size={17} /></a></span> },
  ]

  return (
    <>
      {sortShortcuts(primary, order).map(entry => <Fragment key={entry.id}>{entry.node}</Fragment>)}

      <span className="shortcut-more-wrap">
        <button
          type="button"
          className="icon-button shortcut-more-button"
          aria-label={moreOpen ? '收起更多工具' : '更多工具'}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
        >
          <MoreHorizontal size={18} />
        </button>
        {moreOpen ? (
          <div className="shortcut-popover" role="menu" aria-label="更多工具">
            {sortShortcuts([...secondaryLinks.filter(link => !link.hidden).map(link => ({ ...link, id: link.href })), { id: 'github', href: 'https://github.com/sange1022', short: '', label: 'GitHub 主页', icon: 'github' }], order).map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setMoreOpen(false)}>
                {link.icon === 'github' ? <Github size={15} /> : <span>{link.short}</span>}{'menuName' in link ? link.menuName : link.label}
              </a>
            ))}
          </div>
        ) : null}
      </span>
    </>
  )
}
