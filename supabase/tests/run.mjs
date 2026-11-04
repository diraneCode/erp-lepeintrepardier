// Tests des scripts SQL (schéma, fonctions métier, sécurité RLS) dans PGlite.
// Usage : pnpm test:sql
// Les scripts 01 → 06 sont exécutés deux fois (ils doivent être réexécutables),
// puis chaque scénario est joué sous l'identité d'un employé.
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const SQL = new URL("../sql/", import.meta.url)
const SCRIPTS = ["01_schema.sql", "02_functions.sql", "03_policies.sql", "04_storage.sql", "05_indexes.sql"]
const db = new PGlite()
await db.exec(readFileSync(new URL("./supabase-stub.sql", import.meta.url), "utf8"))
for (const pass of [1, 2]) {
  for (const f of SCRIPTS) {
    try {
      await db.exec(readFileSync(new URL(f, SQL), "utf8"))
    } catch (e) {
      console.error(`✘ ${f} (passe ${pass}) : ${e.message}`)
      process.exit(1)
    }
  }
}
console.log("✔ scripts 01 → 05 exécutés deux fois sans erreur")

let ok = 0
let ko = 0
function check(label, cond, detail = "") {
  if (cond) ok++
  else ko++
  console.log(`${cond ? "✔" : "✘"} ${label}${detail ? ` — ${detail}` : ""}`)
}
const q = async (sql, params) => (await db.query(sql, params)).rows
const fails = async (sql, params) => {
  try {
    await db.query(sql, params)
    return null
  } catch (e) {
    return e.message
  }
}

const U = {
  admin: "00000000-0000-0000-0000-000000000001",
  cais: "00000000-0000-0000-0000-000000000002",
  com: "00000000-0000-0000-0000-000000000003",
  com2: "00000000-0000-0000-0000-000000000004",
  mag: "00000000-0000-0000-0000-000000000005",
  susp: "00000000-0000-0000-0000-000000000006",
  gest: "00000000-0000-0000-0000-000000000007",
}
async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U[user] ?? ""}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}
const line = (amount, productId = "") => JSON.stringify([{ productId, description: "Article", quantity: 1, unitPrice: amount, discount: 0 }])

