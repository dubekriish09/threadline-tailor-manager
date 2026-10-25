import React, { useEffect, useMemo, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, CalendarDays, Check,
  ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, FilePlus2,
  Filter, LayoutDashboard, Menu, MoreHorizontal, Plus, Ruler, Search,
  Settings, Shirt, SlidersHorizontal, Sparkles, Users, Wallet, X
} from "lucide-react";

const GARMENTS = {
  "Shirt": ["Shirt length", "Chest", "Waist", "Seat / hip", "Shoulder", "Neck / collar", "Sleeve length", "Bicep", "Armhole", "Cuff / wrist"],
  "Trouser": ["Waist", "Seat / hip", "Full length / outseam", "Inseam", "Front rise", "Back rise", "Thigh", "Knee", "Calf", "Bottom / mohri"],
  "Coat / Blazer": ["Chest", "Waist", "Seat / hip", "Shoulder", "Coat length", "Sleeve length", "Bicep", "Armhole", "Neck", "Front length", "Back length"],
  "Sherwani": ["Full length", "Chest", "Waist", "Seat / hip", "Shoulder", "Sleeve length", "Bicep", "Armhole", "Neck", "Collar height", "Front length", "Back length", "Slit height"],
  "Kurta": ["Kurta length", "Chest", "Waist", "Seat / hip", "Shoulder", "Sleeve length", "Bicep", "Armhole", "Neck", "Front neck depth", "Back neck depth", "Side slit height"],
  "Pajama": ["Waist", "Seat / hip", "Full length", "Inseam", "Front rise", "Back rise", "Thigh", "Knee", "Calf", "Bottom / mohri"]
};
const initialCustomers = [];
const initialOrders = [];
const currency = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const readStore = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

function downloadFile(filename, contents, type = "text/plain;charset=utf-8") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = value => { const raw = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""); return `"${raw.replaceAll('"', '""')}"`; };
  return [headers.map(cell).join(","), ...rows.map(row => headers.map(h => cell(row[h])).join(","))].join("\r\n");
}
function exportCustomers(customers) {
  const rows = customers.map(c => ({ ...c, measurements: JSON.stringify(c.measurements || {}) }));
  downloadFile(`threadline-customers-${new Date().toISOString().slice(0,10)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}
function exportOrders(orders) { downloadFile(`threadline-orders-${new Date().toISOString().slice(0,10)}.csv`, toCsv(orders), "text/csv;charset=utf-8"); }
function exportBackup(customers, orders) {
  downloadFile(`threadline-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ app: "Threadline", version: 1, exportedAt: new Date().toISOString(), customers, orders }, null, 2), "application/json;charset=utf-8");
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function exportMeasurementsCard(customer) {
  if (!customer) { window.alert("Select a customer first."); return; }
  const sections = Object.entries(customer.measurements || {}).filter(([, values]) => Object.values(values || {}).some(v => String(v ?? "").trim()));
  const content = sections.map(([garment, values]) => `<section><h2>${escapeHtml(garment)}</h2><table>${Object.entries(values).filter(([,v]) => String(v ?? "").trim()).map(([k,v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join("")}</table></section>`).join("");
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { window.alert("Please allow pop-ups to print the measurement card."); return; }
  w.document.write(`<!doctype html><html><head><title>Measurement card - ${escapeHtml(customer.name)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px Arial,sans-serif;color:#17251c;padding:28px;max-width:760px;margin:auto}h1{margin-bottom:4px}p{color:#59675d}section{break-inside:avoid;margin:22px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px}th{width:60%}.print{margin-bottom:20px}@media print{.print{display:none}body{padding:0}}</style></head><body><button class="print" onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(customer.name)}</h1><p>Customer ID: ${escapeHtml(customer.id)} · Phone: ${escapeHtml(customer.phone)} · Height: ${escapeHtml(customer.height || "—")} · Fit: ${escapeHtml(customer.fit || "—")}</p>${content || "<p>No saved measurements for this customer yet.</p>"}<p>Printed ${new Date().toLocaleString()}</p></body></html>`);
  w.document.close();
}

