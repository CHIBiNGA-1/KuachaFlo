"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { Sheet } from "../Sheet";
import {
  CUSTOMER_TYPES,
  PARTY_STATUSES,
  SUPPLIER_CATEGORIES,
  ShopError,
  TEAM_ROLES,
  TEAM_STATUSES,
  createParty,
  deleteParty,
  tintForName,
  updateParty,
  type Customer,
  type PartyKind,
  type Person,
  type Supplier,
  type TeamMember,
} from "@/lib/shop";

const TITLES: Record<PartyKind, { one: string; detail: string }> = {
  customers: { one: "customer", detail: "Customer" },
  suppliers: { one: "supplier", detail: "Supplier" },
  team: { one: "teammate", detail: "Teammate" },
};

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-bold">{value}</span>
    </div>
  );
}

export function PersonSheet({
  kind,
  person,
  onClose,
  onChanged,
}: {
  kind: PartyKind;
  person: Person | null; // null = new
  onClose: () => void;
  onChanged: () => void;
}) {
  const isNew = person === null;
  const c = person as Customer | null;
  const s = person as Supplier | null;
  const t = person as TeamMember | null;

  const [editing, setEditing] = useState(isNew);
  const [name, setName] = useState(person?.name || "");
  const [email, setEmail] = useState(person?.email || "");
  const [phone, setPhone] = useState(person?.phone || "");
  const [notes, setNotes] = useState(person?.notes || "");
  const [company, setCompany] = useState(c?.company || "");
  const [channel, setChannel] = useState(c?.channel || "Retail");
  const [balance, setBalance] = useState(String(c?.balance ?? ""));
  const [address, setAddress] = useState((c?.address || s?.address) ?? "");
  const [contact, setContact] = useState(s?.contact_person || "");
  const [category, setCategory] = useState(s?.category || "Other");
  const [status, setStatus] = useState((s?.status || t?.status) ?? "Active");
  const [role, setRole] = useState(t?.role || "Sales associate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arming, setArming] = useState(false);

  const titles = TITLES[kind];

  async function save() {
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    if (!email.trim()) {
      setError("An email is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const input: Record<string, unknown> = { name: name.trim(), email: email.trim() };
    if (kind === "customers") {
      Object.assign(input, {
        company: company.trim(),
        phone: phone.trim(),
        channel,
        balance: Number(balance) || 0,
        address: address.trim(),
        notes: notes.trim(),
      });
    } else if (kind === "suppliers") {
      if (!contact.trim()) {
        setError("A contact person is required.");
        setBusy(false);
        return;
      }
      Object.assign(input, {
        contact_person: contact.trim(),
        phone: phone.trim(),
        category,
        status,
        address: address.trim(),
        notes: notes.trim(),
      });
    } else {
      Object.assign(input, {
        phone: phone.trim(),
        role,
        status,
        notes: notes.trim(),
      });
    }
    try {
      if (isNew) await createParty(kind, input);
      else if (person) await updateParty(kind, person.id, input);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!person) return;
    if (!arming) {
      setArming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteParty(kind, person.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof ShopError ? e.message : "Couldn't remove — try again.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      kicker={isNew ? `New ${titles.one}` : titles.detail}
      title={isNew ? `Add them to the book` : person!.name}
      onClose={onClose}
    >
      {!isNew && person && !editing && (
        <div>
          <div className="flex items-center gap-3">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[18px] font-black text-white"
              style={{ background: tintForName(person.name) }}
            >
              {person.name.substring(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold">{person.email}</div>
              <div className="text-[12px] text-muted">{person.phone || "No phone number"}</div>
            </div>
          </div>

          <div className="mt-3">
            {kind === "customers" && c && (
              <>
                <Row label="Business" value={c.company} />
                <Row label="Type" value={c.channel} />
                {c.balance > 0 && <Row label="Balance due" value={money(c.balance)} />}
                <Row label="Address" value={c.address} />
              </>
            )}
            {kind === "suppliers" && s && (
              <>
                <Row label="Contact" value={s.contact_person} />
                <Row label="Category" value={s.category} />
                <Row label="Status" value={s.status} />
                <Row label="Address" value={s.address} />
              </>
            )}
            {kind === "team" && t && (
              <>
                <Row label="Role" value={t.role} />
                <Row label="Status" value={t.status} />
              </>
            )}
            <Row label="Notes" value={person.notes} />
          </div>

          <button onClick={() => setEditing(true)} className="btn btn-dark mt-4 w-full">
            Edit
          </button>

          {error && (
            <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="mt-3 w-full py-2 text-[12px] font-extrabold underline"
            style={{ color: "var(--red)" }}
          >
            {arming
              ? busy
                ? "Removing…"
                : "Tap again to remove"
              : `Remove this ${titles.one}`}
          </button>
        </div>
      )}

      {(isNew || editing) && (
        <div>
          <label className="kicker block">Full name</label>
          <input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chileshe Mwansa" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="kicker block">Email</label>
              <input className="field mt-1.5" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div>
              <label className="kicker block">Phone (optional)</label>
              <input className="field mt-1.5" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+260 …" />
            </div>
          </div>

          {kind === "customers" && (
            <>
              <label className="kicker mt-3 block">Business name (optional)</label>
              <input className="field mt-1.5" value={company} onChange={(e) => setCompany(e.target.value)} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="kicker block">Type</label>
                  <select className="field mt-1.5" value={channel} onChange={(e) => setChannel(e.target.value)}>
                    {CUSTOMER_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="kicker block">Opening balance (K)</label>
                  <input className="field tnum mt-1.5" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
                </div>
              </div>
              <label className="kicker mt-3 block">Address (optional)</label>
              <input className="field mt-1.5" value={address} onChange={(e) => setAddress(e.target.value)} />
            </>
          )}

          {kind === "suppliers" && (
            <>
              <label className="kicker mt-3 block">Contact person</label>
              <input className="field mt-1.5" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who picks up the phone" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="kicker block">Category</label>
                  <select className="field mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
                    {SUPPLIER_CATEGORIES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="kicker block">Status</label>
                  <select className="field mt-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {PARTY_STATUSES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="kicker mt-3 block">Address (optional)</label>
              <input className="field mt-1.5" value={address} onChange={(e) => setAddress(e.target.value)} />
            </>
          )}

          {kind === "team" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="kicker block">Role</label>
                <select className="field mt-1.5" value={role} onChange={(e) => setRole(e.target.value)}>
                  {TEAM_ROLES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="kicker block">Status</label>
                <select className="field mt-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {TEAM_STATUSES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label className="kicker mt-3 block">Notes (optional)</label>
          <input className="field mt-1.5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />

          {error && (
            <p className="mt-3 text-[13px] font-bold" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          <button onClick={save} disabled={busy} className="btn btn-accent mt-4 w-full">
            {busy ? "Saving…" : isNew ? `Add ${titles.one}` : "Save changes"}
          </button>
          {!isNew && (
            <button onClick={() => setEditing(false)} className="mt-2 w-full py-2 text-[12px] font-extrabold text-muted underline">
              Back to details
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}