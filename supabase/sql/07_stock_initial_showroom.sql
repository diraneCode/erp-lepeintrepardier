-- =============================================================================
-- Le Peintre Pardier ERP — 07 · Stock initial du Showroom Bonamoussadi
-- Source : STOCK.csv (fiche de suivi de stock), 142 produits, 8636 unités.
--
-- · Le stock de chaque produit du fichier est FIXÉ à la quantité indiquée sur la
--   boutique BTQ-001 (y compris les quantités à 0).
-- · Chaque écart avec le stock précédent est tracé par un mouvement
--   « ajustement » (référence STOCK-INITIAL-BTQ-001), visible dans Stock.
-- · 11 produits absents du catalogue sont créés (prix à 0 FCFA, à compléter).
-- · Les produits du catalogue absents du fichier ne sont pas modifiés.
--
-- Script à exécuter UNE SEULE FOIS, après 06_produits_showroom.sql : s'il a déjà
-- été appliqué (mouvements STOCK-INITIAL-BTQ-001 présents), il s'arrête sans rien
-- modifier — il n'écrase donc jamais un stock qui a vécu depuis (ventes, entrées).
-- =============================================================================

begin;

do $$
declare
  v_location text := (select id from public.shops where code = 'BTQ-001');
  v_missing text;
  v_count integer;
