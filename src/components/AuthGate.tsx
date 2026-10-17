"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const path = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="p-8 text-slate-500">Đang tải…</div>;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <form
          className="card w-full max-w-sm space-y-3 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr("");
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setErr("Sai email hoặc mật khẩu");
          }}
        >
          <h1 className="text-lg font-bold">Phòng khám mắt</h1>
          <input className="inp" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <input className="inp" type="password" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <button className="btn w-full">Đăng nhập</button>
        </form>
      </div>
    );
  }

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        (href === "/" ? path === "/" : path.startsWith(href)) ? "bg-sky-600 text-white" : "text-slate-700 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-white px-3 py-2">
        <span className="mr-2 font-bold text-sky-700">👁 Phòng khám mắt</span>
        {tab("/", "Bệnh nhân")}
        {tab("/inventory", "Kho thuốc")}
        <button className="btn-ghost ml-auto !py-1 text-xs" onClick={() => supabase.auth.signOut()}>
          Đăng xuất
        </button>
      </header>
      <main className="mx-auto max-w-[1500px] p-2 md:p-4">{children}</main>
    </>
  );
}
