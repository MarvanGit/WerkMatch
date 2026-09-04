'use client';

import {
  Bell,
  BriefcaseBusiness,
  FileText,
  Menu,
  Plus,
  Radio,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'Job inbox', icon: BriefcaseBusiness },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/sources', label: 'Sources', icon: Radio },
  { href: '/profile', label: 'Match profile', icon: SlidersHorizontal },
  { href: '/settings', label: 'Search settings', icon: Settings2 },
] as const;

export function WorkspaceBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href="/"
    >
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="size-4" />
      </div>
      {!compact ? (
        <div>
          <p className="font-heading text-[15px] font-semibold tracking-[-0.02em]">
            WerkMatch
          </p>
          <p className="text-[11px] text-muted-foreground">
            Application workspace
          </p>
        </div>
      ) : null}
    </Link>
  );
}

export function WorkspaceNavLinks({
  active,
  className,
}: {
  active: string;
  className?: string;
}) {
  return (
    <nav className={cn('space-y-1', className)} aria-label="Main navigation">
      {navigation.map((item) => {
        const Icon = item.icon;
        const selected = item.href === active;
        return (
          <Link
            key={item.href}
            aria-current={selected ? 'page' : undefined}
            className={buttonVariants({
              variant: 'ghost',
              className: cn(
                'h-10 w-full justify-start gap-3 px-3',
                selected &&
                  'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
              ),
            })}
            href={item.href}
          >
            <Icon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileWorkspaceMenu({ active }: { active: string }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button aria-label="Open navigation" size="icon" variant="ghost" />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent className="bg-sidebar" side="left">
        <SheetHeader className="border-b border-border/70 px-5 py-5">
          <SheetTitle>
            <WorkspaceBrand />
          </SheetTitle>
          <SheetDescription>
            Navigate your application workspace.
          </SheetDescription>
        </SheetHeader>
        <div className="px-3">
          <WorkspaceNavLinks active={active} />
        </div>
        <div className="mt-auto grid gap-2 border-t border-border/70 p-4">
          <Link
            className={buttonVariants({ variant: 'outline' })}
            href="/notifications"
          >
            <Bell />
            Notifications
          </Link>
          <Link className={buttonVariants()} href="/jobs/new">
            <Plus />
            Add a job
          </Link>
          <form action="/auth/signout" method="post">
            <Button className="w-full" type="submit" variant="ghost">
              <LogOut />
              Sign out
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WorkspacePage({
  active,
  title,
  description,
  actions,
  children,
}: {
  active: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <WorkspaceBrand />
          <div className="hidden items-center gap-1 md:flex">
            <Link
              aria-label="Notifications"
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              href="/notifications"
            >
              <Bell />
            </Link>
            <Link
              className={buttonVariants({ variant: 'outline' })}
              href="/jobs/new"
            >
              <Plus />
              Add a job
            </Link>
          </div>
          <div className="md:hidden">
            <MobileWorkspaceMenu active={active} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-6 sm:px-7 md:grid-cols-[190px_minmax(0,1fr)] lg:px-10 lg:py-9">
        <aside className="hidden md:block">
          <WorkspaceNavLinks active={active} className="sticky top-24" />
        </aside>
        <div className="min-w-0">
          <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {title}
              </h1>
              <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}
