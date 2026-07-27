interface ModulePageProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
}

export function ModulePage({
  actions,
  children,
  description,
  title,
}: ModulePageProps): React.ReactNode {
  return (
    <main>
      <header className="border-b px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-[38px] font-semibold leading-tight tracking-[-0.045em]">{title}</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>
          </div>
          {actions}
        </div>
      </header>
      <div className="px-5 py-7 sm:px-8">{children}</div>
    </main>
  );
}