function Workspace({ user, supabase, onSignOut }) {
  const [customers, setCustomers] = useState(() => readStore("threadline-customers", initialCustomers));
  const [orders, setOrders] = useState(() => readStore("threadline-orders", initialOrders));
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Connecting…");
  const [syncError, setSyncError] = useState("");
  const lastCloudChange = useRef(0);
  const initialLocal = useRef(null);
  const [page, setPage] = useState("Overview");
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedGarment, setSelectedGarment] = useState("Shirt");
  const [unit, setUnit] = useState("in");
  const [measurements, setMeasurements] = useState({});
  const [customerModal, setCustomerModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", height: "", fit: "Regular", notes: "" });
  const [newOrder, setNewOrder] = useState({ customerId: "", garment: "Shirt", due: "", amount: "", paid: "", notes: "" });


  useEffect(() => {
    localStorage.setItem("threadline-customers", JSON.stringify(customers));
  }, [customers]);
  useEffect(() => {
    localStorage.setItem("threadline-orders", JSON.stringify(orders));
  }, [orders]);

  const pullCloudData = async ({ allowMigration = true } = {}) => {
    setSyncStatus("Syncing…");
    setSyncError("");
    const [customerResult, orderResult] = await Promise.all([
      supabase.from("customers").select("*").eq("user_id", user.id),
      supabase.from("orders").select("*").eq("user_id", user.id)
    ]);
    if (customerResult.error || orderResult.error) {
      const error = customerResult.error || orderResult.error;
      setSyncError(error.message);
      setSyncStatus("Sync issue");
      return;
    }
    const cloudCustomers = (customerResult.data || []).map(({ user_id, created_at, updated_at_cloud, ...c }) => c);
    const cloudOrders = (orderResult.data || []).map(({ user_id, created_at, updated_at_cloud, ...o }) => o);
    const localCustomers = readStore("threadline-customers", []);
    const localOrders = readStore("threadline-orders", []);
    if (cloudCustomers.length === 0 && cloudOrders.length === 0 && allowMigration && (localCustomers.length || localOrders.length)) {
      const migrateCustomers = localCustomers.map(c => ({ ...c, user_id: user.id }));
      const migrateOrders = localOrders.map(o => ({ ...o, user_id: user.id }));
      const customerUpload = migrateCustomers.length ? await supabase.from("customers").upsert(migrateCustomers, { onConflict: "user_id,id" }) : { error: null };
      const orderUpload = !customerUpload.error && migrateOrders.length ? await supabase.from("orders").upsert(migrateOrders, { onConflict: "user_id,id" }) : { error: customerUpload.error };
      if (customerUpload.error || orderUpload.error) {
        setSyncError((customerUpload.error || orderUpload.error).message);
        setSyncStatus("Sync issue");
        return;
      }
      setCustomers(localCustomers);
      setOrders(localOrders);
    } else {
      setCustomers(cloudCustomers);
      setOrders(cloudOrders);
    }
    lastCloudChange.current = Date.now();
    setCloudReady(true);
    setSyncStatus("Cloud synced");
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setSyncStatus("Connecting…");
      const [customerResult, orderResult] = await Promise.all([
        supabase.from("customers").select("*").eq("user_id", user.id),
        supabase.from("orders").select("*").eq("user_id", user.id)
      ]);
      if (!alive) return;
      if (customerResult.error || orderResult.error) {
        setSyncError((customerResult.error || orderResult.error).message);
        setSyncStatus("Sync issue");
        return;
      }
      const cloudCustomers = (customerResult.data || []).map(({ user_id, created_at, updated_at_cloud, ...c }) => c);
      const cloudOrders = (orderResult.data || []).map(({ user_id, created_at, updated_at_cloud, ...o }) => o);
      const localCustomers = readStore("threadline-customers", []);
      const localOrders = readStore("threadline-orders", []);
      if (cloudCustomers.length === 0 && cloudOrders.length === 0 && (localCustomers.length || localOrders.length)) {
        const customerUpload = localCustomers.length ? await supabase.from("customers").upsert(localCustomers.map(c => ({ ...c, user_id: user.id })), { onConflict: "user_id,id" }) : { error: null };
        const orderUpload = !customerUpload.error && localOrders.length ? await supabase.from("orders").upsert(localOrders.map(o => ({ ...o, user_id: user.id })), { onConflict: "user_id,id" }) : { error: customerUpload.error };
        if (!alive) return;
        if (customerUpload.error || orderUpload.error) {
          setSyncError((customerUpload.error || orderUpload.error).message);
          setSyncStatus("Sync issue");
          return;
        }
        setCustomers(localCustomers);
        setOrders(localOrders);
      } else {
        setCustomers(cloudCustomers);
        setOrders(cloudOrders);
      }
      lastCloudChange.current = Date.now();
      setCloudReady(true);
      setSyncStatus("Cloud synced");
    })();
    return () => { alive = false; };
  }, [supabase, user.id]);

  useEffect(() => {
    if (!cloudReady) return;
    const timer = window.setTimeout(async () => {
      setSyncStatus("Saving…");
      setSyncError("");
      const customerRows = customers.map(c => ({ ...c, user_id: user.id }));
      const orderRows = orders.map(o => ({ ...o, user_id: user.id }));
      const customerResult = customerRows.length ? await supabase.from("customers").upsert(customerRows, { onConflict: "user_id,id" }) : { error: null };
      const orderResult = !customerResult.error && orderRows.length ? await supabase.from("orders").upsert(orderRows, { onConflict: "user_id,id" }) : { error: customerResult.error };
      if (customerResult.error || orderResult.error) {
        setSyncError((customerResult.error || orderResult.error).message);
        setSyncStatus("Sync issue");
      } else {
        lastCloudChange.current = Date.now();
        setSyncStatus("Cloud synced");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [customers, orders, cloudReady, supabase, user.id]);

  useEffect(() => {
    if (!cloudReady) return;
    const channel = supabase.channel("threadline-cloud-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: "user_id=eq." + user.id }, () => {
        if (Date.now() - lastCloudChange.current < 1200) return;
        pullCloudData({ allowMigration: false });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "user_id=eq." + user.id }, () => {
        if (Date.now() - lastCloudChange.current < 1200) return;
        pullCloudData({ allowMigration: false });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cloudReady, supabase, user.id]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];
  useEffect(() => {
    const saved = selectedCustomer?.measurements?.[selectedGarment] || {};
    const { _unit, ...values } = saved;
    setUnit(_unit || "in");
    setMeasurements(values);
  }, [selectedCustomerId, selectedGarment, customers]);

  const filteredCustomers = useMemo(() => customers.filter(c =>
    `${c.name} ${c.phone} ${c.id}`.toLowerCase().includes(search.toLowerCase())
  ), [customers, search]);
  const totalDue = orders.reduce((sum, o) => sum + Math.max(0, Number(o.amount) - Number(o.paid)), 0);
  const activeOrders = orders.filter(o => !["Delivered", "Cancelled"].includes(o.status)).length;
  const navItems = [
    { name: "Overview", icon: LayoutDashboard, section: "WORKSPACE" },
    { name: "Customers", icon: Users },
    { name: "Measurements", icon: Ruler },
    { name: "Orders", icon: ClipboardList },
  ];
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };

  function addCustomer(e) {
    e.preventDefault();
    if (!newCustomer.name.trim() || !newCustomer.phone.trim() || newCustomer.phone.replace(/\D/g, "").length < 7) { notify("Enter a name and a valid phone number"); return; }
    const id = "C-" + Date.now().toString().slice(-8);
    const customer = { ...newCustomer, id, updated: "Just now", measurements: {} };
    setCustomers(prev => [customer, ...prev]);
    setSelectedCustomerId(id);
    setCustomerModal(false);
    setNewCustomer({ name: "", phone: "", height: "", fit: "Regular", notes: "" });
    setPage("Measurements");
    notify("Customer profile created");
  }
  function saveMeasurements() {
    setCustomers(prev => prev.map(c => c.id === selectedCustomerId
      ? { ...c, updated: "Just now", measurements: { ...(c.measurements || {}), [selectedGarment]: { ...measurements, _unit: unit } } }
      : c));
    notify(`${selectedGarment} measurements saved`);
  }
  function createOrder(e) {
    e.preventDefault();
    const customer = customers.find(c => c.id === newOrder.customerId);
    if (!customer || !newOrder.garment.trim() || !newOrder.due || newOrder.amount === "" || Number(newOrder.amount) < 0 || Number(newOrder.paid || 0) < 0 || Number(newOrder.paid || 0) > Number(newOrder.amount)) { notify("Check order details and ensure advance does not exceed total price"); return; }
    const order = {
      id: "ORD-" + Date.now().toString().slice(-8),
      customerId: customer.id, customer: customer.name, garment: newOrder.garment,
      due: newOrder.due, status: "Measurements taken", amount: Number(newOrder.amount),
      paid: Number(newOrder.paid || 0), notes: newOrder.notes
    };
    setOrders(prev => [order, ...prev]);
    setOrderModal(false);
    setNewOrder({ customerId: customer.id, garment: "Shirt", due: "", amount: "", paid: "", notes: "" });
    setPage("Orders");
    notify("New order created");
  }
  function changeStatus(orderId, status) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Shirt size={21}/></div><div><div className="brand-name">threadline<span>.</span></div><div className="brand-sub">TAILOR STUDIO</div></div><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      <div className="shop-switch"><div className="shop-avatar">TS</div><div className="shop-text"><strong>Tailor Studio</strong><span>Workspace</span></div><ChevronDown size={15} className="muted-icon"/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{navItems.map(item => <button key={item.name} className={`nav-item ${page === item.name ? "active" : ""}`} onClick={() => { setPage(item.name); setMobileNav(false); }}><item.icon size={18}/><span>{item.name}</span>{item.name === "Orders" && <span className="nav-count">{activeOrders}</span>}</button>)}</nav>
      <div className="nav-label second-label">PREFERENCES</div>
      <button className={`nav-item ${page === "Settings" ? "active" : ""}`} onClick={() => { setPage("Settings"); setMobileNav(false); }}><Settings size={18}/><span>Settings</span></button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={18}/></div><strong>Need a hand?</strong><p>Keep your shop organized, one stitch at a time.</p><button onClick={() => notify("Help centre will be added in a later version")}>Visit help centre <ChevronRight size={14}/></button></div><div className="user-profile"><div className="user-avatar">TS</div><div className="user-info"><strong>Shop owner</strong><span>Administrator</span></div><MoreHorizontal size={18} className="muted-icon"/></div></div>
    </aside>
    {mobileNav && <div className="nav-scrim" onClick={() => setMobileNav(false)} />}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)}><Menu size={20}/></button><span className="breadcrumb">Workspace</span><ChevronRight size={15}/><strong>{page}</strong></div><div className="topbar-actions"><div className="today-label"><CalendarDays size={15}/> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div><button className="notification icon-button" onClick={() => notify("You're all caught up")}><Bell size={18}/><i/></button><div className="top-avatar">TS</div></div></header>
      <div className="page-content">
        {page === "Overview" && <Overview customers={customers} orders={orders} activeOrders={activeOrders} totalDue={totalDue} onAddCustomer={() => setCustomerModal(true)} onAddOrder={() => { setNewOrder(p => ({ ...p, customerId: selectedCustomerId || customers[0]?.id || "" })); setOrderModal(true); }} onGo={setPage} onStatus={changeStatus}/>}
        {page === "Customers" && <Customers customers={filteredCustomers} search={search} setSearch={setSearch} onAdd={() => setCustomerModal(true)} onSelect={c => { setSelectedCustomerId(c.id); setPage("Measurements"); }}/>}
        {page === "Measurements" && <Measurements customers={customers} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId} selectedGarment={selectedGarment} setSelectedGarment={setSelectedGarment} unit={unit} setUnit={setUnit} measurements={measurements} setMeasurements={setMeasurements} onSave={saveMeasurements} onAddCustomer={() => setCustomerModal(true)} />}
        {page === "Orders" && <Orders orders={orders} onAdd={() => setOrderModal(true)} onStatus={changeStatus} />}
        {page === "Settings" && <SettingsPage customers={customers} orders={orders} selectedCustomer={selectedCustomer} syncStatus={syncStatus} syncError={syncError} onExportCustomers={() => exportCustomers(customers)} onExportOrders={() => exportOrders(orders)} onExportBackup={() => exportBackup(customers, orders)} onImportBackup={async file => { try { const parsed = JSON.parse(await file.text()); if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.orders)) throw new Error("Invalid backup structure"); if (!confirm(`Replace current data with ${parsed.customers.length} customers and ${parsed.orders.length} orders? Export a backup first if needed.`)) return; setCustomers(parsed.customers); setOrders(parsed.orders); setSelectedCustomerId(parsed.customers[0]?.id || ""); notify("Backup imported successfully"); } catch { notify("Import failed: choose a valid Threadline JSON backup"); } }} onPrintMeasurements={() => exportMeasurementsCard(selectedCustomer)} />}
      </div>
      <footer className="footer"><span>© {new Date().getFullYear()} Threadline Studio</span><span className={syncStatus === "Cloud synced" ? "cloud-state" : "cloud-state warning"}><span className="online-dot"/> {syncStatus} · <button className="footer-link" onClick={onSignOut}>Sign out</button></span></footer>
    </main>
    {customerModal && <Modal title="Add new customer" subtitle="Create a profile to store measurements and orders." onClose={() => setCustomerModal(false)}><form onSubmit={addCustomer} className="modal-form"><Field label="Customer name *"><input autoFocus required placeholder="e.g. Rahul Verma" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name:e.target.value})}/></Field><Field label="Phone number *"><input required inputMode="tel" placeholder="e.g. 98765 43210" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone:e.target.value})}/></Field><div className="form-grid"><Field label="Height"><input placeholder="e.g. 5 ft 8 in" value={newCustomer.height} onChange={e => setNewCustomer({...newCustomer, height:e.target.value})}/></Field><Field label="Fit preference"><select value={newCustomer.fit} onChange={e => setNewCustomer({...newCustomer, fit:e.target.value})}><option>Regular</option><option>Slim</option><option>Relaxed</option><option>Tailored</option></select></Field></div><Field label="Notes"><textarea rows="3" placeholder="Posture, fitting preferences, alterations…" value={newCustomer.notes} onChange={e => setNewCustomer({...newCustomer, notes:e.target.value})}/></Field><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setCustomerModal(false)}>Cancel</button><button className="btn primary" type="submit"><Plus size={16}/> Create customer</button></div></form></Modal>}
    {orderModal && <Modal title="Create garment order" subtitle="Add a new stitching job to the work queue." onClose={() => setOrderModal(false)}><form onSubmit={createOrder} className="modal-form"><CustomerSearchSelect customers={customers} value={newOrder.customerId} onChange={customerId => setNewOrder(prev => ({ ...prev, customerId }))} /><Field label="Garment / order description *"><input required placeholder="e.g. 2 shirts, 1 trouser" value={newOrder.garment} onChange={e => setNewOrder({...newOrder, garment:e.target.value})}/></Field><div className="form-grid"><Field label="Delivery date *"><input required type="date" value={newOrder.due} onChange={e => setNewOrder({...newOrder, due:e.target.value})}/></Field><Field label="Total price (₹) *"><input required type="number" min="0" value={newOrder.amount} onChange={e => setNewOrder({...newOrder, amount:e.target.value})} placeholder="0"/></Field></div><Field label="Advance paid (₹)"><input type="number" min="0" value={newOrder.paid} onChange={e => setNewOrder({...newOrder, paid:e.target.value})} placeholder="0"/></Field><Field label="Order notes"><textarea rows="2" value={newOrder.notes} onChange={e => setNewOrder({...newOrder, notes:e.target.value})} placeholder="Fabric, design, special instructions…"/></Field><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setOrderModal(false)}>Cancel</button><button className="btn primary" type="submit"><Plus size={16}/> Create order</button></div></form></Modal>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function Overview({ customers, orders, activeOrders, totalDue, onAddCustomer, onAddOrder, onGo, onStatus }) {
  const ready = orders.filter(o => o.status === "Ready for fitting").length;
  const stats = [
    { label: "Total customers", value: customers.length.toLocaleString("en-IN"), delta: "Customer profiles", icon: Users, tone: "sage", trend: "up" },
    { label: "Active orders", value: activeOrders.toString(), delta: "Across all stages", icon: ClipboardList, tone: "blue" },
    { label: "Ready for fitting", value: ready.toString(), delta: "Needs attention", icon: Check, tone: "amber" },
    { label: "Outstanding", value: currency(totalDue), delta: "Pending collection", icon: Wallet, tone: "rose" }
  ];
  return <><div className="welcome-row"><div><div className="eyebrow"><Sparkles size={13}/> YOUR WORKSPACE</div><h1>Good morning, <em>Tailor.</em></h1><p className="page-intro">Here's what's happening in your studio today.</p></div><button className="btn primary" onClick={onAddOrder}><Plus size={17}/> New order</button></div>
    <div className="stats-grid">{stats.map((s,i)=><div className="stat-card" key={s.label}><div className="stat-top"><span>{s.label}</span><div className={`stat-icon ${s.tone}`}><s.icon size={18}/></div></div><div className="stat-value">{s.value}</div><div className="stat-bottom"><span className="stat-note">{s.delta}</span>{i===0 && <span className="trend"><ArrowUpRight size={14}/> Active</span>}</div></div>)}</div>
    <div className="content-grid"><section className="panel orders-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Keep every stitch on schedule.</p></div><button className="text-button" onClick={() => onGo("Orders")}>View all <ChevronRight size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>GARMENT</th><th>DUE DATE</th><th>STATUS</th><th></th></tr></thead><tbody>{orders.slice(0,5).map(o=><tr key={o.id}><td><span className="order-id">{o.id}</span></td><td><div className="table-person"><span className="person-avatar">{o.customer.split(" ").map(n=>n[0]).slice(0,2).join("")}</span><span>{o.customer}</span></div></td><td>{o.garment}</td><td><span className={o.due==="Today"?"due-today":""}>{o.due}</span></td><td><Status value={o.status}/></td><td><button className="row-menu" title="Mark ready for fitting" onClick={() => onStatus(o.id, o.status==="Ready for fitting" ? "In stitching" : "Ready for fitting")}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{orders.length===0 && <EmptyState text="No orders yet. Create your first order to get started."/>}</div><div className="panel-footer"><span>Showing {Math.min(orders.length,5)} of {orders.length} orders</span><button className="text-button" onClick={() => onGo("Orders")}>Open order book <ArrowUpRight size={14}/></button></div></section>
    <section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Make the next step count.</p></div><div className="quick-spark"><Sparkles size={17}/></div></div><button className="quick-action" onClick={onAddCustomer}><span className="quick-icon sage"><Users size={19}/></span><span className="quick-copy"><strong>Add a customer</strong><small>Create a new customer profile</small></span><ChevronRight size={17}/></button><button className="quick-action" onClick={() => onGo("Measurements")}><span className="quick-icon blue"><Ruler size={19}/></span><span className="quick-copy"><strong>Record measurements</strong><small>Open the digital measurement book</small></span><ChevronRight size={17}/></button><button className="quick-action" onClick={onAddOrder}><span className="quick-icon amber"><FilePlus2 size={19}/></span><span className="quick-copy"><strong>Create an order</strong><small>Start a new stitching job</small></span><ChevronRight size={17}/></button><div className="tip-card"><div className="tip-label"><Sparkles size={13}/> STUDIO TIP</div><p>Save each customer's measurements by garment type. Next time they visit, you can pick up right where you left off.</p></div></section></div>
    <section className="panel customer-panel"><div className="panel-heading"><div><h2>Recently updated customers</h2><p>Your latest customer records.</p></div><button className="text-button" onClick={() => onGo("Customers")}>All customers <ChevronRight size={15}/></button></div><div className="customer-strip">{customers.slice(0,4).map((c,i)=><button className="customer-mini" key={c.id} onClick={() => onGo("Measurements")}><span className={`mini-avatar av-${i%4}`}>{c.name.split(" ").map(n=>n[0]).slice(0,2).join("")}</span><span className="mini-details"><strong>{c.name}</strong><small>{c.id} · Updated {c.updated}</small></span><ChevronRight size={16}/></button>)}</div></section>
  </>;
}

