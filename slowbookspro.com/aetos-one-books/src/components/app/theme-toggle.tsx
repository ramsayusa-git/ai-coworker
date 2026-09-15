'use client'
import { MoonIcon, SunIcon, MonitorIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Change theme">
          <SunIcon className="size-4 dark:hidden" />
          <MoonIcon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}><SunIcon /> Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}><MoonIcon /> Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}><MonitorIcon /> System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
