import { BookOpen, Github, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'

type IntegratedToolId = 'daily' | 'checklist'

const secondaryLinks = [
  { label: '英语抄写', short: '抄', href: 'https://sange1022.github.io/english-copywork-trainer/', icon: 'book' },
  { label: 'Learn Buffett', short: '巴', href: 'https://learnbuffett.com' },
  { label: 'Munger Models', short: '芒', href: 'https://mungermodels.com' },
  { label: 'GoGoScrum', short: '项', href: 'https://gogoscrum.com' },
  { label: '公众号编辑器', short: '公', href: 'https://sange1022.github.io/xuwu-wechat-editor/' },
  { label: '图片拼贴', short: '拼', href: 'https://sange1022.github.io/xuwu-image-collage/' },
  { label: '平面图制作', short: '彩', href: 'https://sange1022.github.io/floor-plan-maker/' },
  { label: '构', menuName: '构图工具', short: '构', href: 'https://sange1022.github.io/qf-07-9a6c3e21/' },
  { label: '间', menuName: '随机平面构成', short: '间', href: 'https://sange1022.github.io/random-planar-composition/' },
  { label: '海', menuName: '轮廓文字', short: '海', href: 'https://sange1022.github.io/contour-text-studio/?v=5787e7a' },
] as const

type Props = {
  onOpenIntegratedTool: (toolId: IntegratedToolId) => void
}

export function ShortcutBar({ onOpenIntegratedTool }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <button type="button" className="icon-button shortcut-character" aria-label="每日卡路里" title="每日卡路里" onClick={() => onOpenIntegratedTool('daily')}>饮</button>
      <button type="button" className="icon-button shortcut-character" aria-label="清单打卡" title="清单打卡" onClick={() => onOpenIntegratedTool('checklist')}>清</button>
      <a className="icon-button shortcut-character" href="https://sange1022.github.io/zijian-text-layout/" target="_blank" rel="noopener noreferrer" aria-label="字间排版" title="字间排版">字</a>
      <a className="icon-button shortcut-character vocabulary-shortcut" href="https://sange1022.github.io/english-vocabulary-study/" target="_blank" rel="noopener noreferrer" aria-label="词" title="英语词汇学习">词</a>

      <span className="desktop-shortcuts">
        {secondaryLinks.map((link) => (
          <a
            key={link.href}
            className="icon-button shortcut-character"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            {'icon' in link ? <BookOpen size={17} /> : link.short}
          </a>
        ))}
        <a className="icon-button" href="https://github.com/sange1022" target="_blank" rel="noopener noreferrer" aria-label="GitHub 主页" title="GitHub 主页">
          <Github size={17} />
        </a>
      </span>

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
            {secondaryLinks.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setMoreOpen(false)}>
                <span>{link.short}</span>{'menuName' in link ? link.menuName : link.label}
              </a>
            ))}
            <a href="https://github.com/sange1022" target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setMoreOpen(false)}>
              <Github size={15} />GitHub 主页
            </a>
          </div>
        ) : null}
      </span>
    </>
  )
}
