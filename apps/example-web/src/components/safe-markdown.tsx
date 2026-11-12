import { Markdown } from '@tanstack/markdown/react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * UGC markdown: vendor HTML off, remote images dropped, outbound links rel-locked.
 */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <Markdown allowHtml={false} components={{ img: DropImage, a: SafeLink }}>
      {children}
    </Markdown>
  )
}

function DropImage(_props: ComponentPropsWithoutRef<'img'>): null {
  return null
}

function SafeLink({ href, children, ...rest }: ComponentPropsWithoutRef<'a'>): ReactNode {
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" {...rest}>
      {children}
    </a>
  )
}