function Customers({ customers, search, setSearch, onAdd, onSelect }) {
  return <><div className="welcome-row"><div><div className="eyebrow">CUSTOMER DIRECTORY</div><h1>Your <em>customers.</em></h1><p className="page-intro">Every customer, every measurement, all in one place.</p></div><button className="btn primary" onClick={onAdd}><Plus size={17}/> Add customer</button></div><section className="panel directory-panel"><div className="directory-toolbar"><div className="search-box"><Search size={17}/><input placeholder="Search name, phone or customer ID…" value={search} onChange={e=>setSearch(e.target.value)}/>{search && <button className="clear-search" onClick={()=>setSearch("")}><X size={14}/></button>}</div><button className="btn secondary small" onClick={() => { setSearch(""); }}><SlidersHorizontal size={15}/> Clear filters</button></div><div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>PHONE</th><th>HEIGHT</th><th>FIT PREFERENCE</th><th>LAST UPDATED</th><th></th></tr></thead><tbody>{customers.map((c,i)=><tr key={c.id} onClick={()=>onSelect(c)} className="clickable-row"><td><div className="table-person"><span className={`person-avatar av-${i%4}`}>{c.name.split(" ").map(n=>n[0]).slice(0,2).join("")}</span><span><strong>{c.name}</strong><small className="sub-cell">{c.id}</small></span></div></td><td>{c.phone}</td><td>{c.height || "—"}</td><td><span className="fit-tag">{c.fit || "Regular"}</span></td><td>{c.updated}</td><td><button className="row-menu" onClick={e=>{e.stopPropagation();onSelect(c)}}><ChevronRight size={17}/></button></td></tr>)}</tbody></table>{customers.length===0&&<EmptyState text="No matching customers. Try another search or add a customer."/>}</div><div className="panel-footer"><span>{customers.length} customer profiles</span><span>Click a customer to open their measurement book</span></div></section></>;
}

