"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Store,
  ShieldCheck,
  Bell,
  Mail,
  Package,
  CreditCard,
  ArrowUpRight,
  LockKeyhole,
  Sparkles,
  Globe,
  Building2,
  MessageCircle,
} from "lucide-react";
import { api, useShop } from "@/components/shop-provider";
import { Avatar, PageHeading, Spinner } from "@/components/ui";
import { dateLabel, type StoreSettings } from "@/lib/types";
export function Settings({ onPlans }: { onPlans: () => void }) {
  const { data, saveProfile, notify } = useShop();
  const [tab, setTab] = useState("General");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [whatsapp, setWhatsapp] = useState<{
    code: string;
    expiresInMinutes: number;
    alreadyLinked: boolean;
    whatsappNumber: string | null;
  } | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  useEffect(() => {
    if (tab !== "WhatsApp" || whatsapp) return;
    setWhatsappLoading(true);
    api<typeof whatsapp>("/api/whatsapp/link-code", { method: "POST" })
      .then(setWhatsapp)
      .catch((e) =>
        notify(
          e instanceof Error ? e.message : "Couldn't reach WhatsApp linking.",
          "error",
        ),
      )
      .finally(() => setWhatsappLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const unlinkWhatsapp = async () => {
    setBusy(true);
    try {
      await api("/api/whatsapp/link-code", { method: "DELETE" });
      setWhatsapp(null);
      notify("WhatsApp number unlinked.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to unlink.", "error");
    } finally {
      setBusy(false);
    }
  };
  if (!data) return null;
  const user = data.user;
  const saveGeneral = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await saveProfile({
        name: form.get("name"),
        storeName: form.get("storeName"),
        settings: {
          currency: form.get("currency"),
          timezone: form.get("timezone"),
        },
      });
      notify("Your workspace settings are saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (
    key: "lowStockAlerts" | "orderNotifications" | "weeklyDigest",
  ) => {
    setBusy(true);
    try {
      await saveProfile({ settings: { [key]: !user.settings[key] } });
      notify("Notification preference updated.");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Unable to update preference.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Settings"
        description="Manage your workspace and account."
      />
      <div className="settings-tabs">
        {[
          { name: "General", icon: Store },
          { name: "Notifications", icon: Bell },
          { name: "WhatsApp", icon: MessageCircle },
          { name: "Security", icon: ShieldCheck },
          { name: "Billing & plan", icon: CreditCard },
        ].map((item) => (
          <button
            className={tab === item.name ? "active" : ""}
            key={item.name}
            onClick={() => {
              setTab(item.name);
              setError("");
            }}
          >
            <item.icon size={17} />
            {item.name}
          </button>
        ))}
      </div>
      {tab === "General" && (
        <div className="settings-grid">
          <section className="card settings-card">
            <div className="settings-card-heading">
              <Building2 size={20} />
              <div>
                <h2>Workspace details</h2>
                <p>Store details and regional preferences.</p>
              </div>
            </div>
            <form onSubmit={saveGeneral}>
              <div className="settings-form">
                <div className="settings-profile">
                  <Avatar name={user.name} size="large" />
                  <div>
                    <strong>{user.name}</strong>
                    <span>
                      {user.isDemo ? "Demo workspace owner" : user.email}
                    </span>
                  </div>
                  <span className="owner-label">Owner</span>
                </div>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Your full name</span>
                    <input
                      name="name"
                      defaultValue={user.name}
                      required
                      maxLength={100}
                    />
                  </label>
                  <label className="form-field">
                    <span>Store name</span>
                    <input
                      name="storeName"
                      defaultValue={user.storeName}
                      required
                      maxLength={100}
                    />
                  </label>
                  <label className="form-field">
                    <span>Default currency</span>
                    <select
                      name="currency"
                      defaultValue={user.settings.currency}
                    >
                      {[
                        { code: "USD", name: "US Dollar" },
                        { code: "EUR", name: "Euro" },
                        { code: "GBP", name: "British Pound" },
                        { code: "CAD", name: "Canadian Dollar" },
                        { code: "AUD", name: "Australian Dollar" },
                        { code: "INR", name: "Indian Rupee" },
                        { code: "JPY", name: "Japanese Yen" },
                        { code: "NGN", name: "Nigerian Naira" },
                        { code: "KES", name: "Kenyan Shilling" },
                        { code: "AED", name: "UAE Dirham" },
                      ].map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} – {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Time zone</span>
                    <select
                      name="timezone"
                      defaultValue={user.settings.timezone}
                    >
                      {[
                        "America/New_York",
                        "America/Chicago",
                        "America/Los_Angeles",
                        "America/Toronto",
                        "Europe/London",
                        "Europe/Paris",
                        "Asia/Kolkata",
                        "Asia/Tokyo",
                        "Asia/Dubai",
                        "Africa/Lagos",
                        "Africa/Nairobi",
                        "Australia/Sydney",
                        "UTC",
                      ].map((tz) => (
                        <option key={tz}>{tz}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="form-note">
                  <Globe size={15} />
                  Changing currency updates display formatting; existing amounts
                  are not converted.
                </p>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <span className="save-note">
                  <LockKeyhole size={13} />
                  Only you can change these details
                </span>
                <button className="button button-primary" disabled={busy}>
                  {busy ? <Spinner /> : <CheckCircle2 size={16} />}Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {tab === "Notifications" && (
        <section className="card settings-card narrow-settings">
          <div className="settings-card-heading">
            <Bell size={20} />
            <div>
              <h2>A heads-up, when it matters</h2>
              <p>Choose what appears in your workspace notifications.</p>
            </div>
          </div>
          <div className="notification-settings">
            {[
              {
                key: "lowStockAlerts",
                title: "Low-stock alerts",
                description:
                  "Know when products reach their reorder threshold.",
                icon: Package,
              },
              {
                key: "orderNotifications",
                title: "Pending order reminders",
                description: "Keep track of orders waiting to be completed.",
                icon: Bell,
              },
              {
                key: "weeklyDigest",
                title: "Weekly performance summary",
                description:
                  "Show a weekly revenue snapshot in your notification center.",
                icon: Mail,
              },
            ].map((item) => (
              <div key={item.key}>
                <span className="settings-notification-icon">
                  <item.icon size={21} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <button
                  className={`switch ${user.settings[item.key as keyof StoreSettings] ? "on" : ""}`}
                  role="switch"
                  aria-checked={Boolean(
                    user.settings[item.key as keyof StoreSettings],
                  )}
                  aria-label={item.title}
                  disabled={busy}
                  onClick={() =>
                    toggle(
                      item.key as
                        | "lowStockAlerts"
                        | "orderNotifications"
                        | "weeklyDigest",
                    )
                  }
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
          <p className="settings-bottom-note">
            Notifications appear in-app. No marketing emails, no noise.
          </p>
        </section>
      )}
      {tab === "WhatsApp" && (
        <section className="card settings-card narrow-settings">
          <div className="settings-card-heading">
            <MessageCircle size={21} />
            <div>
              <h2>Record sales by photo, over WhatsApp</h2>
              <p>
                Send a photo of your day's sales sheet or till tally and
                KraTte logs each item as a sale — matching your existing
                products automatically, and adding new ones it hasn't seen
                before.
              </p>
            </div>
          </div>
          {whatsappLoading || !whatsapp ? (
            <Spinner />
          ) : whatsapp.alreadyLinked ? (
            <>
              <p className="settings-note">
                This workspace is linked to{" "}
                <strong>{whatsapp.whatsappNumber}</strong>. Send a sales
                photo to that number any time.
              </p>
              <div className="modal-footer">
                <button
                  className="button"
                  disabled={busy}
                  onClick={unlinkWhatsapp}
                >
                  {busy ? <Spinner /> : null}Unlink this number
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-note">
                Save the KuachaFlo/KraTte WhatsApp number, then send this
                code as a message to link your workspace:
              </p>
              <div className="whatsapp-code-box">
                <span className="whatsapp-code">{whatsapp.code}</span>
                <small>Expires in {whatsapp.expiresInMinutes} minutes</small>
              </div>
            </>
          )}
        </section>
      )}
      {tab === "Security" && (
        <section className="card settings-card narrow-settings">
          <div className="settings-card-heading">
            <ShieldCheck size={21} />
            <div>
              <h2>A safe home for your business</h2>
              <p>Protect your account with a strong, unique password.</p>
            </div>
          </div>
          {user.isDemo ? (
            <div className="security-demo">
              <div className="security-icon">
                <LockKeyhole size={30} />
              </div>
              <h3>You’re exploring a private demo</h3>
              <p>
                Create an account to add password protection and access your
                workspace from any device.
              </p>
              <Link
                href="/login?mode=register"
                className="button button-primary"
              >
                Secure my workspace
                <ArrowUpRight size={16} />
              </Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const values = new FormData(form);
                if (values.get("password") !== values.get("confirm")) {
                  setError("Your new passwords don’t match.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await api("/api/auth", {
                    method: "POST",
                    body: JSON.stringify({
                      action: "password",
                      currentPassword: values.get("currentPassword"),
                      password: values.get("password"),
                    }),
                  });
                  form.reset();
                  notify(
                    "Password updated. Other sessions have been signed out.",
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Unable to change your password.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="settings-form form-grid">
                <label className="form-field full-width">
                  <span>Current password</span>
                  <input
                    type="password"
                    name="currentPassword"
                    required
                    autoComplete="current-password"
                    maxLength={128}
                  />
                </label>
                <label className="form-field">
                  <span>New password</span>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </label>
                <label className="form-field">
                  <span>Confirm new password</span>
                  <input
                    type="password"
                    name="confirm"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                </label>
                {error && (
                  <div className="form-error full-width" role="alert">
                    {error}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <span className="save-note">
                  Changing your password signs out all other devices.
                </span>
                <button className="button button-primary" disabled={busy}>
                  {busy ? <Spinner /> : <ShieldCheck size={16} />}Update
                  password
                </button>
              </div>
            </form>
          )}
        </section>
      )}
      {tab === "Billing & plan" && (
        <section className="card settings-card narrow-settings">
          <div className="settings-card-heading">
            <CreditCard size={21} />
            <div>
              <h2>A plan that grows with you</h2>
              <p>Your workspace subscription, without the fine print.</p>
            </div>
          </div>
          <div className="billing-content">
            <div className="current-plan">
              <span className="plan-icon">
                <Sparkles size={26} />
              </span>
              <div>
                <span>YOUR CURRENT PLAN</span>
                <h3>{user.settings.plan}</h3>
                <p>
                  {user.settings.trialEnds
                    ? `Your free trial ends ${dateLabel(user.settings.trialEnds)}.`
                    : "Everything you need to get your business organized."}
                </p>
              </div>
              <span className="current-plan-price">
                $0<small>due today</small>
              </span>
            </div>
            <div className="plan-feature-list">
              {[
                "Unlimited products and customers",
                "Sales, purchases & expense tracking",
                "Live inventory and reports",
                "Secure, persistent workspace",
              ].map((feature) => (
                <span key={feature}>
                  <CheckCircle2 size={17} />
                  {feature}
                </span>
              ))}
            </div>
            <button className="button button-primary" onClick={onPlans}>
              <Sparkles size={16} />
              {user.settings.trialEnds
                ? "View plan details"
                : "Explore KraTte Pro"}
            </button>
            <p className="billing-note">
              No payment method is connected. Trial activation is free and will
              not create a charge. Paid subscriptions are not enabled in this
              workspace.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
