type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        This Phase 1 workflow will be implemented here.
      </p>
    </div>
  );
}