function Measurements({ customers, selectedCustomerId, setSelectedCustomerId, selectedGarment, setSelectedGarment, unit, setUnit, measurements, setMeasurements, onSave, onAddCustomer }) {
  const customer = customers.find(c=>c.id===selectedCustomerId);
  return <><div className="welcome-row"><div><div className="eyebrow">DIGITAL MEASUREMENT BOOK</div><h1>Fit, down to <em>the detail.</em></h1><p className="page-intro">A dedicated measurement record for every customer and garment.</p></div><button className="btn primary" onClick={onSave}><Check size={17}/> Save measurements</button></div>
    {customers.length===0 ? <section className="panel empty-panel"><EmptyState text="Add a customer before recording measurements."/><button className="btn primary" onClick={onAddCustomer}><Plus size={16}/> Add customer</button></section> : <>
    <section className="panel measurement-customer"><div className="measurement-customer-left"><span className="person-avatar large">{customer?.name.split(" ").map(n=>n[0]).slice(0,2).join("")}</span><div><label className="field-label">CUSTOMER PROFILE</label><select className="customer-select" value={selectedCustomerId} onChange={e=>setSelectedCustomerId(e.target.value)}>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}</select><div className="customer-meta">{customer?.phone || "No phone"} <span>•</span> Height: {customer?.height || "Not recorded"} <span>•</span> Fit: {customer?.fit || "Regular"}</div></div></div><button className="btn secondary small" onClick={onAddCustomer}><Plus size={15}/> New customer</button></section>
    <div className="measurement-layout"><section className="panel garment-panel"><div className="panel-heading"><div><h2>Choose garment</h2><p>Measurements are saved separately for each type.</p></div></div><div className="garment-list">{Object.keys(GARMENTS).map((g,i)=>{const saved=Object.keys(customer?.measurements?.[g]||{}).filter(k=>k!=="_unit").length;return <button key={g} className={`garment-option ${selectedGarment===g?"selected":""}`} onClick={()=>setSelectedGarment(g)}><span className={`garment-icon gi-${i}`}><Shirt size={18}/></span><span className="garment-option-copy"><strong>{g}</strong><small>{saved ? `${saved} fields saved` : "No measurements yet"}</small></span>{selectedGarment===g?<span className="selected-check"><Check size={13}/></span>:<ChevronRight size={16}/>}</button>})}</div><div className="measurement-note"><Ruler size={16}/><p><strong>Good to know</strong><br/>Record whether values are body measurements or taken from a finished garment.</p></div></section>
    <section className="panel measurement-form-panel"><div className="panel-heading measurement-form-heading"><div><h2>{selectedGarment} measurements</h2><p>Enter the values provided by your tailor.</p></div><div className="unit-toggle"><button className={unit==="in"?"on":""} onClick={()=>{ if(unit!=="in") { setMeasurements(prev=>Object.fromEntries(Object.entries(prev).map(([k,v])=>[k, v!=="" && Number.isFinite(Number(v)) ? String(Math.round(Number(v)/2.54*10)/10) : v]))); setUnit("in"); } }}>in</button><button className={unit==="cm"?"on":""} onClick={()=>{ if(unit!=="cm") { setMeasurements(prev=>Object.fromEntries(Object.entries(prev).map(([k,v])=>[k, v!=="" && Number.isFinite(Number(v)) ? String(Math.round(Number(v)*2.54*10)/10) : v]))); setUnit("cm"); } }}>cm</button></div></div><div className="measurement-context"><div><span className="context-dot"/><span>Customer: <strong>{customer?.name}</strong></span></div><span className="context-divider"/><span>Units: {unit==="in"?"Inches":"Centimetres"}</span></div><div className="measurement-fields">{GARMENTS[selectedGarment].map((field,i)=><div className="measurement-field" key={field}><label htmlFor={`measure-${i}`}>{field}<span className="measure-index">{String(i+1).padStart(2,"0")}</span></label><div className="measure-input-wrap"><input id={`measure-${i}`} type="number" min="0" step="0.1" placeholder="—" value={measurements[field]||""} onChange={e=>setMeasurements(prev=>({...prev,[field]:e.target.value}))}/><span>{unit}</span></div></div>)}</div><div className="measurement-form-footer"><span><Clock3 size={14}/> {Object.values(measurements).filter(v=>String(v).trim()).length} of {GARMENTS[selectedGarment].length} fields filled</span><button className="btn primary" onClick={onSave}><Check size={16}/> Save {selectedGarment.toLowerCase()} measurements</button></div><div className="body-measurement-warning"><CircleHelp size={16}/><span>Use your shop's standard measurement points and fitting allowance. This form stores the entered values; it does not automatically add ease or calculate finished garment dimensions.</span></div></section></div></>}
  </>;
}

