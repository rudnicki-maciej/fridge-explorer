"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "test-entering" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      const data = await res.json();

      if (data.testAccount) {
        setState("test-entering");
        setTimeout(() => router.push("/plan"), 1000);
      } else {
        setState("sent");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  };

  if (state === "test-entering") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-6">
        <div className="w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold">Test account</h1>
          <p className="text-sm text-zinc-500 animate-pulse">Entering...</p>
        </div>
      </div>
    );
  }

  if (state === "sent") {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-6">
        <div className="w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-zinc-500">
            We sent a magic link to <span className="font-medium text-zinc-700 dark:text-zinc-300">{email}</span>.
            Click the link to sign in.
          </p>
          <button
            onClick={() => setState("idle")}
            className="text-sm text-zinc-400 underline hover:text-zinc-600"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center p-6">
      <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-zinc-500">
            Enter your email to receive a magic link.
          </p>
        </div>

        {errorParam === "expired" && (
          <p className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Link expired, please request a new one.
          </p>
        )}

        {state === "error" && (
          <p className="text-center text-sm text-red-500">{errorMsg}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {state === "sending" ? "Sending..." : "Send magic link"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-400">
          If you don&apos;t have an account, one will be created automatically.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