// Données de départ (insérées sans utilisateur : les automatismes ne s'appliquent pas)
await db.exec(`
insert into auth.users values ('${U.admin}','admin@p.cm'),('${U.cais}','cais@p.cm'),('${U.com}','com@p.cm'),('${U.com2}','com2@p.cm'),('${U.mag}','mag@p.cm'),('${U.susp}','susp@p.cm'),('${U.gest}','gest@p.cm');
insert into public.warehouses (id, code, name, type, city, address) values ('w1','ENT-1','Entrepôt 1','entrepot','Douala','Bassa'),('w2','ENT-2','Entrepôt 2','entrepot','Yaoundé','Nk');
insert into public.shops (id, code, name, city, address, supply_warehouse_id) values ('s1','BTQ-1','Akwa','Douala','Akwa','w1'),('s2','BTQ-2','Mvan','Yaoundé','Mvan','w2');
insert into public.employees (id, user_id, matricule, first_name, last_name, gender, email, phone, hire_date, department, position, contract_type, base_salary, location_id, role, status) values
 ('e1','${U.admin}','LPP-0001','Ad','Min','H','admin@p.cm','+237600000001','2020-01-01','direction','DG','cdi',1000000,'w1','super_admin','actif'),
 ('e2','${U.cais}','LPP-0002','Cai','Ssiere','F','cais@p.cm','+237600000002','2020-01-01','boutique','Caissière','cdi',200000,'s1','caissiere','actif'),
 ('e3','${U.com}','LPP-0003','Com','Un','H','com@p.cm','+237600000003','2020-01-01','commercial','Commercial(e)','cdi',300000,'w1','commercial','actif'),
 ('e4','${U.com2}','LPP-0004','Com','Deux','F','com2@p.cm','+237600000004','2020-01-01','commercial','Commercial(e)','cdi',300000,'w1','commercial','actif'),
 ('e5','${U.mag}','LPP-0005','Mag','Asinier','H','mag@p.cm','+237600000005','2020-01-01','logistique','Magasinier','cdi',150000,'w2','magasinier','actif'),
 ('e6','${U.susp}','LPP-0006','Sus','Pendu','H','susp@p.cm','+237600000006','2020-01-01','commercial','Commercial(e)','cdi',150000,'w1','commercial','suspendu'),
 ('e7','${U.gest}','LPP-0007','Ges','Tion','F','gest@p.cm','+237600000007','2020-01-01','logistique','Gestionnaire de stock','cdi',250000,'w1','gestionnaire_stock','actif');
insert into public.categories (id, name) values ('c1','Peintures'),('c2','Outillage');
insert into public.products (id, sku, name, category_id, unit, purchase_price, sale_price) values
 ('p1','C1-001','Acrylique 20 L','c1','piece',28000,38500),('p2','C1-002','Glycéro 4 L','c1','piece',12500,17800),('p3','C2-001','Rouleau 180','c2','rouleau',1500,2500);
insert into public.stock_levels (product_id, location_id, quantity) values ('p1','s1',10),('p2','s1',5),('p1','w2',100),('p2','w2',40),('p3','w2',25),('p1','w1',50);
insert into public.clients (id, code, type, name, contact_name, phone, city, segment, owner_id) values
 ('cl1','CLI-0001','entreprise','Client du com','X','+237611','Douala','btp','e3'),
 ('cl2','CLI-0002','entreprise','Client du com2','Y','+237612','Douala','btp','e4'),
 ('cl3','CLI-0003','particulier','Client libre','Z','+237613','Douala','particulier','e4');
insert into public.quotes (id, number, client_id, date, valid_until, items, status, owner_id) values ('d1','01/2026/10','cl1','2026-10-01','2026-10-31','${line(10000)}','envoye','e3');
`)

check("anon : aucun accès aux clients", !!(await fails(`set role anon; select * from public.clients; reset role;`).finally(() => db.exec("reset role"))))