function CustomerSearchSelect({ customers, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find(customer => customer.id === value);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = !term ? customers : customers.filter(customer =>
      `${customer.name || ""} ${customer.phone || ""} ${customer.id || ""}`.toLowerCase().includes(term)
    );
    return results.slice(0, 8);
  }, [customers, query]);

  return <div className="form-field">
    <span>Customer *</span>
    {selected && !open ? (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,border:"1px solid var(--border, #dce3dc)",borderRadius:10,padding:"10px 12px",background:"var(--surface, #fff)"}}>
        <div style={{minWidth:0,display:"flex",flexDirection:"column",gap:3}}>
          <strong>{selected.name}</strong>
          <small style={{color:"var(--muted, #68736b)"}}>{selected.phone || "No phone"} · {selected.id}</small>
        </div>
        <button type="button" className="btn secondary small" onClick={() => { setQuery(""); setOpen(true); }}>Change</button>
      </div>
    ) : (
      <div style={{position:"relative"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,border:"1px solid var(--border, #dce3dc)",borderRadius:10,padding:"0 12px",background:"var(--surface, #fff)"}}>
          <Search size={17} style={{flexShrink:0,color:"var(--muted, #68736b)"}} />
          <input
            autoComplete="off"
            aria-label="Search customers by name, phone or customer ID"
            placeholder="Search name, phone or customer ID…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={event => { setQuery(event.target.value); setOpen(true); }}
            style={{border:0,outline:0,boxShadow:"none",width:"100%",minWidth:0,background:"transparent"}}
          />
          {query && <button type="button" aria-label="Clear customer search" className="clear-search" onClick={() => setQuery("")}><X size={14} /></button>}
        </div>
        {open && <div style={{position:"absolute",zIndex:30,top:"calc(100% + 6px)",left:0,right:0,maxHeight:260,overflowY:"auto",background:"var(--surface, #fff)",border:"1px solid var(--border, #dce3dc)",borderRadius:12,boxShadow:"0 12px 30px rgba(20,35,24,.14)"}}>
          {matches.length ? matches.map(customer => <button
            type="button"
            key={customer.id}
            onClick={() => { onChange(customer.id); setQuery(""); setOpen(false); }}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:0,borderBottom:"1px solid var(--border, #edf0ed)",background:"transparent",textAlign:"left",cursor:"pointer"}}
          >
            <span style={{width:34,height:34,flexShrink:0,borderRadius:"50%",display:"grid",placeItems:"center",background:"#e7efe7",color:"#31543b",fontSize:12,fontWeight:700}}>{(customer.name || "?").split(" ").map(part => part[0]).slice(0,2).join("").toUpperCase()}</span>
            <span style={{minWidth:0,display:"flex",flexDirection:"column",gap:3}}><strong>{customer.name}</strong><small style={{color:"var(--muted, #68736b)"}}>{customer.phone || "No phone"} · {customer.id}</small></span>
          </button>) : <div style={{padding:14,fontSize:13,color:"var(--muted, #68736b)"}}>No customers found. Try another name, phone number or ID.</div>}
          {matches.length > 0 && <div style={{padding:"8px 12px",fontSize:11,color:"var(--muted, #68736b)"}}>{query.trim() ? `Showing up to ${matches.length} matches` : "Type to search across all customers"}</div>}
        </div>}
        {open && <button type="button" onClick={() => { setOpen(false); setQuery(""); }} style={{marginTop:6,border:0,background:"transparent",padding:"4px 0",fontSize:12,color:"var(--muted, #68736b)",cursor:"pointer"}}>Close search</button>}
      </div>
    )}
    {!selected && <small style={{color:"var(--muted, #68736b)"}}>Search by customer name, phone number or ID.</small>}
  </div>;
}

