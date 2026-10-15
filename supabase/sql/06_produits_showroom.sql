-- =============================================================================
-- Le Peintre Pardier ERP — 06 · Catalogue du showroom
-- Source : public/PRODUIT SHOWROON.xlsx (fiche de suivi de stock), 144 articles :
--   ISONEM 50, YALAZ 66, MOLUMER 16, PANTRIX 11, DIVERS 1
-- À exécuter après 05_indexes.sql. Réexécutable : un article déjà présent (même
-- référence) est mis à jour sans toucher à ses prix, son stock ni son statut.
--
-- TVA à 0 % par défaut (modifiable produit par produit dans Produits).
--
-- Le fichier ne contient ni prix ni quantités : les articles sont créés avec un
-- prix d'achat et de vente à 0 FCFA, à compléter dans Produits (ou avec la
-- requête de mise à jour en fin de script). Le stock initial se saisit par une
-- entrée de stock depuis le module Stock.
-- =============================================================================

begin;

-- Catégories (une par marque, plus DIVERS) — créées seulement si elles n'existent pas déjà
insert into public.categories (name, description, color)
select c.name, c.description, c.color
from (values
  ('ISONEM',  'Étanchéité, isolation, primaires, revêtements de sol et finitions ISONEM', '#1e88c9'),
  ('YALAZ',   'Glycéros, laques, antirouilles, vernis, diluants et accessoires YALAZ',   '#ee8f1f'),
  ('MOLUMER', 'Enduits décoratifs, crépis colorés et peintures techniques MOLUMER',      '#5aa832'),
  ('PANTRIX', 'Peintures bâtiment intérieur et extérieur PANTRIX',                       '#4b2e9e'),
  ('DIVERS',  'Articles hors gammes habituelles : offres promotionnelles, lots, échantillons et produits ponctuels', '#6b6880')
) as c(name, description, color)
where not exists (select 1 from public.categories x where upper(x.name) = c.name);