// ------------------------------------------------------------------ Gestion commerciale ouverte à tous
for (const [user, me] of [["mag", "e5"], ["gest", "e7"], ["cais", "e2"]]) {
  await as(user, async () => {
    const cl = await q(`select id from public.clients`)
    check(`${user} : voit tous les clients`, cl.length >= 3, String(cl.length))
    await q(`insert into public.prospects (code, type, name, contact_name, phone, city, segment, source, need, owner_id) values ('', 'particulier', 'Prospect ${user}', 'P', '+2376', 'Douala', 'particulier', 'terrain', 'Peinture', $1)`, [me])
    await q(`insert into public.opportunities (title, client_id, amount, stage, probability, expected_close, owner_id, source) values ('Affaire ${user}', 'cl3', 500000, 'prospection', 10, '2026-12-01', $1, 'terrain')`, [me])
    const [d] = await q(`insert into public.quotes (number, client_id, date, valid_until, items, status, owner_id) values ('', 'cl3', '2026-10-05', '2026-11-04', $2::jsonb, 'brouillon', $1) returning id, number`, [me, line(25000)])
    check(`${user} : crée prospect, opportunité et proforma`, /^\d{2}\/2026\/10$/.test(d.number), d.number)
    await q(`insert into public.followups (target_type, target_id, subject, channel, due_date, owner_id) values ('devis', $2, 'Relance', 'appel', '2026-10-20', $1)`, [me, d.id])
    check(`${user} : programme une relance`, (await q(`select 1 from public.followups where owner_id = $1`, [me])).length === 1)
    check(`${user} : proforma au nom d'un autre refusée`, !!(await fails(`insert into public.quotes (number, client_id, date, valid_until, items, status, owner_id) values ('', 'cl3', '2026-10-05', '2026-11-04', '[]', 'brouillon', 'e3')`)))
    const [{ i }] = await q(`select public.convert_quote_to_invoice($1) as i`, [d.id])
    check(`${user} : transforme sa proforma en facture et la voit`, (await q(`select 1 from public.invoices where id = $1`, [i.id])).length === 1)
    if (user !== "cais") {
      const [{ s }] = await q(`select public.create_sale($1::jsonb, false) as s`, [JSON.stringify({ boutique_id: "s2", seller_id: me, date: "2026-10-12", payment_method: "mobile_money", status: "livree", channel: "boutique", items: JSON.parse(line(15000)) })])
      check(`${user} : enregistre une vente à son nom`, /^VTE-/.test(s.number), s.number)
      check(`${user} : vente au nom d'un autre refusée`, !!(await fails(`select public.create_sale($1::jsonb, false)`, [JSON.stringify({ boutique_id: "s2", seller_id: "e3", date: "2026-10-12", payment_method: "especes", status: "livree", channel: "boutique", items: JSON.parse(line(1000)) })])))
      check(`${user} : ne voit que ses ventes`, (await q(`select seller_id from public.sales`)).every((r) => r.seller_id === me))
      check(`${user} : ne modifie pas le client d'un autre`, (await q(`update public.clients set name = 'X' where id = 'cl1' returning id`)).length === 0)
    }
  })
}
await as("com", async () => {
  check("commercial : ne voit que ses prospects", (await q(`select owner_id from public.prospects`)).every((r) => r.owner_id === "e3"))
  check("commercial : ne voit pas les proformas des autres", (await q(`select owner_id from public.quotes`)).every((r) => r.owner_id === "e3"))
})
await as("mag", async () => {
  check("magasinier : voit les niveaux de stock des boutiques (vente)", (await q(`select 1 from public.stock_levels where location_id = 's1'`)).length > 0)
  check("magasinier : ne voit pas les mouvements des autres sites", (await q(`select 1 from public.stock_movements where from_location_id = 's1' or to_location_id = 's1'`)).length === 0)
})

// ------------------------------------------------------------------ Ventes, factures, stock
await as("cais", async () => {
  const [{ s }] = await q(`select public.create_sale($1::jsonb, true) as s`, [JSON.stringify({ boutique_id: "s1", seller_id: "e2", client_id: "cl1", date: "2026-10-14", payment_method: "especes", status: "livree", channel: "boutique", items: [{ productId: "p1", description: "Acrylique", quantity: 2, unitPrice: 38500, discount: 0 }] })])
  const [lvl] = await q(`select quantity from public.stock_levels where product_id = 'p1' and location_id = 's1'`)
  check("vente : stock décrémenté", lvl.quantity === 8, String(lvl.quantity))
  const [inv] = await q(`select status, amount_paid::int paid from public.invoices where sale_id = $1`, [s.id])
  check("vente : facture créée et soldée", inv.status === "payee" && inv.paid === 77000, JSON.stringify(inv))
  check("vente : stock insuffisant refusé", (await fails(`select public.create_sale($1::jsonb, false)`, [JSON.stringify({ boutique_id: "s1", seller_id: "e2", date: "2026-10-14", payment_method: "especes", status: "livree", channel: "boutique", items: [{ productId: "p2", description: "G", quantity: 99, unitPrice: 1, discount: 0 }] })]))?.includes("Stock insuffisant"))
  check("caissière : vente hors de sa boutique refusée", !!(await fails(`select public.create_sale($1::jsonb, false)`, [JSON.stringify({ boutique_id: "s2", seller_id: "e2", date: "2026-10-14", payment_method: "especes", status: "livree", channel: "boutique", items: JSON.parse(line(100)) })])))
})