function Orders({ orders, onAdd, onStatus }) {
  const [filter,setFilter] = useState("All orders");
  const statuses=["Measurements taken","Cutting","In stitching","Ready for fitting","Ready for delivery","Delivered","Cancelled"];
  const filtered=orders.filter(o=>filter==="All orders"||o.status===filter);
  return <><div className="welcome-row"><div><div className="eyebrow">STITCHING WORKFLOW</div><h1>Orders in <em>motion.</em></h1><p className="page-intro">Keep every garment moving from measurement to delivery.</p></div><button className="btn primary" onClick={onAdd}><Plus size={17}/> New order</button></div><section className="panel directory-panel"><div className="directory-toolbar"><div className="filter-title"><Filter size={16}/> Filter by status</div><select className="status-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option>All orders</option>{statuses.map(s=><option key={s}>{s}</option>)}</select><span className="toolbar-spacer"/><span className="order-count">{filtered.length} orders</span></div><div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>GARMENT</th><th>DUE DATE</th><th>TOTAL</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>{filtered.map(o=><tr key={o.id}><td><span className="order-id">{o.id}</span></td><td>{o.customer}</td><td>{o.garment}</td><td>{o.due}</td><td>{currency(o.amount)}</td><td><strong>{currency(Math.max(0,o.amount-o.paid))}</strong></td><td><select className="inline-status" value={o.status} onChange={e=>onStatus(o.id,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table>{filtered.length===0&&<EmptyState text="No orders match this status."/>}</div><div className="panel-footer"><span>Order progress is editable from the status menu.</span><span>Payment balances are calculated from total minus advance.</span></div></section></>;
}

