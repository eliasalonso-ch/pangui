-- Curated starter catalog of well-known equipment manufacturers (global seeds).
-- Idempotent: re-running does nothing thanks to the unique index + on conflict.
insert into public.fabricantes (nombre, pais, workspace_id)
select v.nombre, v.pais, null
from (values
  -- Electrical / power / automation
  ('ABB','Suiza'),('Siemens','Alemania'),('Schneider Electric','Francia'),('Eaton','Irlanda'),
  ('General Electric','Estados Unidos'),('Mitsubishi Electric','Japón'),('Rockwell Automation','Estados Unidos'),
  ('Legrand','Francia'),('Hitachi','Japón'),('Toshiba','Japón'),('Honeywell','Estados Unidos'),
  ('Emerson','Estados Unidos'),('Phoenix Contact','Alemania'),('Omron','Japón'),('Fuji Electric','Japón'),
  ('Vertiv','Estados Unidos'),('Delta Electronics','Taiwán'),('Chint','China'),('Hager','Alemania'),
  -- Motors / drives
  ('WEG','Brasil'),('Nidec','Japón'),('Baldor','Estados Unidos'),('SEW-Eurodrive','Alemania'),
  ('Lenze','Alemania'),('Yaskawa','Japón'),('Danfoss','Dinamarca'),('Bonfiglioli','Italia'),
  ('TECO','Taiwán'),('Leroy-Somer','Francia'),('Marathon','Estados Unidos'),
  -- Engines / gensets
  ('Cummins','Estados Unidos'),('Caterpillar','Estados Unidos'),('Perkins','Reino Unido'),
  ('MTU','Alemania'),('Deutz','Alemania'),('Kohler','Estados Unidos'),('Generac','Estados Unidos'),
  ('Yanmar','Japón'),('Kubota','Japón'),('John Deere','Estados Unidos'),('Volvo Penta','Suecia'),
  ('Wärtsilä','Finlandia'),('Doosan','Corea del Sur'),('FG Wilson','Reino Unido'),('Himoinsa','España'),
  ('SDMO','Francia'),('Scania','Suecia'),('MWM','Alemania'),
  -- HVAC / refrigeración
  ('Carrier','Estados Unidos'),('Trane','Irlanda'),('Daikin','Japón'),('York','Estados Unidos'),
  ('Mitsubishi Heavy Industries','Japón'),('LG','Corea del Sur'),('Samsung','Corea del Sur'),
  ('Bosch','Alemania'),('Lennox','Estados Unidos'),('Fujitsu General','Japón'),('Midea','China'),
  ('Gree','China'),('Rheem','Estados Unidos'),('Bohn','Estados Unidos'),('Bitzer','Alemania'),
  ('Copeland','Estados Unidos'),('Danfoss Cooling','Dinamarca'),('Frascold','Italia'),('Tecumseh','Francia'),
  -- Bombas / fluidos
  ('Grundfos','Dinamarca'),('KSB','Alemania'),('Wilo','Alemania'),('Xylem','Estados Unidos'),
  ('Flygt','Suecia'),('Pedrollo','Italia'),('Ebara','Japón'),('Goulds','Estados Unidos'),
  ('Franklin Electric','Estados Unidos'),('Pentair','Reino Unido'),('Sulzer','Suiza'),('Lowara','Italia'),
  ('Saer','Italia'),('DAB','Italia'),
  -- Compresores / aire
  ('Atlas Copco','Suecia'),('Ingersoll Rand','Estados Unidos'),('Kaeser','Alemania'),
  ('Sullair','Estados Unidos'),('Gardner Denver','Estados Unidos'),('Quincy','Estados Unidos'),
  ('Chicago Pneumatic','Estados Unidos'),('Schulz','Brasil'),
  -- Válvulas / instrumentación
  ('Endress+Hauser','Suiza'),('Festo','Alemania'),('SMC','Japón'),('Parker Hannifin','Estados Unidos'),
  ('Swagelok','Estados Unidos'),('Yokogawa','Japón'),('Krohne','Alemania'),('Burkert','Alemania'),
  (' Bray','Estados Unidos'),('Belimo','Suiza'),
  -- Rodamientos / transmisión
  ('SKF','Suecia'),('NSK','Japón'),('FAG','Alemania'),('Timken','Estados Unidos'),('NTN','Japón'),
  ('INA','Alemania'),('Gates','Estados Unidos'),('Rexnord','Estados Unidos'),
  -- Manejo de materiales / elevación
  ('Toyota Material Handling','Japón'),('Hyster','Estados Unidos'),('Yale','Estados Unidos'),
  ('Crown','Estados Unidos'),('Jungheinrich','Alemania'),('Linde','Alemania'),('Still','Alemania'),
  ('Konecranes','Finlandia'),('Demag','Alemania'),('Otis','Estados Unidos'),('Schindler','Suiza'),
  ('KONE','Finlandia'),('ThyssenKrupp','Alemania'),
  -- Maquinaria pesada / construcción
  ('Komatsu','Japón'),('Hitachi Construction','Japón'),('Liebherr','Suiza'),('JCB','Reino Unido'),
  ('Volvo CE','Suecia'),('Case','Estados Unidos'),('New Holland','Italia'),('Bobcat','Estados Unidos'),
  ('Doosan Infracore','Corea del Sur'),('Sany','China'),('XCMG','China'),
  -- Vehículos / automotriz
  ('Ford','Estados Unidos'),('Toyota','Japón'),('Chevrolet','Estados Unidos'),('Nissan','Japón'),
  ('Mercedes-Benz','Alemania'),('Volkswagen','Alemania'),('Hyundai','Corea del Sur'),('Kia','Corea del Sur'),
  ('Mitsubishi Motors','Japón'),('Isuzu','Japón'),('Mazda','Japón'),('Renault','Francia'),
  ('Peugeot','Francia'),('Fiat','Italia'),('Iveco','Italia'),('MAN','Alemania'),('Hino','Japón'),
  ('Freightliner','Estados Unidos'),('Kenworth','Estados Unidos'),('Volvo Trucks','Suecia'),
  -- Herramientas / equipos
  ('Makita','Japón'),('DeWalt','Estados Unidos'),('Milwaukee','Estados Unidos'),('Hilti','Liechtenstein'),
  ('Stanley','Estados Unidos'),('Stihl','Alemania'),('Husqvarna','Suecia'),('Metabo','Alemania'),
  -- Soldadura
  ('Lincoln Electric','Estados Unidos'),('Miller','Estados Unidos'),('ESAB','Suecia'),('Fronius','Austria'),
  ('Kemppi','Finlandia'),
  -- UPS / energía / baterías
  ('APC','Estados Unidos'),('Eaton Power','Irlanda'),('Schneider UPS','Francia'),('Trojan','Estados Unidos'),
  ('Victron Energy','Países Bajos'),('SMA','Alemania'),('Fronius Solar','Austria'),('Huawei','China'),
  ('Sungrow','China'),('Enphase','Estados Unidos'),('Tesla','Estados Unidos'),('LG Energy','Corea del Sur'),
  -- TI / redes / impresión
  ('Dell','Estados Unidos'),('HP','Estados Unidos'),('Lenovo','China'),('Cisco','Estados Unidos'),
  ('Apple','Estados Unidos'),('Epson','Japón'),('Canon','Japón'),('Brother','Japón'),('Xerox','Estados Unidos'),
  ('Zebra','Estados Unidos'),('Ubiquiti','Estados Unidos'),('TP-Link','China'),('Aruba','Estados Unidos'),
  -- Procesamiento de alimentos / packaging
  ('GEA','Alemania'),('Alfa Laval','Suecia'),('Tetra Pak','Suecia'),('Krones','Alemania'),('Bühler','Suiza'),
  ('SPX Flow','Estados Unidos'),
  -- Seguridad / incendios
  ('Tyco','Irlanda'),('Notifier','Estados Unidos'),('Bosch Security','Alemania'),('Hochiki','Japón'),
  ('Hikvision','China'),('Dahua','China'),('Axis','Suecia')
) as v(nombre, pais)
on conflict do nothing;;
