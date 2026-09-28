import { Link } from "react-router-dom";
import { Icon } from "../components/ui/icon";
import { Card } from "../components/ui/card";

type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  const featureName = title.replace(/\s*—\s*Coming Soon$/i, "");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-slate-500">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{featureName}</h1>
        <p className="mt-1 text-sm text-slate-600">This workflow is not available yet.</p>
      </div>

      <Card className="relative overflow-hidden border-slate-200 bg-white p-6 sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-teal-100/70 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-blue-100/70 blur-3xl" />

        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-teal-200 bg-teal-50 text-teal-800 shadow-sm">
            <Icon name="warehouse" className="h-8 w-8" />
          </div>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Coming soon
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{featureName} is on the way</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
            We’re preparing this workflow for the workspace. It will appear here once it’s ready to use.
          </p>
          <Link to="/dashboard" className="mt-7 inline-flex h-10 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2">
            Back to dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