function SettingsPage({ customers, orders, selectedCustomer, syncStatus, syncError, onExportCustomers, onExportOrders, onExportBackup, onImportBackup, onPrintMeasurements }) {
  const importRef = React.useRef(null);
  return <><div className="welcome-row"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Shop <em>settings.</em></h1><p className="page-intro">Export, back up and move your shop records safely.</p></div></div>
    <section className="panel settings-panel">
      <div className="settings-row"><div className="settings-icon"><Users size={19}/></div><div><strong>Export customer directory (CSV)</strong><p>Download customer contact details and measurement profile data for spreadsheets.</p></div><button className="btn secondary small" onClick={onExportCustomers}>Export CSV ({customers.length})</button></div>
      <div className="settings-row"><div className="settings-icon"><ClipboardList size={19}/></div><div><strong>Export orders (CSV)</strong><p>Download order status, due dates, prices, advance payments and notes.</p></div><button className="btn secondary small" onClick={onExportOrders}>Export CSV ({orders.length})</button></div>
      <div className="settings-row"><div className="settings-icon"><FilePlus2 size={19}/></div><div><strong>Full backup (JSON)</strong><p>Includes customer profiles, measurements and orders. Keep this file private and store it somewhere secure.</p></div><button className="btn primary small" onClick={onExportBackup}>Download backup</button></div>
      <div className="settings-row"><div className="settings-icon"><Activity size={19}/></div><div><strong>Restore from backup</strong><p>Import a previous Threadline JSON backup. This replaces current data, so export a backup first.</p></div><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) onImportBackup(file); e.target.value = ""; }}/><button className="btn secondary small" onClick={() => importRef.current?.click()}>Import backup</button></div>
      <div className="settings-row"><div className="settings-icon"><Ruler size={19}/></div><div><strong>Print measurement card</strong><p>Choose a customer in Measurements first, then print or save their measurement card as PDF.</p></div><button className="btn secondary small" onClick={onPrintMeasurements} disabled={!selectedCustomer}>Print / PDF</button></div>
      <div className="settings-row"><div className="settings-icon"><Settings size={19}/></div><div><strong>Cloud storage and multi-device sync</strong><p>Customer profiles, measurements and orders sync to your authenticated Supabase account. Keep using exports as an additional backup.</p>{syncError && <p className="sync-error">Sync error: {syncError}</p>}</div><span className="local-badge"><span className="online-dot"/> {syncStatus}</span></div>
    </section></>;
}
function Status({ value }) {
  const cls = value==="Ready for fitting"?"green":value==="In stitching"?"blue":value==="Cutting"?"amber":value==="Delivered"?"gray":value==="Cancelled"?"red":"neutral";
  return <span className={`status-pill ${cls}`}><span/>{value}</span>;
}
function Field({label,children}) { return <label className="form-field"><span>{label}</span>{children}</label>; }
function Modal({title,subtitle,onClose,children}) {
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card"><div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>{children}</div></div>;
}
function EmptyState({text}) { return <div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><p>{text}</p></div>; }


