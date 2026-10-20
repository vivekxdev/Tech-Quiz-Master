import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Copy,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import React from "react";
import { SignInButton } from "@clerk/clerk-react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2";

const PRIMARY_BUTTON = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 ${FOCUS_RING}`;

const SECONDARY_BUTTON = `inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 ${FOCUS_RING}`;

const FEATURES = [
  {
    icon: Layers,
    title: "Quiz studio",
    text: "Build quizzes from CSV in seconds, preview every question and clean up rows before publishing.",
  },
  {
    icon: BarChart3,
    title: "Honest platform stats",
    text: "User, login, quiz and question counts served live by the admin API — no made-up numbers.",
  },
  {
    icon: FileSpreadsheet,
    title: "CSV import + template",
    text: "Download a ready-made template, drop your spreadsheet and watch the live preview validate it.",
  },
  {
    icon: Copy,
    title: "Duplicate & clean up",
    text: "Clone any quiz server-side and manage the catalogue without ever resending answer keys.",
  },
  {
    icon: Eye,
    title: "Question previews",
    text: "Review question text, options and levels on screen before anyone takes the quiz.",
  },
  {
    icon: ShieldCheck,
    title: "Locked down",
    text: "Admin-only routes, server-side role checks and answer keys that never leave the server.",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "1. Import",
    text: "Upload a CSV (or download our template) and every row is parsed and validated instantly.",
  },
  {
    icon: Eye,
    title: "2. Preview & publish",
    text: "Check the parsed questions, trim anything you do not need and publish to the catalogue.",
  },
  {
    icon: Rocket,
    title: "3. Track & manage",
    text: "Watch platform stats, sort and search quizzes, then duplicate or delete in one click.",
  },
];

const Hero = () => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50">
      {/* Decorative background, purely visual */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="absolute left-0 top-1/3 h-56 w-56 rounded-full bg-sky-100/60 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-20">
        {/* ---------- HERO ---------- */}
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-600 shadow-sm">
              <Sparkles size={14} aria-hidden="true" />
              Admin console
            </span>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Welcome to{" "}
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Tech Quiz Master
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 lg:mx-0">
              Create quizzes, manage the catalogue and watch the
              platform&apos;s real numbers — all from one clean, secure admin
              panel.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
              <SignInButton mode="modal">
                <button type="button" className={PRIMARY_BUTTON}>
                  <Lock size={18} aria-hidden="true" />
                  Sign in to dashboard
                </button>
              </SignInButton>
              <a href="#features" className={SECONDARY_BUTTON}>
                Explore features
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-600 lg:justify-start">
              {[
                "Admin-only access",
                "Answer keys stay server-side",
                "Live platform stats",
              ].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2
                    size={16}
                    className="text-emerald-500"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview mock */}
          <div className="relative mx-auto w-full max-w-md">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-indigo-100 via-white to-violet-100 blur-xl"
            />

            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-indigo-100/60">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600">
                    <GraduationCap size={16} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    Quiz studio
                  </span>
                </div>
                <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  Sample data
                </span>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Technology
                  </p>
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-700">
                    React Fundamentals
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["Basic", "Intermediate", "Advanced"].map((level) => (
                    <span
                      key={level}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        level === "Intermediate"
                          ? "border-amber-100 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      {level}
                    </span>
                  ))}
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                    15 min
                  </span>
                </div>

                <div className="space-y-2">
                  {[0, 1, 2].map((row) => (
                    <div
                      key={row}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600">
                        {row + 1}
                      </span>
                      <span className="h-2 w-full rounded-full bg-slate-200/80" />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-400"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled
                    className="rounded-xl bg-indigo-600/90 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Publish quiz
                  </button>
                </div>
              </div>
            </div>

            <div className="absolute -left-3 -top-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md sm:flex">
              <FileSpreadsheet
                size={14}
                className="text-emerald-500"
                aria-hidden="true"
              />
              CSV import
            </div>
            <div className="absolute -bottom-3 -right-3 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-md sm:flex">
              <Lock size={14} className="text-indigo-500" aria-hidden="true" />
              Answer keys secured
            </div>
          </div>
        </div>

        {/* ---------- FEATURES ---------- */}
        <section id="features" className="scroll-mt-24 pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Everything you need to run the quiz catalogue
            </h2>
            <p className="mt-3 text-slate-600">
              Built on the same design system as the dashboard, list and quiz
              detail screens.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                  <feature.icon size={18} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section className="pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              From spreadsheet to published quiz
            </h2>
            <p className="mt-3 text-slate-600">
              Three steps, no surprises along the way.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"
              >
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600">
                  <step.icon size={20} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="pt-24">
          <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-12 text-center shadow-lg shadow-indigo-200/60">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
            />
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Ready to manage your quizzes?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-indigo-100">
              Sign in with your admin account to open the dashboard, create
              quizzes and review the catalogue.
            </p>
            <div className="mt-8 flex justify-center">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 ${FOCUS_RING}`}
                >
                  <Lock size={18} aria-hidden="true" />
                  Sign in to dashboard
                </button>
              </SignInButton>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- FOOTER ---------- */}
      <footer className="relative border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600">
              <GraduationCap size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">
                Tech Quiz Master
              </p>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
                Admin panel
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Tech Quiz Master · Secured with
            Clerk
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Hero;
