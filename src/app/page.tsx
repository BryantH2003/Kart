"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  TrendingDown,
  Bell,
  Zap,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/navbar";

const FEATURES = [
  {
    icon: TrendingDown,
    title: "Price History",
    description:
      '90-day charts so you can see exactly when prices dip and whether this "sale" is actually a deal.',
  },
  {
    icon: Bell,
    title: "Price Alerts",
    description:
      "Set a target price and we email you the moment any store drops below it. No more refreshing.",
  },
  {
    icon: Zap,
    title: "AI Recommendation",
    description:
      "Get a plain-English buy or wait signal based on price trends, not guesswork.",
  },
  {
    icon: ShieldCheck,
    title: "Cross-Store Comparison",
    description:
      "See every retailer side-by-side — price, availability, and deal depth — on one page.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Search any product",
    body: "Type a product name or paste a URL. Kart fans out across all connected stores instantly.",
  },
  {
    step: "02",
    title: "Compare & track",
    body: "See real-time prices, historical lows, and add items to your wishlist in one click.",
  },
  {
    step: "03",
    title: "Buy at the right time",
    body: "Our AI reviews the price trend and tells you whether to buy now or wait a few days.",
  },
];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        {/* subtle radial glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
        >
          <div className="h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <Store className="h-3.5 w-3.5 text-primary" />
          Powered by live store data
        </div>

        <h1 className="mt-6 max-w-3xl text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Stop overpaying.{" "}
          <span className="text-primary">Find the best deal</span> across every
          store.
        </h1>

        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Compare prices, track history, and get AI-powered buy or wait
          recommendations — all in one place.
        </p>

        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          className="mt-10 flex w-full max-w-xl gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "Sony WH-1000XM5" or "RTX 4070"…'
              className="h-11 pl-10 text-sm"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="h-11 px-6 text-sm font-semibold"
          >
            Search
          </Button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Free to use · No account required for search
        </p>
      </section>

      {/* ── Features ── */}
      <section className="border-t border-border/60 bg-card/40 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            Everything you need to buy smarter
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Built for shoppers who care about getting the actual best price.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
            How it works
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <div
                key={step}
                className="flex flex-col items-center text-center"
              >
                <span className="text-5xl font-black text-primary/20">
                  {step}
                </span>
                <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-border/60 bg-card/40 px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Ready to stop overpaying?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a free account to track prices and get alerts.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <a href="/auth/login">Get started free</a>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="/search">Browse without signing in</a>
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60 px-4 py-6">
        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kart · Prices update hourly · Not
          affiliated with any retailer
        </p>
      </footer>
    </div>
  );
}