function App() {
  const [supabase, setSupabase] = useState(null);
  const [session, setSession] = useState(null);
  const [configError, setConfigError] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || url.includes("YOUR_PROJECT_REF") || key.includes("YOUR_KEY")) {
      setConfigError("Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your local environment and Cloudflare deployment settings.");
      setAuthLoading(false);
      return;
    }
    const client = createClient(url, key);
    setSupabase(client);
    client.auth.getSession().then(({ data, error }) => {
      if (error) setAuthMessage(error.message);
      setSession(data?.session || null);
      setAuthLoading(false);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function submitAuth(event, mode) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setAuthBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setAuthMessage("Account created. Check your email to confirm the address, then sign in.");
    else setAuthMessage(mode === "signup" ? "Account created." : "");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
  }

  if (authLoading) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Shirt size={21}/></div><h1>Opening Threadline…</h1></div></div>;
  if (configError) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Shirt size={21}/></div><h1>Connect your cloud</h1><p>{configError}</p><p>For local development, create <code>.env.local</code>. In Cloudflare, add the same variables under your Worker/Pages build environment.</p></div></div>;
  if (!session) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Shirt size={21}/></div><div className="brand-name">threadline<span>.</span></div><p className="auth-subtitle">Your tailor studio, securely synced.</p><h1>Welcome to your workspace</h1><form className="modal-form" onSubmit={e => submitAuth(e, "signin")}><Field label="Email address"><input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></Field><Field label="Password"><input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/></Field><button className="btn primary auth-submit" disabled={authBusy}>{authBusy ? "Please wait…" : "Sign in"}</button></form><button className="text-button auth-create" disabled={authBusy} onClick={e => { e.preventDefault(); submitAuth({ preventDefault() {} }, "signup"); }}>Create a new account</button>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}<p className="auth-footnote">Your customer records are private to your signed-in account.</p></div></div>;
  return <Workspace key={session.user.id} user={session.user} supabase={supabase} onSignOut={signOut}/>;
}

export default App;
