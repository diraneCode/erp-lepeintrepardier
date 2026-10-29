import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
const R = "/Users/dirane_mekem/Documents/dev/crm-isonem/supabase/"
const db = new PGlite()
await db.exec(readFileSync(R + "tests/supabase-stub.sql", "utf8"))
for (const f of ["01_schema.sql", "02_functions.sql", "03_policies.sql", "04_storage.sql", "05_indexes.sql"]) await db.exec(readFileSync(R + "sql/" + f, "utf8"))
// État de la base réelle : catégories par marque, boutique et entrepôt, catalogue du showroom
await db.exec(`insert into public.categories (id, name) values ('c_iso','ISONEM'),('c_yal','YALAZ'),('c_pan','PANTRIX'),('c_mol','MOLUMER');
insert into public.warehouses (id, code, name, type, city, address) values ('w_1','ENT-001','Magasin Village','entrepot','Douala','Village');
insert into public.shops (id, code, name, city, address) values ('s_1','BTQ-001','Showroom Bonamoussadi','Douala','Bonamoussadi');`)
await db.exec(readFileSync(R + "sql/06_produits_showroom.sql", "utf8"))
// Un stock déjà présent sur le showroom (comme la ligne existante en base)
await db.exec(`insert into public.stock_levels (product_id, location_id, quantity) select id, 's_1', 2 from public.products where sku = 'ISO-001'`)
const sql = readFileSync(R + "sql/07_stock_initial_showroom.sql", "utf8")
const r1 = await db.exec(sql)
const total = (await db.query(`select sum(quantity)::int t, count(*)::int n from public.stock_levels where location_id = 's_1'`)).rows[0]
const mv = (await db.query(`select count(*)::int n, sum(quantity)::int s from public.stock_movements where reference = 'STOCK-INITIAL-BTQ-001'`)).rows[0]
const created = (await db.query(`select count(*)::int n from public.products`)).rows[0].n
const iso001 = (await db.query(`select l.quantity from public.stock_levels l join public.products p on p.id = l.product_id where p.sku = 'ISO-001' and l.location_id = 's_1'`)).rows[0].quantity
console.log("1re exécution :", JSON.stringify(total), "| mouvements", JSON.stringify(mv), "| produits", created, "| ISO-001 (2 → 5)", iso001)
console.log("contrôle :", JSON.stringify(r1.at(-1).rows))
// Une vente plus tard, puis réexécution : rien ne doit être écrasé
await db.exec(`update public.stock_levels set quantity = 1 where product_id = (select id from public.products where sku = 'ISO-001') and location_id = 's_1'`)
await db.exec(sql)
const after = (await db.query(`select l.quantity from public.stock_levels l join public.products p on p.id = l.product_id where p.sku = 'ISO-001' and l.location_id = 's_1'`)).rows[0].quantity
const mv2 = (await db.query(`select count(*)::int n from public.stock_movements where reference = 'STOCK-INITIAL-BTQ-001'`)).rows[0].n
console.log("2e exécution : ISO-001 conservé à", after, "| mouvements", mv2, "| entrepôt intact :", (await db.query(`select count(*)::int n from public.stock_levels where location_id = 'w_1'`)).rows[0].n === 0)
