import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Badge } from './badge'
import { Checkbox } from './checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'
import { Spinner } from './spinner'
import { Switch } from './switch'
import { Toggle } from './toggle'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'

describe('new shadcn primitives smoke', () => {
  it('renders Empty + Spinner + Badge + Alert', () => {
    render(
      <div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>Nothing here</EmptyTitle>
            <EmptyDescription>Try another filter</EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Badge>hook</Badge>
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Details</AlertDescription>
        </Alert>
      </div>,
    )
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByText('hook')).toBeInTheDocument()
    expect(screen.getByText('Heads up')).toBeInTheDocument()
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('renders Switch + Checkbox + ToggleGroup', () => {
    render(
      <div>
        <Switch checked={false} onCheckedChange={() => {}} aria-label="flag" />
        <Checkbox checked={false} onCheckedChange={() => {}} aria-label="box" />
        <Toggle aria-label="solo">T</Toggle>
        <ToggleGroup value={['a']} onValueChange={() => {}} aria-label="group">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      </div>,
    )
    expect(screen.getByLabelText('flag')).toBeInTheDocument()
    expect(screen.getByLabelText('box')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders Select closed trigger', () => {
    const items = [
      { label: 'Pick', value: null as string | null },
      { label: 'One', value: 'one' },
    ]
    render(
      <Select items={items} defaultValue={null}>
        <SelectTrigger aria-label="pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={String(item.value)} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>,
    )
    expect(screen.getByLabelText('pick')).toBeInTheDocument()
  })
})
