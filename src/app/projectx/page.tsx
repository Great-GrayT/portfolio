import Link from "next/link";

const simulations = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `Simulation ${i + 1}`,
  href: `/projectx/simulation-${i + 1}`,
}));

export default function ProjectXPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center py-24 px-4">
      <h1 className="text-4xl font-extrabold mb-2 rainbow-text">Project X</h1>
      <p className="text-muted-foreground mb-12 text-center max-w-md">
        A collection of interactive simulations. Select one to get started.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
        {simulations.map((sim) => {
          const isLive = sim.id === 1 || sim.id === 2;
          const Card = (
            <div
              key={sim.id}
              className={`portfolio-card rounded-xl p-6 flex flex-col gap-3 bg-card transition-transform duration-200 ${
                isLive
                  ? "hover:scale-[1.02] cursor-pointer"
                  : "cursor-not-allowed opacity-70"
              }`}
              title={sim.id === 1 ? "Sugarscape Agent-Based Simulation" : sim.id === 2 ? "Schelling Segregation Model" : "Coming soon"}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Simulation {sim.id}
              </span>
              <h2 className="text-xl font-bold">{sim.name}</h2>
              {isLive ? (
                <span className="text-xs text-emerald-500 mt-auto font-medium">
                  ● Live
                </span>
              ) : (
                <span className="text-xs text-muted-foreground mt-auto">
                  Coming soon
                </span>
              )}
            </div>
          );
          return isLive ? (
            <Link key={sim.id} href={sim.href}>
              {Card}
            </Link>
          ) : (
            <div key={sim.id}>{Card}</div>
          );
        })}
      </div>

      <Link
        href="/"
        className="mt-16 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to portfolio
      </Link>
    </main>
  );
}