begin
  if v_location is null then
    raise exception 'Boutique BTQ-001 (Showroom Bonamoussadi) introuvable';
  end if;
  if exists (select 1 from public.stock_movements where reference = 'STOCK-INITIAL-BTQ-001') then
    raise notice 'Stock initial déjà appliqué : aucune modification.';
    return;
  end if;

  -- 1. Produits du fichier absents du catalogue
  insert into public.products (sku, name, category_id, brand, unit, purchase_price, sale_price, min_stock, status, supplier, packaging)
  select v.sku, v.name, c.id, v.brand, 'piece', 0, 0, 0, 'actif', v.brand, v.packaging
  from (values
  ('ISO-151', 'ISONEM SB GRIS 10 kg', 'ISONEM', '10 kg'),
  ('ISO-152', 'ISONEM MS POLIA ROUGE 5 kg', 'ISONEM', '5 kg'),
  ('ISO-153', 'ISONEM MS FLOOR 5 kg', 'ISONEM', '5 kg'),
  ('ISO-154', 'ISONEM MS FLOOR 18 kg', 'ISONEM', '18 kg'),
  ('ISO-155', 'ISONEM SHINE FLOOR ISO GRIS 4,5 kg', 'ISONEM', '4,5 kg'),
  ('ISO-156', 'ISONEM SAMPLE EP PRIMER 1,9 kg', 'ISONEM', '1,9 kg'),
  ('ISO-157', 'ISONEM SAMPLE POOL B 1,9 kg', 'ISONEM', '1,9 kg'),
  ('ISO-158', 'ISONEM SAMPLE SHINE FLOOR B 1,9 kg', 'ISONEM', '1,9 kg'),
  ('YAL-159', 'PEINTURE YALAZ SATINE INTÉRIEUR 4 kg', 'YALAZ', '4 kg'),
  ('PAN-160', 'PANTRIX SATIMAT EXTÉRIEUR 25 kg', 'PANTRIX', '25 kg'),
  ('PAN-161', 'PANTRIX FRESCO MIX EXTÉRIEUR 3 25 kg', 'PANTRIX', '25 kg')
  ) as v(sku, name, brand, packaging)
  join lateral (select id from public.categories where upper(name) = v.brand order by id limit 1) c on true
  on conflict (sku) do nothing;

  -- 2. Quantités du fichier
  create temporary table _stock_initial (sku text primary key, quantity integer not null) on commit drop;
  insert into _stock_initial (sku, quantity) values
  ('ISO-001', 5),  -- n° 1 · ISONEM THERMAL PAINT
  ('ISO-003', 10),  -- n° 2 · ISONEM BE 89
  ('ISO-004', 9),  -- n° 3 · ISONEM M 36
  ('ISO-005', 6),  -- n° 4 · ISONEM MS 20
  ('ISO-006', 9),  -- n° 5 · ISONEM M 35
  ('ISO-007', 5),  -- n° 6 · ISONEM M 03
  ('ISO-008', 4),  -- n° 7 · ISONEM JELBETON GREY
  ('ISO-009', 5),  -- n° 8 · ISONEM JELBETON BLUE
  ('ISO-010', 4),  -- n° 9 · ISONEM JELBETON RED
  ('ISO-011', 5),  -- n° 10 · ISONEM JELBETON YELLOW
  ('ISO-012', 6),  -- n° 11 · ISONEM JELBETON GREEN
  ('ISO-013', 12),  -- n° 12 · ISONEM MD 28 A COMP
  ('ISO-014', 14),  -- n° 13 · ISONEM MD 28 B COMP
  ('ISO-015', 5),  -- n° 14 · ISONEM D 10 LATEX
  ('ISO-016', 20),  -- n° 15 · ISONEM A4
  ('ISO-017', 73),  -- n° 16 · ISONEM MS 82
  ('ISO-151', 5),  -- n° 17 · ISONEM SB GRIS
  ('ISO-018', 12),  -- n° 18 · ISONEM SB GRIS
  ('ISO-019', 10),  -- n° 19 · ISONEM MS POLIA GREY
  ('ISO-152', 6),  -- n° 20 · ISONEM MS POLIA ROUGE
  ('ISO-020', 5),  -- n° 21 · ISONEM MS POLIA BLANC
  ('ISO-021', 8),  -- n° 23 · ISONEM MS POLYMER ISO 383 GREY
  ('ISO-022', 2),  -- n° 24 · ISONEM MS POLYMER ISO 110 BRICK RED
  ('ISO-153', 3),  -- n° 25 · ISONEM MS FLOOR
  ('ISO-154', 2),  -- n° 26 · ISONEM MS FLOOR
  ('ISO-023', 30),  -- n° 27 · ISONEM SHINE FLOOR ISO 390 GREEN
  ('ISO-024', 2),  -- n° 28 · ISONEM SHINE FLOOR ISO 110 RED
  ('ISO-155', 8),  -- n° 29 · ISONEM SHINE FLOOR ISO GRIS
  ('ISO-026', 15),  -- n° 30 · ISONEM LIQUID GLASS
  ('ISO-025', 2),  -- n° 31 · ISONEM LIQUID GLASS
  ('ISO-029', 18),  -- n° 32 · ISONEM POOL TRANSPARENT
  ('ISO-030', 30),  -- n° 33 · ISONEM L
  ('ISO-031', 50),  -- n° 34 · ISONEM POOL PAINT BLUE
  ('ISO-032', 9),  -- n° 35 · ISONEM EP PRIMER
  ('ISO-033', 12),  -- n° 36 · ISONEM MS 80
  ('ISO-034', 8),  -- n° 37 · ISONEM ANTI MOLOTOV 850G
  ('ISO-036', 18),  -- n° 38 · ISONEM LIQUID MARBLE M10 GOLD
  ('ISO-037', 16),  -- n° 39 · ISONEM LIQUID MARBLE M01 PEARL
  ('ISO-038', 2),  -- n° 40 · ISONEM LIQUID MARBLE grey
  ('ISO-039', 5),  -- n° 41 · ISONEM LIQUID MARBLE GOLD
  ('ISO-040', 4),  -- n° 42 · ISONEM LIQUID LARBLE MERMAID
  ('ISO-041', 5),  -- n° 43 · ISONEM LIQUID MARBLE GREY
  ('ISO-042', 6),  -- n° 44 · ISONEM LIQUID MARBLE M04 BLACK
  ('ISO-043', 0),  -- n° 45 · ISONEM UNIVERSAL PRIMER
  ('ISO-044', 1),  -- n° 46 · ISONEM UNIVERSAL PRIMER
  ('ISO-045', 9),  -- n° 47 · ISONEM STREET PAINT ISO 480 RED
  ('ISO-046', 7),  -- n° 48 · ISONEM STREET PAINT ISO 3383 GREY
  ('ISO-050', 2),  -- n° 50 · ISONEM UNIVERSAL PRIMER
  ('ISO-051', 13),  -- n° 51 · ISONEM UNIVERSAL PRIMER
  ('ISO-156', 46),  -- n° 52 · ISONEM SAMPLE EP PRIMER
  ('ISO-157', 20),  -- n° 53 · ISONEM SAMPLE POOL B
  ('ISO-158', 10),  -- n° 54 · ISONEM SAMPLE SHINE FLOOR B
  ('YAL-056', 35),  -- n° 55 · SYNTHETIC ANTIRUST PAINT GREY
  ('YAL-057', 43),  -- n° 56 · SYNTHETIC ANTIRUST PAINT OXIDE RED
  ('YAL-058', 6),  -- n° 57 · SYNTHETIC ANTIRUST PAINT GREY
  ('YAL-059', 10),  -- n° 58 · SYNTHETIC ANTIRUST PAINT OXIDE RED
  ('YAL-060', 80),  -- n° 59 · SYNTHETIC PRIMER WHITE
  ('YAL-061', 50),  -- n° 60 · SYNTHETIC PRIMER WHITE
  ('YAL-062', 14),  -- n° 61 · SYNTHETIC LUX PAINT WHITE
  ('YAL-063', 15),  -- n° 62 · SYNTHETIC LUX PAINT 3020 FLAT RED
  ('YAL-064', 0),  -- n° 63 · SYNTHETIC LUX PAINT BLACK
  ('YAL-065', 10),  -- n° 64 · SYNTHETIC LUX PAINT 7016 GREY
  ('YAL-066', 20),  -- n° 65 · SYNTHETIC LUX PAINT 5005 BLUE
  ('YAL-067', 3),  -- n° 66 · SYNTHETIC LUX PAINT WHITE
  ('YAL-068', 3),  -- n° 67 · SYNTHETIC LUX PAINT 3020 FLAT RED
  ('YAL-069', 0),  -- n° 68 · SYNTHETIC LUX PAINT BLACK
  ('YAL-070', 2),  -- n° 69 · SYNTHETIC LUX PAINT 7016 GREY
  ('YAL-071', 4),  -- n° 70 · SYNTHETIC LUX PAINT 5005 BLUE
  ('YAL-072', 18),  -- n° 71 · SYNTHETIC ENAMEL PAINT WHITE
  ('YAL-073', 19),  -- n° 72 · SYNTHETIC ENAMEL PAINT 3020 FLAT RED
  ('YAL-074', 0),  -- n° 73 · SYNTHETIC ENAMEL PAINT BLACK
  ('YAL-075', 10),  -- n° 74 · SYNTHETIC ENAMEL PAINT 7016 GREY
  ('YAL-076', 15),  -- n° 75 · SYNTHETIC ENAMEL PAINT 5005 BLUE
  ('YAL-077', 5),  -- n° 76 · SYNTHETIC ENAMEL PAINT WHITE
  ('YAL-078', 5),  -- n° 77 · SYNTHETIC ENAMEL PAINT 3020 FLAT RED
  ('YAL-079', 0),  -- n° 78 · SYNTHETIC ENAMEL PAINT BLACK
  ('YAL-080', 0),  -- n° 79 · SYNTHETIC ENAMEL PAINT 7016 GREY
  ('YAL-081', 5),  -- n° 80 · SYNTHETIC ENAMEL PAINT 5005 BLUE
  ('YAL-082', 24),  -- n° 81 · PARQUET POLISH GLOSSY
  ('YAL-083', 5),  -- n° 82 · PARQUET POLISH GLOSSY
  ('YAL-084', 24),  -- n° 83 · PARQUET POLISH MATT
  ('YAL-085', 5),  -- n° 84 · PARQUET POLISH MATT
  ('YAL-086', 1),  -- n° 85 · VARNISHED WOOD PROTECTOR 9999 NATUREL
  ('YAL-087', 12),  -- n° 86 · VARNISHED WOOD PROTECTOR 2029
  ('YAL-088', 1),  -- n° 87 · VARNISHED WOOD PROTECTOR 8080
  ('YAL-089', 2),  -- n° 88 · SYNTHETIC THINNER -
  ('YAL-090', 61),  -- n° 89 · SYNTHETIC THINNER -
  ('YAL-091', 71),  -- n° 90 · SYNTHETIC THINNER -
  ('YAL-092', 25),  -- n° 91 · CELLULOSIC THINNER -
  ('YAL-093', 463),  -- n° 92 · ROULEAUX POUR PEINTURE
  ('YAL-094', 179),  -- n° 93 · AUXILIARY PRODUCTS LIBRA SHORT BRUSH NO:3
  ('YAL-095', 830),  -- n° 94 · AUXILIARY PRODUCTS JUNIOR OIL PAINT BRUSH NO:3
  ('YAL-096', 410),  -- n° 95 · AUXILIARY PRODUCTS BLACK OIL PAINT BRUSH NO:3
  ('YAL-097', 357),  -- n° 96 · AUXILIARY PRODUCTS BLACK OIL PAINT BRUSH NO:4
  ('YAL-098', 325),  -- n° 97 · AUXILIARY PRODUCTS DECORATIV BRUSH NO:70
  ('YAL-099', 456),  -- n° 98 · AUXILIARY PRODUCTS FIRST SHORT BRUSH NO:1
  ('YAL-100', 951),  -- n° 99 · AUXILIARY PRODUCTS FIRST SHORT BRUSH NO:2
  ('YAL-101', 775),  -- n° 100 · AUXILIARY PRODUCTS BLACK SHORT BRUSH NO: 1
  ('YAL-102', 510),  -- n° 101 · AUXILIARY PRODUCTS BLACK SHORT BRUSH NO: 2
  ('YAL-103', 876),  -- n° 102 · AUXILIARY PRODUCTS BLACK SHORT BRUSH NO: 3
  ('YAL-104', 867),  -- n° 103 · AUXILIARY PRODUCTS BLACK SHORT BRUSH NO: 4
  ('YAL-105', 87),  -- n° 104 · ANTI MOISTURE PAINT Y-820
  ('YAL-106', 17),  -- n° 105 · ANTI MOISTURE PAINT Y-820
  ('YAL-107', 15),  -- n° 106 · ANTI MOISTURE PAINT Y-821
  ('YAL-108', 18),  -- n° 107 · SYNTHETIC LUX BASE 1320A
  ('YAL-109', 20),  -- n° 108 · SYNTHETIC LUX BASE 1320B
  ('YAL-110', 19),  -- n° 109 · SYNTHETIC LUX BASE 1320D
  ('YAL-111', 4),  -- n° 110 · SYNTHETIC LUX BASE 1320A
  ('YAL-112', 3),  -- n° 111 · SYNTHETIC LUX BASE 1320B
  ('YAL-113', 5),  -- n° 112 · SYNTHETIC LUX BASE 1320D
  ('YAL-114', 18),  -- n° 113 · SYNTHETIC ENAMEL BASE 1330A
  ('YAL-115', 16),  -- n° 114 · SYNTHETIC ENAMEL BASE 1330B
  ('YAL-116', 12),  -- n° 115 · SYNTHETIC ENAMEL BASE 1330D
  ('YAL-117', 3),  -- n° 116 · SYNTHETIC ENAMEL BASE 1330A
  ('YAL-118', 2),  -- n° 117 · SYNTHETIC ENAMEL BASE 1330B
  ('YAL-119', 4),  -- n° 118 · SYNTHETIC ENAMEL BASE 1330D
  ('YAL-120', 10),  -- n° 119 · PEINTURE YALAZ SATINE INTERIEUR
  ('YAL-159', 8),  -- n° 120 · PEINTURE YALAZ SATINE INTERIEUR
  ('YAL-121', 9),  -- n° 121 · PEINTURE YALAZ SATINE EXTERIEUR
  ('MOL-122', 20),  -- n° 122 · COLORED PLASTER BIDON
  ('MOL-123', 38),  -- n° 123 · COLORED PLASTER BAGS
  ('MOL-124', 9),  -- n° 124 · COLORED PLASTER SEAU
  ('MOL-125', 5),  -- n° 125 · MOLUMER PL02
  ('MOL-126', 10),  -- n° 126 · MOLUMER PL05N-01
  ('MOL-127', 8),  -- n° 127 · MOLUMER PL05N-02
  ('MOL-128', 2),  -- n° 128 · MOLUMER PL07
  ('MOL-129', 2),  -- n° 129 · MOLUMER IS0 PRATIK
  ('MOL-130', 2),  -- n° 130 · MOLUMER 603
  ('MOL-131', 2),  -- n° 131 · MOLUMER SHINGLE
  ('MOL-132', 2),  -- n° 132 · MOLUMER EBRULE
  ('MOL-133', 2),  -- n° 133 · MOLUMER TENIS KORT
  ('MOL-134', 1),  -- n° 134 · MOLUMER YOLCIZGI
  ('MOL-135', 2),  -- n° 135 · MOLUMER SENTETIK SL 350
  ('MOL-136', 1),  -- n° 136 · MOLUMER SL 300
  ('MOL-137', 12),  -- n° 137 · MOLUMER PL 09
  ('PAN-138', 17),  -- n° 138 · PANTRIX SATIMAT INTERIEUR
  ('PAN-160', 5),  -- n° 139 · PANTRIX SATIMAT EXTERIEUR
  ('PAN-139', 5),  -- n° 140 · PANTRIX SATIN
  ('PAN-140', 6),  -- n° 142 · PANTRIX ISOLAZ
  ('PAN-142', 11),  -- n° 144 · PANTRIX FLAT /MATT ECO
  ('PAN-148', 3),  -- n° 147 · Pantrix Fresco Mix EXTERIEUR 2
  ('PAN-161', 6)  -- n° 148 · Pantrix Fresco Mix EXTERIEUR 3
  ;

  select string_agg(s.sku, ', ') into v_missing
  from _stock_initial s left join public.products p on p.sku = s.sku where p.id is null;
  if v_missing is not null then
    raise exception 'Références introuvables dans le catalogue : %', v_missing;
  end if;

  -- 3. Traçabilité : un mouvement par écart avec le stock actuel
  insert into public.stock_movements (product_id, type, quantity, to_location_id, reason, reference)
  select p.id, 'ajustement', s.quantity - coalesce(l.quantity, 0), v_location,
         'Stock initial — fiche de suivi de stock du showroom', 'STOCK-INITIAL-BTQ-001'
  from _stock_initial s
  join public.products p on p.sku = s.sku
  left join public.stock_levels l on l.product_id = p.id and l.location_id = v_location
  where s.quantity <> coalesce(l.quantity, 0);
  get diagnostics v_count = row_count;

  -- 4. Niveaux de stock
  insert into public.stock_levels (product_id, location_id, quantity)
  select p.id, v_location, s.quantity
  from _stock_initial s join public.products p on p.sku = s.sku
  on conflict (product_id, location_id) do update set quantity = excluded.quantity;

  raise notice 'Stock initial appliqué : % produits, % mouvements d''ajustement.', (select count(*) from _stock_initial), v_count;
end $$;

commit;

-- Contrôle : quantités du showroom par marque
select p.brand as marque, count(*) as produits, sum(l.quantity) as unites
from public.stock_levels l
join public.products p on p.id = l.product_id
join public.shops s on s.id = l.location_id and s.code = 'BTQ-001'
group by p.brand
order by p.brand;
