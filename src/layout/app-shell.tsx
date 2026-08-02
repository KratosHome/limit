import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  header: ReactNode;
  sidebar: ReactNode;
}

export function AppShell({ children, header, sidebar }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--text)]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-7 py-7">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