// ------------------------------------------------------------------ Mouvements de stock : référence facultative, motif libre
await as("gest", async () => {
  await q(`insert into public.stock_movements (product_id, type, quantity, to_location_id, reason) values ('p3', 'entree', 5, 'w1', 'Livraison fournisseur Batimat')`)
  const [m] = await q(`select reference, reason, user_id from public.stock_movements where reason = 'Livraison fournisseur Batimat'`)
  check("stock : mouvement sans référence, motif libre", m.reference === null && m.user_id === "e7", JSON.stringify(m))
  check("stock : motif obligatoire", !!(await fails(`insert into public.stock_movements (product_id, type, quantity, to_location_id, reason) values ('p3', 'entree', 1, 'w1', '  ')`)))
})

// ------------------------------------------------------------------ Inventaire
await as("mag", async () => {
  const [{ id }] = await q(`select public.create_inventory($1::jsonb) as id`, [JSON.stringify({ locationId: "w2", label: "Inventaire mensuel", scope: "stock" })])
  const lines = await q(`select product_id, expected from public.inventory_lines where inventory_id = $1 order by product_id`, [id])
  check("inventaire : fiche créée avec le stock théorique du site", lines.length === 3 && lines.find((l) => l.product_id === "p1").expected === 100, JSON.stringify(lines))
  const [inv] = await q(`select number, status from public.inventories where id = $1`, [id])
  check("inventaire : numéro attribué, en cours", /^INV-\d{4}-\d{4}$/.test(inv.number) && inv.status === "en_cours", JSON.stringify(inv))
  check("inventaire : autre site refusé (magasinier)", !!(await fails(`select public.create_inventory($1::jsonb)`, [JSON.stringify({ locationId: "s1", label: "X", scope: "stock" })])))
  await q(`select public.save_inventory_counts($1, $2::jsonb)`, [id, JSON.stringify([{ productId: "p1", counted: 97, comment: "3 seaux abîmés" }, { productId: "p2", counted: 40 }, { productId: "p3", counted: 26 }])])
  const counted = await q(`select product_id, counted from public.inventory_lines where inventory_id = $1 and counted is not null`, [id])
  check("inventaire : comptage enregistré", counted.length === 3)
  // Une vente pendant l'inventaire : l'ajustement porte sur l'écart avec le stock réel au moment de la validation
  await db.exec("reset role")
  await db.exec(`update public.stock_levels set quantity = 99 where product_id = 'p1' and location_id = 'w2'`)
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U.mag}', false);`)
  const [{ n }] = await q(`select public.validate_inventory($1) as n`, [id])
  check("inventaire : validation → ajustements des écarts", n === 2, String(n))
  const lv = Object.fromEntries((await q(`select product_id, quantity from public.stock_levels where location_id = 'w2'`)).map((r) => [r.product_id, r.quantity]))
  check("inventaire : stock aligné sur le comptage", lv.p1 === 97 && lv.p2 === 40 && lv.p3 === 26, JSON.stringify(lv))
  const adj = await q(`select type, quantity, reason, reference from public.stock_movements where reference = $1 order by product_id`, [inv.number])
  check("inventaire : mouvements d'ajustement tracés", adj.length === 2 && adj.every((a) => a.type === "ajustement") && adj[0].quantity === -2, JSON.stringify(adj))
  check("inventaire : validé, plus modifiable", !!(await fails(`select public.save_inventory_counts($1, '[{"productId":"p1","counted":1}]'::jsonb)`, [id])))
  check("inventaire : double validation refusée", !!(await fails(`select public.validate_inventory($1)`, [id])))
})
await as("com", async () => {
  check("commercial : pas de création d'inventaire", !!(await fails(`select public.create_inventory($1::jsonb)`, [JSON.stringify({ locationId: "w1", label: "X", scope: "all" })])))
})
await as("gest", async () => {
  const [{ id }] = await q(`select public.create_inventory($1::jsonb) as id`, [JSON.stringify({ locationId: "w1", label: "Tournant outillage", scope: "category", categoryId: "c2" })])
  const lines = await q(`select product_id, expected from public.inventory_lines where inventory_id = $1`, [id])
  check("inventaire : par catégorie, produits sans stock inclus (théorique 0 ou réel)", lines.length === 1 && lines[0].product_id === "p3", JSON.stringify(lines))
  await q(`select public.cancel_inventory($1)`, [id])
  check("inventaire : annulation", (await q(`select status from public.inventories where id = $1`, [id]))[0].status === "annule")
})

