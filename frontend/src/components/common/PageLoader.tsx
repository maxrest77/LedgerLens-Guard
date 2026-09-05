export function PageLoader() {
  return (
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-8">
      <div className="relative flex items-center justify-center mb-4">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        <div className="w-6 h-6 border-2 border-cyan-500/20 border-b-cyan-400 rounded-full animate-spin absolute" />
      </div>
      <p className="text-xs font-medium text-slate-400 animate-pulse tracking-wide">
        Loading view...
      </p>
    </div>
  )
}
