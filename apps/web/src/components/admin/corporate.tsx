"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ReceiptText, UserPlus } from "lucide-react";
import { Field, MoneyInput } from "@/components/ui/field";
import { Spinner, Stat } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatRupees } from "@/lib/format";

export function AdminCorporateTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["admin-corporate-accounts"], queryFn: () => api.getCorporateAccounts() });
  const points = useQuery({ queryKey: ["admin-corporate-drop-points"], queryFn: () => api.getCorporateDropPoints() });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [employeeFor, setEmployeeFor] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [dropPointId, setDropPointId] = useState("");
  const [allowancePaise, setAllowancePaise] = useState(20000);
  const [subsidyPercent, setSubsidyPercent] = useState("100");
  const [feeBp, setFeeBp] = useState("500");
  const [creditLimitPaise, setCreditLimitPaise] = useState(500000);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [costCenter, setCostCenter] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-corporate-accounts"] });

  const create = async () => {
    setBusy("create");
    try {
      await api.createCorporateAccount({
        companyName: companyName.trim(),
        gstin: gstin.trim().toUpperCase(),
        billingAddress: billingAddress.trim(),
        dropPointId,
        dailyAllowancePerEmployeePaise: allowancePaise,
        subsidyPercentageBp: Math.round(Number(subsidyPercent) * 100),
        corporateManagementFeeBp: Number(feeBp),
        creditLimitPaise,
      });
      await invalidate();
      toast("Corporate account created", "success");
      setOpen(false);
      setCompanyName("");
      setGstin("");
      setBillingAddress("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const addEmployee = async (accountId: string) => {
    setBusy(`employee-${accountId}`);
    try {
      await api.addCorporateEmployee(accountId, {
        email: employeeEmail.trim(),
        costCenterCode: costCenter.trim(),
      });
      await invalidate();
      toast("Employee enrolled", "success");
      setEmployeeFor(null);
      setEmployeeEmail("");
      setCostCenter("");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const invoice = async (accountId: string) => {
    setBusy(`invoice-${accountId}`);
    try {
      const result = await api.generateCorporateInvoice(accountId);
      await invalidate();
      toast(`Invoice ${result.invoice.invoice_number} · ${formatRupees(result.invoice.total_paise)}`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  if (accounts.isPending) return <div className="skeleton h-64" />;
  if (!accounts.data) return <p className="notice notice-danger">{errorMessage(accounts.error)}</p>;
  const rows = accounts.data.accounts;
  const totalEmployees = rows.reduce((sum, a) => sum + a.employees, 0);
  const unbilled = rows.reduce((sum, a) => sum + a.unbilledBalancePaise, 0);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="h-section">Corporate lunch club</h1>
            <p className="mt-1 text-sm text-ink-muted">Company allowances, employee enrolment and consolidated GST invoices.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setOpen(!open)}>
            <Plus className="h-4 w-4" /> New company
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Companies" value={String(rows.length)} sub="Active accounts" />
          <Stat label="Employees" value={String(totalEmployees)} sub="Enrolled members" />
          <Stat label="Unbilled" value={formatRupees(unbilled)} sub="Across all companies" />
        </div>
      </section>

      {open && (
        <section className="rounded-3xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Building2 className="h-4 w-4" /> Create corporate account
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="label">Company name</span><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></label>
            <label><span className="label">GSTIN</span><input className="input uppercase" maxLength={15} value={gstin} onChange={(e) => setGstin(e.target.value)} /></label>
            <label className="sm:col-span-2"><span className="label">Billing address</span><input className="input" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} /></label>
            <label>
              <span className="label">Drop point</span>
              <select className="input" value={dropPointId} onChange={(e) => setDropPointId(e.target.value)}>
                <option value="">Select a drop point</option>
                {points.data?.dropPoints.map((p) => (
                  <option key={p.id} value={p.id}>{p.clusterName} · {p.name}</option>
                ))}
              </select>
            </label>
            <Field label="Daily allowance / employee">
              <MoneyInput paise={allowancePaise} onChange={setAllowancePaise} ariaLabel="Daily allowance" />
            </Field>
            <label><span className="label">Subsidy %</span><input className="input" inputMode="numeric" value={subsidyPercent} onChange={(e) => setSubsidyPercent(e.target.value.replace(/\D/g, "").slice(0, 3))} /></label>
            <label><span className="label">Management fee (bp)</span><input className="input" inputMode="numeric" value={feeBp} onChange={(e) => setFeeBp(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            <Field label="Monthly credit limit">
              <MoneyInput paise={creditLimitPaise} onChange={setCreditLimitPaise} ariaLabel="Credit limit" />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={busy === "create" || companyName.trim().length < 2 || gstin.length !== 15 || billingAddress.trim().length < 5 || !dropPointId}
              onClick={create}
            >
              {busy === "create" && <Spinner />} Create account
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        {rows.map((account) => (
          <article key={account.id} className="rounded-3xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{account.companyName}</h2>
                  <span className={`badge ${account.isActive ? "badge-success" : "badge-neutral"}`}>{account.isActive ? "active" : "paused"}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">GSTIN {account.gstin} · {account.dropPointName ?? "No drop point"}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {formatRupees(account.dailyAllowancePerEmployeePaise)}/day · {(account.subsidyPercentageBp / 100).toFixed(0)}% subsidy ·{" "}
                  {account.employees} employees · {account.invoices} invoices
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setEmployeeFor(employeeFor === account.id ? null : account.id)}>
                  <UserPlus className="h-3.5 w-3.5" /> Add employee
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy === `invoice-${account.id}`} onClick={() => invoice(account.id)}>
                  {busy === `invoice-${account.id}` ? <Spinner /> : <ReceiptText className="h-3.5 w-3.5" />} Invoice
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-ink-muted">Unbilled <b className="font-medium text-ink tabular">{formatRupees(account.unbilledBalancePaise)}</b></span>
              <span className="text-ink-muted">Credit limit <b className="font-medium text-ink tabular">{formatRupees(account.creditLimitPaise)}</b></span>
            </div>
            {employeeFor === account.id && (
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <label className="min-w-[220px] flex-1"><span className="label">Employee email</span><input className="input" type="email" value={employeeEmail} onChange={(e) => setEmployeeEmail(e.target.value)} placeholder="priya@company.com" /></label>
                <label className="w-36"><span className="label">Cost centre</span><input className="input" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="ENG-01" /></label>
                <button
                  className="btn btn-primary"
                  disabled={busy === `employee-${account.id}` || !employeeEmail.includes("@") || costCenter.trim().length < 1}
                  onClick={() => addEmployee(account.id)}
                >
                  {busy === `employee-${account.id}` && <Spinner />} Enrol
                </button>
              </div>
            )}
          </article>
        ))}
        {rows.length === 0 && <p className="notice">No corporate accounts yet.</p>}
      </section>
    </div>
  );
}