// ------------------------------------------------------------------ Caisse
await as("cais", async () => {
  const bal = async () => Number((await q(`select coalesce(sum(case when direction='entree' then amount else -amount end),0) b from public.cash_movements where location_id='s1'`))[0].b)
  const b0 = await bal()
  check("caisse : vente avec facture en espèces → entrée en caisse", b0 === 77000, String(b0))
  check("caisse : versement supérieur au solde refusé", (await fails(`insert into public.cash_movements (number, location_id, direction, kind, amount, label, bank_name, deposit_mode) values ('', 's1', 'sortie', 'versement_banque', $1, 'V', 'BICEC', 'especes')`, [b0 + 1]))?.includes("insuffisant"))
  await q(`insert into public.cash_movements (number, location_id, direction, kind, amount, label, bank_name, deposit_mode, slip_number, depositor) values ('', 's1', 'entree', 'versement_banque', 50000, 'Versement', 'Afriland First Bank', 'especes', 'BV-1', 'Cai')`)
  check("caisse : versement en banque (sens imposé, solde mis à jour)", (await bal()) === 27000)
  const [{ n }] = await q(`select public.cash_expense($1::jsonb) as n`, [JSON.stringify({ locationId: "s1", amount: 5000, category: "transport", description: "Taxi", supplier: "Taxi" })])
  check("caisse : dépense de caisse payée", (await q(`select status from public.expenses where number = $1`, [n]))[0].status === "payee" && (await bal()) === 22000)
  check("caisse : brouillard non modifiable", (await q(`update public.cash_movements set amount = 1 returning id`)).length === 0 && (await q(`delete from public.cash_movements returning id`)).length === 0)
})
await as("mag", async () => {
  check("caisse : invisible pour le magasinier", (await q(`select id from public.cash_movements`)).length === 0)
})

// ------------------------------------------------------------------ Paie, pointage, compte suspendu
await as("admin", async () => {
  await q(`insert into public.attendance (employee_id, date, check_in, check_out, break_minutes, status, overtime_minutes) values ('e3', '2026-12-01', '08:00', '20:00', 60, 'present', 180)`)
  await q(`select public.generate_payslips('2026-12')`)
  const [{ ot }] = await q(`select overtime::int ot from public.payslips where employee_id = 'e3' and period = '2026-12'`)
  check("paie : heures sup. reprises (3 h → 6 200 FCFA)", ot === 6200, String(ot))
  const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'products'`)).map((r) => r.column_name)
  check("TVA : colonne retirée des produits", !cols.includes("tax_rate"))
  const [inv] = await q(`insert into public.invoices (number, client_id, boutique_id, date, due_date, items, status) values ('', 'cl1', 's1', '2026-10-20', '2026-10-20', '[{"productId":"","description":"Service","quantity":2,"unitPrice":10000,"discount":10,"taxRate":19.25}]', 'emise') returning number`)
  const [je] = await q(`select lines from public.journal_entries where reference = $1`, [inv.number])
  check("TVA : facture comptabilisée sans TVA (411 / 701, total après remise)", je.lines.length === 2 && je.lines[0].debit === 18000 && !je.lines.some((l) => l.account === "4431"), JSON.stringify(je.lines))
})
await as("susp", async () => {
  check("compte suspendu : plus aucun accès", (await q(`select id from public.products`)).length === 0 && (await q(`select id from public.clients`)).length === 0)
})

console.log(`\nRésultat : ${ok} réussis, ${ko} échoués`)
await db.close()
process.exit(ko ? 1 : 0)
