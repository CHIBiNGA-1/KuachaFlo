"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile, type ServiceChoice } from "@/lib/supabase";
import { Welcome } from "@/components/Welcome";
import { Fork } from "@/components/Fork";
import { ServiceHome } from "@/components/ServiceHome";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
  }, []);

  useEffect(() => {
    refreshSession();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [refreshSession]);

  useEffect(() => {
    if (!session?.user || !supabase) {
      if (session === null) setProfile(null);
      return;
    }
    setProfile(undefined);
    supabase
      .from("profiles")
      .select("id, service_choice, chosen_at")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setProfile(null);
          return;
        }
        setProfile(data as Profile | null);
      });
  }, [session]);

  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div
          className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl text-xl font-black"
          style={{ background: "var(--ink)", color: "#d7f26d" }}
        >
          KF
        </div>
      </div>
    );
  }

  if (!session) {
    return <Welcome onAuthed={refreshSession} />;
  }

  const choice = profile?.service_choice as ServiceChoice | null | undefined;
  if (!choice) {
    return (
      <Fork
        userId={session.user.id}
        onLocked={(c) =>
          setProfile({ id: session.user.id, service_choice: c, chosen_at: new Date().toISOString() })
        }
        onSignOut={() => { setSession(null); setProfile(null); }}
      />
    );
  }

  return (
    <ServiceHome
      choice={choice}
      email={session.user.email ?? ""}
      onSignOut={() => { setSession(null); setProfile(null); }}
    />
  );
}