-- Articles
insert into public.products (sku, name, category_id, brand, unit, purchase_price, sale_price, tax_rate, min_stock, status, supplier, packaging)
select v.sku, v.name, cat.id, v.brand, v.unit, 0, 0, 0, 0, 'actif', v.brand, v.packaging
from (values
  ('ISO-001', 'ISONEM THERMAL PAINT 10 L', 'ISONEM', 'piece', '10 L'),
  ('ISO-002', 'ISONEM BE 99 18 kg', 'ISONEM', 'piece', '18 kg'),
  ('ISO-003', 'ISONEM BE 89 10 kg', 'ISONEM', 'piece', '10 kg'),
  ('ISO-004', 'ISONEM M 36 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-005', 'ISONEM MS 20 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-006', 'ISONEM M 35 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-007', 'ISONEM M03 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-008', 'ISONEM JELBETON GREY 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-009', 'ISONEM JELBETON BLUE 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-010', 'ISONEM JELBETON RED 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-011', 'ISONEM JELBETON YELLOW 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-012', 'ISONEM JELBETON GREEN 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-013', 'ISONEM MD 28 A COMP 20 kg', 'ISONEM', 'piece', '20 kg'),
  ('ISO-014', 'ISONEM MD 28 B COMP 10 L', 'ISONEM', 'piece', '10 L'),
  ('ISO-015', 'ISONEM D 10 LATEX 5 L', 'ISONEM', 'piece', '5 L'),
  ('ISO-016', 'ISONEM A4 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-017', 'ISONEM MS 82 1 L', 'ISONEM', 'pot_1l', '1 L'),
  ('ISO-018', 'ISONEM SB GRIS 18 kg', 'ISONEM', 'piece', '18 kg'),
  ('ISO-019', 'ISONEM MS POLIA ISO 383 GREY 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-020', 'ISONEM MS POLYMER BLANC 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-021', 'ISONEM MS POLYMER ISO 383 GREY 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-022', 'ISONEM MS POLYMER ISO 110 BRICK RED 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-023', 'ISONEM SHINE FLOOR ISO 390 GREEN 4,5 kg', 'ISONEM', 'piece', '4,5 kg'),
  ('ISO-024', 'ISONEM SHINE FLOOR ISO 110 RED 4,5 kg', 'ISONEM', 'piece', '4,5 kg'),
  ('ISO-025', 'ISONEM LIQUIDE GLASS 4 kg', 'ISONEM', 'piece', '4 kg'),
  ('ISO-026', 'ISONEM LIQUIDE GLASS 2 kg', 'ISONEM', 'piece', '2 kg'),
  ('ISO-029', 'ISONEM POOL TRANSPARENT 4,5 kg', 'ISONEM', 'piece', '4,5 kg'),
  ('ISO-030', 'ISONEM L 1 L', 'ISONEM', 'pot_1l', '1 L'),
  ('ISO-031', 'ISONEM POOL PAINT BLUE 4,5 kg', 'ISONEM', 'piece', '4,5 kg'),
  ('ISO-032', 'ISONEM EP PRIMER 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-033', 'ISONEM MS 80 3,5 kg', 'ISONEM', 'piece', '3,5 kg'),
  ('ISO-034', 'ISONEM ANTI MOLOTOV 815 g', 'ISONEM', 'piece', '815 g'),
  ('ISO-035', 'ISONEM ISO FIX WELDING PASTE 40 g', 'ISONEM', 'piece', '40 g'),
  ('ISO-036', 'ISONEM LIQUID MARBLE M10 GOLD 500 g', 'ISONEM', 'piece', '500 g'),
  ('ISO-037', 'ISONEM LIQUID MARBLE M01 PEARL 500 g', 'ISONEM', 'piece', '500 g'),
  ('ISO-038', 'ISONEM LIQUID MARBLE GREY 500 g', 'ISONEM', 'piece', '500 g'),
  ('ISO-039', 'ISONEM LIQUID MARBLE GOLD 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-040', 'ISONEM LIQUID MARBLE MERMAID 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-041', 'ISONEM LIQUID MARBLE GREY 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-042', 'ISONEM LIQUID MARBLE M04 BLACK 1 kg', 'ISONEM', 'piece', '1 kg'),
  ('ISO-043', 'ISONEM UNIVERSAL PRIMER 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-044', 'ISONEM UNIVERSAL PRIMER 1 L', 'ISONEM', 'pot_1l', '1 L'),
  ('ISO-045', 'ISONEM STREET PAINT ISO 480 RED 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-046', 'ISONEM STREET PAINT ISO 3383 GREY 5 kg', 'ISONEM', 'piece', '5 kg'),
  ('ISO-050', 'ISONEM UNIVERSAL PRIMER 3 kg', 'ISONEM', 'piece', '3 kg'),
  ('ISO-051', 'ISONEM UNIVERSAL PRIMER 8 kg', 'ISONEM', 'piece', '8 kg'),
  ('ISO-052', 'CLARIANT / VERTE 1 L', 'ISONEM', 'pot_1l', '1 L'),
  ('ISO-053', 'BEHR / ROUGE 946 ml', 'ISONEM', 'piece', '946 ml'),
  ('ISO-054', 'NOVOR COLOR / BLEU 3,78 L', 'ISONEM', 'piece', '3,78 L'),
  ('ISO-055', 'AC ACOMIX COLOR PASTE 1 L', 'ISONEM', 'pot_1l', '1 L'),
  ('YAL-056', 'SYNTHETIC ANTIRUST PAINT GREY 3 kg', 'YALAZ', 'piece', '3 kg'),
  ('YAL-057', 'SYNTHETIC ANTIRUST PAINT OXIDE RED 3 kg', 'YALAZ', 'piece', '3 kg'),
  ('YAL-058', 'SYNTHETIC ANTIRUST PAINT GREY 16 kg', 'YALAZ', 'piece', '16 kg'),
  ('YAL-059', 'SYNTHETIC ANTIRUST PAINT OXIDE RED 16 kg', 'YALAZ', 'piece', '16 kg'),
  ('YAL-060', 'SYNTHETIC PRIMER WHITE 3 kg', 'YALAZ', 'piece', '3 kg'),
  ('YAL-061', 'SYNTHETIC PRIMER WHITE 16 kg', 'YALAZ', 'piece', '16 kg'),
  ('YAL-062', 'SYNTHETIC LUX PAINT WHITE 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-063', 'SYNTHETIC LUX PAINT 3020 FLAT RED 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-064', 'SYNTHETIC LUX PAINT BLACK 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-065', 'SYNTHETIC LUX PAINT 7016 GREY 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-066', 'SYNTHETIC LUX PAINT 5005 BLUE 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-067', 'SYNTHETIC LUX PAINT WHITE 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-068', 'SYNTHETIC LUX PAINT 3020 FLAT RED 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-069', 'SYNTHETIC LUX PAINT BLACK 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-070', 'SYNTHETIC LUX PAINT 7016 GREY 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-071', 'SYNTHETIC LUX PAINT 5005 BLUE 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-072', 'SYNTHETIC ENAMEL PAINT WHITE 2,5 kg', 'YALAZ', 'piece', '2,5 kg'),
  ('YAL-073', 'SYNTHETIC ENAMEL PAINT 3020 FLAT RED 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-074', 'SYNTHETIC ENAMEL PAINT BLACK 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-075', 'SYNTHETIC ENAMEL PAINT 7016 GREY 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-076', 'SYNTHETIC ENAMEL PAINT 5005 BLUE 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-077', 'SYNTHETIC ENAMEL PAINT WHITE 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-078', 'SYNTHETIC ENAMEL PAINT 3020 FLAT RED 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-079', 'SYNTHETIC ENAMEL PAINT BLACK 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-080', 'SYNTHETIC ENAMEL PAINT 7016 GREY 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-081', 'SYNTHETIC ENAMEL PAINT 5005 BLUE 15 kg', 'YALAZ', 'piece', '15 kg'),
  ('YAL-082', 'PARQUET POLISH GLOSSY 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-083', 'PARQUET POLISH GLOSSY 12 kg', 'YALAZ', 'piece', '12 kg'),
  ('YAL-084', 'PARQUET POLISH MATT 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-085', 'PARQUET POLISH MATT 12 L', 'YALAZ', 'piece', '12 L'),
  ('YAL-086', 'VARNISHED WOOD PROTECTOR 9999 NATUREL 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-087', 'VARNISHED WOOD PROTECTOR 2029 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-088', 'VARNISHED WOOD PROTECTOR 8080 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-089', 'SYNTHETIC THINNER 10 L', 'YALAZ', 'piece', '10 L'),
  ('YAL-090', 'SYNTHETIC THINNER 1,35 L', 'YALAZ', 'piece', '1,35 L'),
  ('YAL-091', 'SYNTHETIC THINNER 2,15 L', 'YALAZ', 'piece', '2,15 L'),
  ('YAL-092', 'CELLULOSIC THINNER 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-093', 'ROULEAUX POUR PEINTURE', 'YALAZ', 'rouleau', null),
  ('YAL-094', 'LIBRA SHORT BRUSH N°3', 'YALAZ', 'piece', null),
  ('YAL-095', 'JUNIOR OIL PAINT BRUSH N°3', 'YALAZ', 'piece', null),
  ('YAL-096', 'BLACK OIL PAINT BRUSH N°3', 'YALAZ', 'piece', null),
  ('YAL-097', 'BLACK OIL PAINT BRUSH N°4', 'YALAZ', 'piece', null),
  ('YAL-098', 'DECORATIV BRUSH N°70', 'YALAZ', 'piece', null),
  ('YAL-099', 'FIRST SHORT BRUSH N°1', 'YALAZ', 'piece', null),
  ('YAL-100', 'FIRST SHORT BRUSH N°2', 'YALAZ', 'piece', null),
  ('YAL-101', 'BLACK SHORT BRUSH N°1', 'YALAZ', 'piece', null),
  ('YAL-102', 'BLACK SHORT BRUSH N°2', 'YALAZ', 'piece', null),
  ('YAL-103', 'BLACK SHORT BRUSH N°3', 'YALAZ', 'piece', null),
  ('YAL-104', 'BLACK SHORT BRUSH N°4', 'YALAZ', 'piece', null),
  ('YAL-105', 'ANTI MOISTURE PAINT Y-820 1 kg', 'YALAZ', 'piece', '1 kg'),
  ('YAL-106', 'ANTI MOISTURE PAINT Y-820 2,5 kg', 'YALAZ', 'piece', '2,5 kg'),
  ('YAL-107', 'ANTI MOISTURE PAINT Y-821 10 kg', 'YALAZ', 'piece', '10 kg'),
  ('YAL-108', 'SYNTHETIC LUX BASE 1320A 2,5 kg', 'YALAZ', 'piece', '2,5 kg'),
  ('YAL-109', 'SYNTHETIC LUX BASE 1320B 2,5 kg', 'YALAZ', 'piece', '2,5 kg'),
  ('YAL-110', 'SYNTHETIC LUX BASE 1320D 2,5 kg', 'YALAZ', 'piece', '2,5 kg'),
  ('YAL-111', 'SYNTHETIC LUX BASE 1320A 13,5 kg', 'YALAZ', 'piece', '13,5 kg'),
  ('YAL-112', 'SYNTHETIC LUX BASE 1320B 13,65 kg', 'YALAZ', 'piece', '13,65 kg'),
  ('YAL-113', 'SYNTHETIC LUX BASE 1320D 13,75 kg', 'YALAZ', 'piece', '13,75 kg'),
  ('YAL-114', 'SYNTHETIC ENAMEL BASE 1330A 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-115', 'SYNTHETIC ENAMEL BASE 1330B 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-116', 'SYNTHETIC ENAMEL BASE 1330D 2,5 L', 'YALAZ', 'piece', '2,5 L'),
  ('YAL-117', 'SYNTHETIC ENAMEL BASE 1330A 13,5 kg', 'YALAZ', 'piece', '13,5 kg'),
  ('YAL-118', 'SYNTHETIC ENAMEL BASE 1330B 13,5 kg', 'YALAZ', 'piece', '13,5 kg'),
  ('YAL-119', 'SYNTHETIC ENAMEL BASE 1330D 13,5 kg', 'YALAZ', 'piece', '13,5 kg'),
  ('YAL-120', 'PEINTURE YALAZ SATINE INTÉRIEUR 23 kg', 'YALAZ', 'piece', '23 kg'),
  ('YAL-121', 'PEINTURE YALAZ SATINE EXTÉRIEUR 23 kg', 'YALAZ', 'piece', '23 kg'),
  ('MOL-122', 'COLORED PLASTER BIDON 5 L', 'MOLUMER', 'piece', '5 L'),
  ('MOL-123', 'COLORED PLASTER BAGS 20 kg', 'MOLUMER', 'piece', '20 kg'),
  ('MOL-124', 'COLORED PLASTER SEAU 20 kg', 'MOLUMER', 'piece', '20 kg'),
  ('MOL-125', 'MOLUMER PL02 24 kg', 'MOLUMER', 'piece', '24 kg'),
  ('MOL-126', 'MOLUMER PL05N-01 10 kg', 'MOLUMER', 'piece', '10 kg'),
  ('MOL-127', 'MOLUMER PL05N-02 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-128', 'MOLUMER PL07 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-129', 'MOLUMER ISO PRATIK 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-130', 'MOLUMER 603 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-131', 'MOLUMER SHINGLE 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-132', 'MOLUMER EBRULE 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-133', 'MOLUMER TENIS KORT 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-134', 'MOLUMER YOLCIZGI 3,5 kg', 'MOLUMER', 'piece', '3,5 kg'),
  ('MOL-135', 'MOLUMER SENTETIK SL 350 0,75 kg', 'MOLUMER', 'piece', '0,75 kg'),
  ('MOL-136', 'MOLUMER SL 300 0,75 kg', 'MOLUMER', 'piece', '0,75 kg'),
  ('MOL-137', 'MOLUMER PL 09 1 kg', 'MOLUMER', 'piece', '1 kg'),
  ('PAN-138', 'PANTRIX SATIMAT 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('PAN-139', 'PANTRIX SATIN 20 kg', 'PANTRIX', 'piece', '20 kg'),
  ('PAN-140', 'PANTRIX ISOLAZ 3,5 kg', 'PANTRIX', 'piece', '3,5 kg'),
  ('PAN-141', 'PANTRIX FLAT / MATT 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('PAN-142', 'PANTRIX FLAT / MATT 20 kg', 'PANTRIX', 'piece', '20 kg'),
  ('PAN-143', 'PANTRIX FLAT / MATT 10 kg', 'PANTRIX', 'piece', '10 kg'),
  ('PAN-145', 'PANTRIX COAT EXTÉRIEUR / INTÉRIEUR 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('PAN-146', 'PANTRIX COAT INTÉRIEUR 10 kg', 'PANTRIX', 'piece', '10 kg'),
  ('PAN-147', 'PANTRIX SEMI-GLOSS 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('PAN-148', 'PANTRIX MIX EXTÉRIEUR 2 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('PAN-149', 'ÉCHANTILLON PANTRIX MIX 1 FRESCO SILICONE 25 kg', 'PANTRIX', 'piece', '25 kg'),
  ('DIV-150', 'PANTRIX SATIMAT OFFRE 3 kg', 'DIVERS', 'piece', '3 kg')
) as v(sku, name, brand, unit, packaging)
join lateral (
  select c.id from public.categories c where upper(c.name) = v.brand order by c.id limit 1
) cat on true
on conflict (sku) do update
  set name = excluded.name,
      category_id = excluded.category_id,
      brand = excluded.brand,
      unit = excluded.unit,
      supplier = excluded.supplier,
      packaging = excluded.packaging;

commit;

-- Contrôle : nombre d'articles par catégorie
select c.name as categorie, count(p.id) as articles
from public.categories c
left join public.products p on p.category_id = c.id
group by c.name
order by c.name;

-- -----------------------------------------------------------------------------
-- Si ce script a déjà été exécuté avec l'ancienne TVA (19,25 %), pour repasser
-- les articles du showroom à 0 % (à exécuter séparément) :
--
-- update public.products set tax_rate = 0
-- where sku ~ '^(ISO|YAL|MOL|PAN|DIV)-[0-9]{3}$' and tax_rate = 19.25;
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Mise à jour des prix (exemple, à adapter puis exécuter séparément) :
--
-- update public.products as p
-- set purchase_price = v.achat, sale_price = v.vente
-- from (values
--   ('ISO-001', 45000, 62000),
--   ('YAL-056', 9500, 13500)
-- ) as v(sku, achat, vente)
-- where p.sku = v.sku;
-- -----------------------------------------------------------------------------
