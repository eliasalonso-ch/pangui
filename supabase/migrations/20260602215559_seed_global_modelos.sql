-- Baseline popular models for common manufacturers (global seeds).
-- Resolves fabricante_id by name from the global seed rows (workspace_id null),
-- so it's replayable and never hardcodes generated UUIDs. Idempotent.
insert into public.modelos (fabricante_id, nombre, workspace_id)
select f.id, m.nombre, null
from (values
  -- Ford
  ('Ford','F-150'),('Ford','Ranger'),('Ford','Transit'),('Ford','F-250'),('Ford','Cargo'),('Ford','Maverick'),
  -- Chevrolet
  ('Chevrolet','Silverado'),('Chevrolet','D-Max'),('Chevrolet','NPR'),('Chevrolet','Colorado'),
  -- Toyota (vehicles)
  ('Toyota','Hilux'),('Toyota','Land Cruiser'),('Toyota','Hiace'),('Toyota','Corolla'),('Toyota','Dyna'),
  -- Nissan
  ('Nissan','Navara'),('Nissan','NP300'),('Nissan','Frontier'),
  -- Mercedes-Benz
  ('Mercedes-Benz','Sprinter'),('Mercedes-Benz','Actros'),('Mercedes-Benz','Atego'),
  -- Volkswagen
  ('Volkswagen','Amarok'),('Volkswagen','Crafter'),('Volkswagen','Delivery'),
  -- Hyundai
  ('Hyundai','HD65'),('Hyundai','HD78'),('Hyundai','Porter'),
  -- Isuzu
  ('Isuzu','NPR'),('Isuzu','NQR'),('Isuzu','FRR'),('Isuzu','D-Max'),
  -- Caterpillar (engines / gensets / equipment)
  ('Caterpillar','C9'),('Caterpillar','C15'),('Caterpillar','C18'),('Caterpillar','3406'),
  ('Caterpillar','320'),('Caterpillar','D6'),('Caterpillar','420'),
  -- Cummins
  ('Cummins','QSB6.7'),('Cummins','QSL9'),('Cummins','ISX15'),('Cummins','KTA19'),
  ('Cummins','X15'),('Cummins','6BT'),
  -- Perkins
  ('Perkins','1104'),('Perkins','1106'),('Perkins','404'),('Perkins','2206'),
  -- John Deere
  ('John Deere','4045'),('John Deere','6068'),('John Deere','5075E'),
  -- Kubota
  ('Kubota','V2403'),('Kubota','D1105'),('Kubota','V3800'),
  -- Yanmar
  ('Yanmar','4TNV98'),('Yanmar','3TNV88'),
  -- Komatsu
  ('Komatsu','PC200'),('Komatsu','PC138'),('Komatsu','D65'),('Komatsu','WA320'),
  -- WEG (motors)
  ('WEG','W22'),('WEG','W21'),('WEG','W50'),('WEG','CFW11'),('WEG','CFW500'),
  -- ABB
  ('ABB','ACS580'),('ABB','ACS880'),('ABB','M3BP'),('ABB','Tmax'),
  -- Siemens
  ('Siemens','SIMOTICS'),('Siemens','SINAMICS G120'),('Siemens','1LE1'),('Siemens','3RW'),
  -- Atlas Copco (compressors)
  ('Atlas Copco','GA37'),('Atlas Copco','GA75'),('Atlas Copco','GA90'),('Atlas Copco','XAS'),
  -- Grundfos (pumps)
  ('Grundfos','CR'),('Grundfos','CRN'),('Grundfos','SP'),('Grundfos','Magna3'),
  -- Carrier (HVAC)
  ('Carrier','30XA'),('Carrier','30RB'),('Carrier','19XR'),
  -- Daikin (HVAC)
  ('Daikin','VRV'),('Daikin','FTKM'),('Daikin','Applied'),
  -- Forklifts
  ('Toyota Material Handling','8FGCU25'),('Toyota Material Handling','8FBE'),
  ('Hyster','H50FT'),('Hyster','J30XNT')
) as m(fabricante_nombre, nombre)
join public.fabricantes f
  on f.workspace_id is null and f.nombre = m.fabricante_nombre
on conflict do nothing;;
