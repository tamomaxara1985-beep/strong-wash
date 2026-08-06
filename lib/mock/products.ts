import { l } from "../localized";
import type { Product, ProductSpec, StockStatus } from "../types";
import { getBrandById } from "./brands";
import { getCategoryById, getEffectiveSpecSchema } from "./categories";

type SpecValue = number | string | boolean;

type Draft = {
  sku: string;
  slug: string;
  name: [string, string, string];
  short: [string, string, string];
  brand: string;
  category: string;
  price: number;
  salePrice?: number;
  stock: number;
  /**
   * Capital equipment is built to order rather than held on a shelf, so large
   * installations carry a lead time instead of a stock count.
   */
  leadTime?: boolean;
  image: string;
  featured?: boolean;
  createdAt: string;
  specs: Record<string, SpecValue>;
};

function deriveStockStatus(stock: number, leadTime?: boolean): StockStatus {
  if (leadTime) return "preorder";
  if (stock <= 0) return "out";
  if (stock <= 3) return "low";
  return "in_stock";
}

/**
 * Converts a plain `{key: value}` record into typed ProductSpec entries, using
 * the category's effective schema to decide which field the value belongs in.
 * Throws on an unknown key so a fixture typo fails loudly rather than silently
 * disappearing from the facets.
 */
function toSpecs(categoryId: string, input: Record<string, SpecValue>): ProductSpec[] {
  const category = getCategoryById(categoryId);
  if (!category) throw new Error(`Unknown category: ${categoryId}`);
  const schema = getEffectiveSpecSchema(category);
  const byKey = new Map(schema.map((s) => [s.key, s]));

  return Object.entries(input).map(([key, value]) => {
    const def = byKey.get(key);
    if (!def) {
      throw new Error(`Spec "${key}" is not in the schema for "${category.slug}"`);
    }
    switch (def.type) {
      case "number":
        return { key, valueNumber: Number(value) };
      case "bool":
        return { key, valueBool: Boolean(value) };
      case "enum": {
        const str = String(value);
        const allowed = def.options?.some((o) => o.value === str);
        if (!allowed) {
          throw new Error(`Spec "${key}" has no option "${str}" in "${category.slug}"`);
        }
        return { key, valueString: str };
      }
    }
  });
}

function build(draft: Draft): Product {
  const category = getCategoryById(draft.category);
  if (!category) throw new Error(`Unknown category: ${draft.category}`);
  const brand = getBrandById(draft.brand);
  if (!brand) throw new Error(`Unknown brand: ${draft.brand}`);

  const [nameKa, nameEn, nameRu] = draft.name;
  const [shortKa, shortEn, shortRu] = draft.short;

  return {
    id: `prod_${draft.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sku: draft.sku,
    slug: draft.slug,
    name: l(nameKa, nameEn, nameRu),
    shortDescription: l(shortKa, shortEn, shortRu),
    // Phase 1 composes long copy from the short description. Real per-product
    // copy is entered through the admin panel in Phase 4.
    description: l(
      `${shortKa}\n\n${nameKa} — ${brand.name}-ის აღჭურვილობა. სრული ტექნიკური მახასიათებლები იხილეთ ქვემოთ მოცემულ ცხრილში. მონტაჟი და გაშვება შედის მიწოდების პირობებში.`,
      `${shortEn}\n\n${nameEn} by ${brand.name}. Full technical specifications are listed in the table below. Installation and commissioning are included in the scope of supply.`,
      `${shortRu}\n\n${nameRu} от ${brand.name}. Полные технические характеристики — в таблице ниже. Монтаж и пусконаладка входят в объём поставки.`,
    ),
    brand: draft.brand,
    category: draft.category,
    categoryAncestors: [...category.ancestors, category.id],
    price: draft.price,
    salePrice: draft.salePrice ?? null,
    currency: "GEL",
    stock: draft.stock,
    stockStatus: deriveStockStatus(draft.stock, draft.leadTime),
    images: [1, 2, 3].map((n) => ({
      url: `/placeholders/${draft.image}-${n}.svg`,
      alt: l(nameKa, nameEn, nameRu),
      order: n,
    })),
    specs: toSpecs(draft.category, draft.specs),
    isActive: true,
    isFeatured: Boolean(draft.featured),
    createdAt: draft.createdAt,
  };
}

const drafts: Draft[] = [
  // ------------------------------------------------------ rollover machines
  {
    sku: "WT-SL2-CLASSIC", slug: "washtec-softline-2-classic", brand: "br_washtec", category: "cat_auto_rollover",
    name: ["WashTec SoftLine 2 Classic", "WashTec SoftLine 2 Classic", "WashTec SoftLine 2 Classic"],
    short: [
      "პორტალური მრეცხავი რბილი ჯაგრისებით — საბაზისო კონფიგურაცია ავტოგასამართი სადგურისთვის.",
      "Soft-touch rollover gantry in a base configuration, sized for a fuel-station bay.",
      "Портальная мойка с мягкими щётками в базовой конфигурации для АЗС.",
    ],
    price: 118000, stock: 0, leadTime: true, image: "gantry", featured: true, createdAt: "2026-04-18",
    specs: { throughput: 18, vehicleHeightMax: 2300, vehicleWidthMax: 2300, powerRequirement: 12, waterPerCar: 160, dryerIncluded: false, waterRecycling: true, washMedium: "brush", brushCount: 3 },
  },
  {
    sku: "WT-SL2-PREMIUM", slug: "washtec-softline-2-premium", brand: "br_washtec", category: "cat_auto_rollover",
    name: ["WashTec SoftLine 2 Premium", "WashTec SoftLine 2 Premium", "WashTec SoftLine 2 Premium"],
    short: [
      "სრული კომპლექტაცია საშრობით, ცვილის ეტაპითა და დისკების ცალკე რეცხვით.",
      "Full specification with dryer, wax stage and dedicated wheel-washing.",
      "Полная комплектация с сушкой, восковой стадией и отдельной мойкой дисков.",
    ],
    price: 168000, stock: 0, leadTime: true, image: "gantry", featured: true, createdAt: "2026-05-06",
    specs: { throughput: 22, vehicleHeightMax: 2400, vehicleWidthMax: 2350, powerRequirement: 21, waterPerCar: 150, dryerIncluded: true, waterRecycling: true, washMedium: "brush", brushCount: 5 },
  },
  {
    sku: "IST-M22", slug: "istobal-m22-rollover", brand: "br_istobal", category: "cat_auto_rollover",
    name: ["Istobal M'22", "Istobal M'22", "Istobal M'22"],
    short: [
      "კომპაქტური პორტალი მცირე ბოქსისთვის — 2.2 მ სიმაღლის ჭერის შემთხვევაშიც.",
      "Compact gantry that fits bays with ceilings as low as 2.2 m.",
      "Компактный портал для боксов с потолком от 2,2 м.",
    ],
    price: 96000, stock: 0, leadTime: true, image: "gantry", createdAt: "2026-02-24",
    specs: { throughput: 16, vehicleHeightMax: 2150, vehicleWidthMax: 2250, powerRequirement: 10, waterPerCar: 170, dryerIncluded: false, waterRecycling: false, washMedium: "brush", brushCount: 3 },
  },
  {
    sku: "CHR-VARIO-TT", slug: "christ-vario-touchless", brand: "br_christ", category: "cat_auto_rollover",
    name: ["Christ Vario Touchless", "Christ Vario Touchless", "Christ Vario Touchless"],
    short: [
      "შეხებისგარეშე პორტალი — არ ეხება საღებავს, შესაფერისია პრემიუმ ავტომობილებისთვის.",
      "Touch-free gantry that never contacts the paint — suited to premium vehicles.",
      "Бесконтактный портал, не касающийся ЛКП — для премиальных автомобилей.",
    ],
    price: 142000, stock: 0, leadTime: true, image: "gantry", createdAt: "2026-03-11",
    specs: { throughput: 14, vehicleHeightMax: 2300, vehicleWidthMax: 2300, powerRequirement: 26, waterPerCar: 210, dryerIncluded: true, waterRecycling: true, washMedium: "touchless" },
  },
  {
    sku: "TAM-TRIO-H", slug: "tammermatic-trio-hybrid", brand: "br_tammermatic", category: "cat_auto_rollover",
    name: ["Tammermatic Trio Hybrid", "Tammermatic Trio Hybrid", "Tammermatic Trio Hybrid"],
    short: [
      "ჰიბრიდული პორტალი — შეხებისგარეშე წინასწარი რეცხვა და შემდეგ რბილი ჯაგრისები.",
      "Hybrid gantry: touch-free pre-wash followed by soft-brush contact stages.",
      "Гибридный портал: бесконтактная предмойка и затем мягкие щётки.",
    ],
    price: 154000, stock: 0, leadTime: true, image: "gantry", createdAt: "2026-05-28",
    specs: { throughput: 20, vehicleHeightMax: 2400, vehicleWidthMax: 2350, powerRequirement: 24, waterPerCar: 165, dryerIncluded: true, waterRecycling: true, washMedium: "hybrid", brushCount: 4 },
  },

  // ------------------------------------------------------- tunnel systems
  {
    sku: "WT-TL-12", slug: "washtec-tunnel-12", brand: "br_washtec", category: "cat_auto_tunnel",
    name: ["WashTec TunnelLine 12", "WashTec TunnelLine 12", "WashTec TunnelLine 12"],
    short: [
      "12-მეტრიანი კონვეიერული ხაზი — საათში 60-მდე ავტომობილი.",
      "A 12 m conveyor line handling up to 60 vehicles an hour.",
      "12-метровая конвейерная линия до 60 автомобилей в час.",
    ],
    price: 395000, stock: 0, leadTime: true, image: "tunnel", featured: true, createdAt: "2026-05-20",
    specs: { throughput: 60, vehicleHeightMax: 2400, vehicleWidthMax: 2350, powerRequirement: 58, waterPerCar: 120, dryerIncluded: true, waterRecycling: true, conveyorLength: 12, stationCount: 7 },
  },
  {
    sku: "IST-T24", slug: "istobal-tunnel-24", brand: "br_istobal", category: "cat_auto_tunnel",
    name: ["Istobal Tunnel 24", "Istobal Tunnel 24", "Istobal Tunnel 24"],
    short: [
      "24-მეტრიანი ხაზი მაღალი ნაკადის ობიექტისთვის — საათში 100 ავტომობილამდე.",
      "A 24 m line for high-volume sites, up to 100 vehicles an hour.",
      "24-метровая линия для высокой загрузки — до 100 автомобилей в час.",
    ],
    price: 720000, stock: 0, leadTime: true, image: "tunnel", createdAt: "2026-06-02",
    specs: { throughput: 100, vehicleHeightMax: 2500, vehicleWidthMax: 2400, powerRequirement: 96, waterPerCar: 105, dryerIncluded: true, waterRecycling: true, conveyorLength: 24, stationCount: 12 },
  },
  {
    sku: "CHR-TUN-18", slug: "christ-tunnel-18", brand: "br_christ", category: "cat_auto_tunnel",
    name: ["Christ Tunnel 18", "Christ Tunnel 18", "Christ Tunnel 18"],
    short: [
      "18-მეტრიანი მოდულური გვირაბი — ეტაპების კონფიგურაცია ობიექტის მიხედვით.",
      "An 18 m modular tunnel with stages configured to the site.",
      "18-метровый модульный туннель с настраиваемыми постами.",
    ],
    price: 540000, stock: 0, leadTime: true, image: "tunnel", createdAt: "2026-04-04",
    specs: { throughput: 80, vehicleHeightMax: 2450, vehicleWidthMax: 2400, powerRequirement: 74, waterPerCar: 112, dryerIncluded: true, waterRecycling: true, conveyorLength: 18, stationCount: 9 },
  },

  // ------------------------------------------------------ truck & bus wash
  {
    sku: "IST-HW-TRUCK", slug: "istobal-heavy-truck-gantry", brand: "br_istobal", category: "cat_auto_bus",
    name: ["Istobal HW'Truck", "Istobal HW'Truck", "Istobal HW'Truck"],
    short: [
      "სატვირთოებისა და ავტობუსების პორტალი — 4.2 მ სიმაღლემდე ტექნიკისთვის.",
      "Gantry for trucks and buses, for vehicles up to 4.2 m tall.",
      "Портал для грузовиков и автобусов высотой до 4,2 м.",
    ],
    price: 268000, stock: 0, leadTime: true, image: "gantry", createdAt: "2026-03-28",
    specs: { throughput: 10, vehicleHeightMax: 4200, vehicleWidthMax: 2600, powerRequirement: 34, waterPerCar: 420, dryerIncluded: false, waterRecycling: true, vehicleLengthMax: 18 },
  },
  {
    sku: "TAM-BUS-P", slug: "tammermatic-bus-portal", brand: "br_tammermatic", category: "cat_auto_bus",
    name: ["Tammermatic Bus Portal", "Tammermatic Bus Portal", "Tammermatic Bus Portal"],
    short: [
      "ავტობუსების პარკისთვის — გვერდითი და წინა ჯაგრისები, ღამის ავტომატური რეჟიმი.",
      "Built for bus depots: side and front brushes with unattended night operation.",
      "Для автобусных парков: боковые и фронтальные щётки, автоматический ночной режим.",
    ],
    price: 312000, stock: 0, leadTime: true, image: "gantry", createdAt: "2026-05-14",
    specs: { throughput: 12, vehicleHeightMax: 4000, vehicleWidthMax: 2600, powerRequirement: 38, waterPerCar: 380, dryerIncluded: false, waterRecycling: true, vehicleLengthMax: 15 },
  },

  // ----------------------------------------------------------- wash bays
  {
    sku: "EHR-SB-2", slug: "ehrle-selfbay-2", brand: "br_ehrle", category: "cat_ss_bays",
    name: ["Ehrle SelfBay 2", "Ehrle SelfBay 2", "Ehrle SelfBay 2"],
    short: [
      "ორბოქსიანი თვითმომსახურების ტექნიკური ბლოკი — ცხელი წყალი და 6 პროგრამა.",
      "Two-bay self-service technical unit with hot water and six programmes.",
      "Двухбоксовый технический блок самообслуживания: горячая вода и 6 программ.",
    ],
    price: 46000, stock: 0, leadTime: true, image: "bay", featured: true, createdAt: "2026-04-10",
    specs: { bayCount: 2, programCount: 6, heatedWater: true, pressure: 100, flowRate: 900 },
  },
  {
    sku: "EHR-SB-4", slug: "ehrle-selfbay-4", brand: "br_ehrle", category: "cat_ss_bays",
    name: ["Ehrle SelfBay 4", "Ehrle SelfBay 4", "Ehrle SelfBay 4"],
    short: [
      "ოთხბოქსიანი კონფიგურაცია — საერთო ტუმბოს ჯგუფი და ცენტრალური ქიმიის მიწოდება.",
      "Four-bay configuration with a shared pump group and central chemical feed.",
      "Четырёхбоксовая конфигурация с общей насосной группой и центральной подачей химии.",
    ],
    price: 82000, stock: 0, leadTime: true, image: "bay", createdAt: "2026-05-02",
    specs: { bayCount: 4, programCount: 8, heatedWater: true, pressure: 110, flowRate: 1800 },
  },
  {
    sku: "AQ-SS-6", slug: "aquarama-selfservice-6", brand: "br_aquarama", category: "cat_ss_bays",
    name: ["Aquarama Self 6", "Aquarama Self 6", "Aquarama Self 6"],
    short: [
      "ექვსბოქსიანი სადგური — ცივი წყალი, ეკონომიური კონფიგურაცია რეგიონული ობიექტისთვის.",
      "Six-bay cold-water station: the economical configuration for regional sites.",
      "Шестибоксовая станция на холодной воде — экономичный вариант для регионов.",
    ],
    price: 74000, stock: 0, leadTime: true, image: "bay", createdAt: "2026-01-22",
    specs: { bayCount: 6, programCount: 5, heatedWater: false, pressure: 90, flowRate: 2400 },
  },

  // ---------------------------------------------------- payment terminals
  {
    sku: "UNI-PAY-CC", slug: "unitec-paycard-terminal", brand: "br_unitec", category: "cat_ss_payment",
    name: ["Unitec PayCard Terminal", "Unitec PayCard Terminal", "Unitec PayCard Terminal"],
    short: [
      "უნაღდო ტერმინალი ბარათითა და მობილურით გადახდისთვის, 4 ბოქსამდე.",
      "Cashless terminal accepting card and mobile payment for up to four bays.",
      "Безналичный терминал с оплатой картой и телефоном, до 4 боксов.",
    ],
    price: 9800, salePrice: 8900, stock: 4, image: "terminal", featured: true, createdAt: "2026-05-25",
    specs: { bayCount: 4, programCount: 8, heatedWater: false, paymentTypes: "card", cashless: true },
  },
  {
    sku: "UNI-PAY-COIN", slug: "unitec-coin-terminal", brand: "br_unitec", category: "cat_ss_payment",
    name: ["Unitec Coin Terminal", "Unitec Coin Terminal", "Unitec Coin Terminal"],
    short: [
      "მონეტისა და ჟეტონის მიმღები — მარტივი გადაწყვეტა არსებული ბოქსის მოდერნიზაციისთვის.",
      "Coin and token acceptor — the simple way to retrofit an existing bay.",
      "Приём монет и жетонов — простое решение для модернизации существующего бокса.",
    ],
    price: 5400, stock: 7, image: "terminal", createdAt: "2026-02-06",
    specs: { bayCount: 2, programCount: 6, heatedWater: false, paymentTypes: "coin", cashless: false },
  },
  {
    sku: "WT-PAY-APP", slug: "washtec-app-terminal", brand: "br_washtec", category: "cat_ss_payment",
    name: ["WashTec App Terminal", "WashTec App Terminal", "WashTec App Terminal"],
    short: [
      "მობილური აპლიკაციით გადახდა და აბონემენტების მართვა — ლოიალობის პროგრამისთვის.",
      "Mobile-app payment with subscription management, for loyalty programmes.",
      "Оплата через мобильное приложение и управление подписками для программ лояльности.",
    ],
    price: 12400, stock: 2, image: "terminal", createdAt: "2026-06-04",
    specs: { bayCount: 6, programCount: 10, heatedWater: false, paymentTypes: "app", cashless: true },
  },

  // ------------------------------------------------ high-pressure washers
  {
    sku: "KAR-HD-9-50-4", slug: "karcher-hd-9-50-4-cage", brand: "br_karcher", category: "cat_hp",
    name: ["Kärcher HD 9/50-4 Cage", "Kärcher HD 9/50-4 Cage", "Kärcher HD 9/50-4 Cage"],
    short: [
      "500 ბარი წნევის ცივი აპარატი — ურთულესი დაბინძურებისა და ბეტონის გასუფთავებისთვის.",
      "A 500 bar cold-water unit for the heaviest soiling and concrete cleaning.",
      "Аппарат холодной воды на 500 бар для самых тяжёлых загрязнений и бетона.",
    ],
    price: 21400, stock: 2, image: "pressure", createdAt: "2026-03-16",
    specs: { pressure: 500, flowRate: 900, power: 9.2, waterTemp: "cold", voltage: "400v", mounting: "mobile", inductionMotor: true },
  },
  {
    sku: "KAR-HDS-10-20", slug: "karcher-hds-10-20-4m", brand: "br_karcher", category: "cat_hp",
    name: ["Kärcher HDS 10/20-4 M", "Kärcher HDS 10/20-4 M", "Kärcher HDS 10/20-4 M"],
    short: [
      "ცხელი წყლის აპარატი 200 ბარამდე — ცხიმისა და ზეთის მოსაშორებლად.",
      "Hot-water machine up to 200 bar, for grease and oil removal.",
      "Аппарат горячей воды до 200 бар для удаления жира и масла.",
    ],
    price: 16900, salePrice: 15200, stock: 5, image: "pressure", featured: true, createdAt: "2026-04-22",
    specs: { pressure: 200, flowRate: 1000, power: 7.8, waterTemp: "hot", voltage: "400v", mounting: "mobile", inductionMotor: true },
  },
  {
    sku: "EHR-HD-1140", slug: "ehrle-hd-1140-wall", brand: "br_ehrle", category: "cat_hp",
    name: ["Ehrle HD 1140 Wall", "Ehrle HD 1140 Wall", "Ehrle HD 1140 Wall"],
    short: [
      "კედელზე დასამონტაჟებელი სტაციონარული აპარატი — ბოქსში ადგილს არ იკავებს.",
      "Wall-mounted stationary unit that takes no floor space in the bay.",
      "Настенный стационарный аппарат, не занимающий место в боксе.",
    ],
    price: 11800, stock: 6, image: "pressure", createdAt: "2026-01-14",
    specs: { pressure: 140, flowRate: 1100, power: 5.5, waterTemp: "cold", voltage: "400v", mounting: "wall", inductionMotor: true },
  },
  {
    sku: "NIL-MH-5M", slug: "nilfisk-mh-5m-hot", brand: "br_nilfisk", category: "cat_hp",
    name: ["Nilfisk MH 5M Hot", "Nilfisk MH 5M Hot", "Nilfisk MH 5M Hot"],
    short: [
      "მობილური ცხელი წყლის აპარატი დიზელის გამათბობელით — გარე ობიექტებისთვის.",
      "Mobile hot-water machine with a diesel burner, for outdoor sites.",
      "Мобильный аппарат горячей воды с дизельной горелкой для наружных объектов.",
    ],
    price: 14600, stock: 3, image: "pressure", createdAt: "2026-02-18",
    specs: { pressure: 180, flowRate: 960, power: 6.4, waterTemp: "hot", voltage: "400v", mounting: "mobile", inductionMotor: true },
  },
  {
    sku: "COM-KS-1450", slug: "comet-ks-1450-classic", brand: "br_comet", category: "cat_hp",
    name: ["Comet KS 1450 Classic", "Comet KS 1450 Classic", "Comet KS 1450 Classic"],
    short: [
      "საბაზისო პროფესიონალური აპარატი 150 ბარით — ყოველდღიური მუშაობისთვის.",
      "Entry professional 150 bar machine for everyday duty.",
      "Базовый профессиональный аппарат на 150 бар для ежедневной работы.",
    ],
    price: 4900, salePrice: 4400, stock: 12, image: "pressure", createdAt: "2025-11-26",
    specs: { pressure: 150, flowRate: 780, power: 4.2, waterTemp: "cold", voltage: "400v", mounting: "mobile", inductionMotor: true },
  },
  {
    sku: "AR-BLUE-1750", slug: "ar-blue-clean-1750", brand: "br_ar", category: "cat_hp",
    name: ["AR Blue Clean 1750", "AR Blue Clean 1750", "AR Blue Clean 1750"],
    short: [
      "კომპაქტური ერთფაზიანი აპარატი — მცირე სერვისისა და დეტეილინგისთვის.",
      "Compact single-phase unit for small workshops and detailing.",
      "Компактный однофазный аппарат для небольших сервисов и детейлинга.",
    ],
    price: 2200, stock: 18, image: "pressure", createdAt: "2025-10-08",
    specs: { pressure: 130, flowRate: 540, power: 2.5, waterTemp: "cold", voltage: "230v", mounting: "mobile", inductionMotor: false },
  },
  {
    sku: "IPG-STAT-200", slug: "interpump-stationary-200", brand: "br_interpump", category: "cat_hp",
    name: ["Interpump Station 200", "Interpump Station 200", "Interpump Station 200"],
    short: [
      "სტაციონარული ტუმბოს ჯგუფი მრავალბოქსიანი სამრეცხაოსთვის — ცენტრალიზებული წნევა.",
      "Stationary pump group delivering central pressure to a multi-bay site.",
      "Стационарная насосная группа с централизованным давлением для многобоксовой мойки.",
    ],
    price: 18700, stock: 0, leadTime: true, image: "pressure", createdAt: "2026-05-11",
    specs: { pressure: 200, flowRate: 2400, power: 15, waterTemp: "cold", voltage: "400v", mounting: "stationary", inductionMotor: true },
  },

  // ------------------------------------------------------ vacuum stations
  {
    sku: "AQ-VAC-2M", slug: "aquarama-vac-station-2", brand: "br_aquarama", category: "cat_vac",
    name: ["Aquarama Vac Station 2", "Aquarama Vac Station 2", "Aquarama Vac Station 2"],
    short: [
      "ორძრავიანი მონეტით მომუშავე მტვერსასრუტი — ორი შლანგი, ერთდროული მომსახურება.",
      "Two-motor coin-operated vacuum with twin hoses for simultaneous use.",
      "Двухмоторный пылесос с оплатой монетами и двумя шлангами.",
    ],
    price: 4600, stock: 8, image: "vacuum", featured: true, createdAt: "2026-04-14",
    specs: { power: 2400, motorCount: 2, tankVolume: 80, hoseCount: 2, coinOperated: true },
  },
  {
    sku: "AQ-VAC-3M", slug: "aquarama-vac-station-3", brand: "br_aquarama", category: "cat_vac",
    name: ["Aquarama Vac Station 3", "Aquarama Vac Station 3", "Aquarama Vac Station 3"],
    short: [
      "სამძრავიანი სადგური მაღალი დატვირთვისთვის — გაზრდილი ავზი და უნაღდო გადახდა.",
      "Three-motor station for busy sites, with a larger tank and cashless payment.",
      "Трёхмоторная станция для высокой загрузки, увеличенный бак и безналичная оплата.",
    ],
    price: 6800, stock: 3, image: "vacuum", createdAt: "2026-05-30",
    specs: { power: 3600, motorCount: 3, tankVolume: 120, hoseCount: 3, coinOperated: true },
  },
  {
    sku: "NIL-EXT-45", slug: "nilfisk-extractor-45", brand: "br_nilfisk", category: "cat_vac",
    name: ["Nilfisk Extractor 45", "Nilfisk Extractor 45", "Nilfisk Extractor 45"],
    short: [
      "სალონის ქიმწმენდის ექსტრაქტორი — სავარძლებისა და ხალიჩების სველი წმენდისთვის.",
      "Upholstery extractor for wet-cleaning seats and carpets.",
      "Экстрактор для влажной чистки сидений и ковров салона.",
    ],
    price: 5900, salePrice: 5300, stock: 4, image: "vacuum", createdAt: "2026-03-04",
    specs: { power: 1800, motorCount: 2, tankVolume: 45, hoseCount: 1, coinOperated: false },
  },
  {
    sku: "KAR-NT-75", slug: "karcher-nt-75-tact", brand: "br_karcher", category: "cat_vac",
    name: ["Kärcher NT 75/2 Tact", "Kärcher NT 75/2 Tact", "Kärcher NT 75/2 Tact"],
    short: [
      "სველი და მშრალი მტვერსასრუტი ავტომატური ფილტრის გაწმენდით — სერვისის ზონისთვის.",
      "Wet-and-dry vacuum with automatic filter cleaning, for the service area.",
      "Пылесос для сухой и влажной уборки с автоочисткой фильтра для сервисной зоны.",
    ],
    price: 3400, stock: 9, image: "vacuum", createdAt: "2026-01-30",
    specs: { power: 2400, motorCount: 2, tankVolume: 75, hoseCount: 1, coinOperated: false },
  },

  // ------------------------------------------------------ water treatment
  {
    sku: "AQ-REC-3000", slug: "aquarama-reclaim-3000", brand: "br_aquarama", category: "cat_water",
    name: ["Aquarama Reclaim 3000", "Aquarama Reclaim 3000", "Aquarama Reclaim 3000"],
    short: [
      "წყლის რეციკლირების სისტემა — 85%-მდე წყლის დაბრუნება, ხარჯების მკვეთრი შემცირება.",
      "Reclamation system recovering up to 85% of process water, cutting running costs sharply.",
      "Система рециклинга с возвратом до 85% воды и резким снижением расходов.",
    ],
    price: 58000, stock: 0, leadTime: true, image: "water", featured: true, createdAt: "2026-04-26",
    specs: { treatmentType: "recycling", capacity: 3000, recoveryRate: 85, footprint: 9 },
  },
  {
    sku: "AQ-OSM-600", slug: "aquarama-osmosis-600", brand: "br_aquarama", category: "cat_water",
    name: ["Aquarama Osmosis 600", "Aquarama Osmosis 600", "Aquarama Osmosis 600"],
    short: [
      "შებრუნებული ოსმოსი ბოლო შლისთვის — ლაქების გარეშე შრობა დემინერალიზებული წყლით.",
      "Reverse osmosis for the final rinse: spot-free drying with demineralised water.",
      "Обратный осмос для финального ополаскивания: сушка без разводов деминерализованной водой.",
    ],
    price: 24500, stock: 0, leadTime: true, image: "water", createdAt: "2026-02-12",
    specs: { treatmentType: "osmosis", capacity: 600, recoveryRate: 60, footprint: 3 },
  },
  {
    sku: "AQ-SEP-10", slug: "aquarama-separator-10", brand: "br_aquarama", category: "cat_water",
    name: ["Aquarama Separator 10", "Aquarama Separator 10", "Aquarama Separator 10"],
    short: [
      "ნავთობდამჭერი და ლამის ავზი — გარემოსდაცვითი ნორმებთან შესაბამისობისთვის.",
      "Oil separator and sludge trap for environmental compliance.",
      "Нефтеуловитель и шламоотстойник для соответствия экологическим нормам.",
    ],
    price: 16400, stock: 0, leadTime: true, image: "water", createdAt: "2025-12-16",
    specs: { treatmentType: "separator", capacity: 10000, recoveryRate: 0, footprint: 12 },
  },
  {
    sku: "AQ-SOFT-2", slug: "aquarama-softener-2", brand: "br_aquarama", category: "cat_water",
    name: ["Aquarama Softener 2", "Aquarama Softener 2", "Aquarama Softener 2"],
    short: [
      "წყლის დამარბილებელი — იცავს ტუმბოებსა და ფორსუნკებს ხარისხისგან.",
      "Water softener that protects pumps and nozzles from limescale.",
      "Умягчитель воды, защищающий насосы и форсунки от накипи.",
    ],
    price: 7200, stock: 2, image: "water", createdAt: "2026-01-06",
    specs: { treatmentType: "softener", capacity: 1500, recoveryRate: 0, footprint: 1 },
  },

  // ----------------------------------------------------------- chemicals
  {
    sku: "KOC-AF-25", slug: "koch-active-foam-25l", brand: "br_koch", category: "cat_chem",
    name: ["Koch-Chemie Active Foam 25 ლ", "Koch-Chemie Active Foam 25 L", "Koch-Chemie Active Foam 25 л"],
    short: [
      "აქტიური ქაფის კონცენტრატი შეხებისგარეშე რეცხვისთვის — მაღალი მოცულობის ქაფი.",
      "Active foam concentrate for touch-free washing, with high foam volume.",
      "Концентрат активной пены для бесконтактной мойки с высоким пенообразованием.",
    ],
    price: 340, stock: 26, image: "chemical", featured: true, createdAt: "2026-05-16",
    specs: { chemType: "foam", suitableFor: "touchless", volume: 25, dilution: 40, phValue: 12.5, concentrate: true },
  },
  {
    sku: "KOC-PRE-25", slug: "koch-prewash-25l", brand: "br_koch", category: "cat_chem",
    name: ["Koch-Chemie Pre-Wash 25 ლ", "Koch-Chemie Pre-Wash 25 L", "Koch-Chemie Pre-Wash 25 л"],
    short: [
      "ტუტოვანი წინასწარი რეცხვის საშუალება — მწერებისა და საგზაო ჭუჭყის მოსაშორებლად.",
      "Alkaline pre-wash that lifts insects and road film before the main stage.",
      "Щелочная предмойка для удаления насекомых и дорожной плёнки.",
    ],
    price: 295, salePrice: 259, stock: 31, image: "chemical", createdAt: "2026-03-08",
    specs: { chemType: "prewash", suitableFor: "any", volume: 25, dilution: 30, phValue: 13, concentrate: true },
  },
  {
    sku: "NER-SH-20", slug: "nerta-shampoo-20l", brand: "br_nerta", category: "cat_chem",
    name: ["Nerta Brush Shampoo 20 ლ", "Nerta Brush Shampoo 20 L", "Nerta Brush Shampoo 20 л"],
    short: [
      "ჯაგრისიანი პორტალის შამპუნი — მაღალი საპოხი თვისება, ჯაგრისს იცავს.",
      "Shampoo for brush gantries: high lubricity that protects the brush material.",
      "Шампунь для щёточных порталов с высокой смазывающей способностью.",
    ],
    price: 210, stock: 34, image: "chemical", createdAt: "2026-02-02",
    specs: { chemType: "shampoo", suitableFor: "brush", volume: 20, dilution: 100, phValue: 9, concentrate: true },
  },
  {
    sku: "NER-WAX-20", slug: "nerta-hot-wax-20l", brand: "br_nerta", category: "cat_chem",
    name: ["Nerta Hot Wax 20 ლ", "Nerta Hot Wax 20 L", "Nerta Hot Wax 20 л"],
    short: [
      "ცხელი ცვილი — წყალს განზიდავს და შრობას აჩქარებს.",
      "Hot wax that beads water and speeds up the drying stage.",
      "Горячий воск, отталкивающий воду и ускоряющий сушку.",
    ],
    price: 245, stock: 22, image: "chemical", createdAt: "2026-04-02",
    specs: { chemType: "wax", suitableFor: "any", volume: 20, dilution: 200, phValue: 4, concentrate: true },
  },
  {
    sku: "SON-WHEEL-25", slug: "sonax-wheel-cleaner-25l", brand: "br_sonax", category: "cat_chem",
    name: ["Sonax Wheel Cleaner 25 ლ", "Sonax Wheel Cleaner 25 L", "Sonax Wheel Cleaner 25 л"],
    short: [
      "დისკების საწმენდი — სამუხრუჭე მტვერსა და ჩამწვარ ჭუჭყს ხსნის.",
      "Wheel cleaner that dissolves brake dust and baked-on grime.",
      "Очиститель дисков, растворяющий тормозную пыль и въевшуюся грязь.",
    ],
    price: 315, stock: 17, image: "chemical", createdAt: "2026-01-18",
    specs: { chemType: "wheel", suitableFor: "any", volume: 25, dilution: 10, phValue: 2, concentrate: true },
  },
  {
    sku: "SON-DRY-20", slug: "sonax-drying-aid-20l", brand: "br_sonax", category: "cat_chem",
    name: ["Sonax Drying Aid 20 ლ", "Sonax Drying Aid 20 L", "Sonax Drying Aid 20 л"],
    short: [
      "შრობის დამხმარე — წყალს ფენად კრავს და საშრობის ეფექტურობას ზრდის.",
      "Drying aid that sheets water off the panel and improves dryer performance.",
      "Средство для сушки, собирающее воду в пленку и повышающее эффективность обдува.",
    ],
    price: 268, salePrice: 232, stock: 19, image: "chemical", createdAt: "2026-05-08",
    specs: { chemType: "dryingaid", suitableFor: "any", volume: 20, dilution: 400, phValue: 3.5, concentrate: true },
  },
  {
    sku: "KOC-INT-10", slug: "koch-interior-cleaner-10l", brand: "br_koch", category: "cat_chem",
    name: ["Koch-Chemie Interior 10 ლ", "Koch-Chemie Interior 10 L", "Koch-Chemie Interior 10 л"],
    short: [
      "სალონის უნივერსალური საწმენდი — პლასტიკი, ქსოვილი და ტყავი.",
      "Universal interior cleaner for plastics, fabric and leather.",
      "Универсальный очиститель салона для пластика, текстиля и кожи.",
    ],
    price: 165, stock: 28, image: "chemical", createdAt: "2025-12-04",
    specs: { chemType: "interior", suitableFor: "manual", volume: 10, dilution: 20, phValue: 8, concentrate: true },
  },

  // --------------------------------------------------------- foam & dosing
  {
    sku: "KAR-FOAM-ARCH", slug: "karcher-foam-arch", brand: "br_karcher", category: "cat_foam",
    name: ["Kärcher Foam Arch", "Kärcher Foam Arch", "Kärcher Foam Arch"],
    short: [
      "ქაფის თაღი შესასვლელში — ავტომობილს სრულად ფარავს წინასწარი რეცხვისას.",
      "Entry foam arch that coats the whole vehicle during pre-wash.",
      "Пенная арка на въезде, полностью покрывающая автомобиль при предмойке.",
    ],
    price: 8900, stock: 3, image: "foam", featured: true, createdAt: "2026-04-30",
    specs: { foamType: "arch", tankVolume: 60, pressure: 40 },
  },
  {
    sku: "KAR-FOAM-LANCE", slug: "karcher-foam-lance-pro", brand: "br_karcher", category: "cat_foam",
    name: ["Kärcher Foam Lance Pro", "Kärcher Foam Lance Pro", "Kärcher Foam Lance Pro"],
    short: [
      "პროფესიონალური ქაფის ლანსი მაღალი წნევის აპარატისთვის — რეგულირებადი კონცენტრაცია.",
      "Professional foam lance for pressure washers, with adjustable concentration.",
      "Профессиональное пенокопьё для АВД с регулируемой концентрацией.",
    ],
    price: 480, salePrice: 420, stock: 24, image: "foam", createdAt: "2026-02-26",
    specs: { foamType: "lance", tankVolume: 1, pressure: 250 },
  },
  {
    sku: "COM-FOAM-CAN", slug: "comet-foam-cannon-50", brand: "br_comet", category: "cat_foam",
    name: ["Comet Foam Cannon 50", "Comet Foam Cannon 50", "Comet Foam Cannon 50"],
    short: [
      "მობილური ქაფის გენერატორი 50 ლ ავზით — დეტეილინგისა და სატვირთოებისთვის.",
      "Mobile foam generator with a 50 l tank, for detailing and truck work.",
      "Мобильный пеногенератор с баком 50 л для детейлинга и грузовиков.",
    ],
    price: 1650, stock: 6, image: "foam", createdAt: "2026-03-20",
    specs: { foamType: "cannon", tankVolume: 50, pressure: 8 },
  },
  {
    sku: "IPG-DOSE-4", slug: "interpump-dosing-pump-4", brand: "br_interpump", category: "cat_foam",
    name: ["Interpump Dosing Pump 4", "Interpump Dosing Pump 4", "Interpump Dosing Pump 4"],
    short: [
      "ოთხარხიანი დოზირების ტუმბო — ქიმიის ზუსტი მიწოდება ყველა ეტაპზე.",
      "Four-channel dosing pump delivering exact chemical volumes to every stage.",
      "Четырёхканальный дозирующий насос для точной подачи химии на каждую стадию.",
    ],
    price: 2900, stock: 5, image: "foam", createdAt: "2026-01-26",
    specs: { foamType: "dosing", tankVolume: 0, pressure: 10 },
  },

  // ------------------------------------------------------ dryers & blowers
  {
    sku: "WT-DRY-ARCH", slug: "washtec-dryer-arch", brand: "br_washtec", category: "cat_dry",
    name: ["WashTec Dryer Arch", "WashTec Dryer Arch", "WashTec Dryer Arch"],
    short: [
      "საშრობი თაღი გვირაბური ხაზისთვის — ოთხი ძრავი, ლაქების გარეშე დასრულება.",
      "Dryer arch for tunnel lines: four motors and a spot-free finish.",
      "Сушильная арка для туннельной линии: четыре двигателя, финиш без разводов.",
    ],
    price: 32000, stock: 0, leadTime: true, image: "dryer", featured: true, createdAt: "2026-05-04",
    specs: { power: 22, airFlow: 42000, motorCount: 4, noiseLevel: 88 },
  },
  {
    sku: "IST-BLOW-2", slug: "istobal-blower-2", brand: "br_istobal", category: "cat_dry",
    name: ["Istobal Blower 2", "Istobal Blower 2", "Istobal Blower 2"],
    short: [
      "ორძრავიანი გვერდითი ვენტილატორი — არსებული პორტალის დამატებითი შრობისთვის.",
      "Two-motor side blower that adds a drying stage to an existing gantry.",
      "Двухмоторный боковой вентилятор для добавления сушки к существующему порталу.",
    ],
    price: 14800, stock: 2, image: "dryer", createdAt: "2026-03-24",
    specs: { power: 11, airFlow: 21000, motorCount: 2, noiseLevel: 84 },
  },
  {
    sku: "CHR-DRY-TOP", slug: "christ-top-dryer", brand: "br_christ", category: "cat_dry",
    name: ["Christ Top Dryer", "Christ Top Dryer", "Christ Top Dryer"],
    short: [
      "ზედა კონტურის საშრობი — მიჰყვება ავტომობილის პროფილს სენსორებით.",
      "Roof-contour dryer that follows the vehicle profile using sensors.",
      "Верхняя сушка, следящая за профилем автомобиля по датчикам.",
    ],
    price: 26400, stock: 0, leadTime: true, image: "dryer", createdAt: "2026-04-08",
    specs: { power: 18, airFlow: 33000, motorCount: 3, noiseLevel: 86 },
  },

  // ---------------------------------------------------------- spare parts
  {
    sku: "PART-BRUSH-SL", slug: "brush-set-softline", brand: "br_washtec", category: "cat_parts",
    name: ["ჯაგრისების ნაკრები SoftLine", "Brush set SoftLine", "Комплект щёток SoftLine"],
    short: [
      "სათადარიგო ჯაგრისების ნაკრები SoftLine პორტალისთვის — რბილი ქაფის მასალა.",
      "Replacement brush set for SoftLine gantries in soft foam material.",
      "Комплект сменных щёток для порталов SoftLine из мягкого пенополимера.",
    ],
    price: 4200, stock: 4, image: "parts", createdAt: "2026-02-20",
    specs: { partType: "brush", pressureRating: 0 },
  },
  {
    sku: "PART-HOSE-15M", slug: "hp-hose-15m-400bar", brand: "br_interpump", category: "cat_parts",
    name: ["მაღალი წნევის შლანგი 15 მ", "High-pressure hose 15 m", "Шланг высокого давления 15 м"],
    short: [
      "ორმაგი არმატურით გამაგრებული შლანგი 400 ბარამდე — თვითმომსახურების ბოქსისთვის.",
      "Twin-braid hose rated to 400 bar, for self-service bays.",
      "Шланг с двойным армированием до 400 бар для боксов самообслуживания.",
    ],
    price: 340, salePrice: 295, stock: 22, image: "parts", createdAt: "2026-01-10",
    specs: { partType: "hose", pressureRating: 400 },
  },
  {
    sku: "PART-GUN-500", slug: "trigger-gun-500bar", brand: "br_ehrle", category: "cat_parts",
    name: ["პისტოლეტი 500 ბარი", "Trigger gun 500 bar", "Пистолет 500 бар"],
    short: [
      "მაღალი წნევის პისტოლეტი გაძლიერებული სახელურით — ხანგრძლივი მუშაობისთვის.",
      "High-pressure trigger gun with a reinforced grip for long shifts.",
      "Пистолет высокого давления с усиленной рукояткой для длительной работы.",
    ],
    price: 285, stock: 16, image: "parts", createdAt: "2025-12-10",
    specs: { partType: "gun", pressureRating: 500 },
  },
  {
    sku: "PART-NOZZLE-SET", slug: "nozzle-set-selfservice", brand: "br_comet", category: "cat_parts",
    name: ["ფორსუნკების ნაკრები", "Nozzle set", "Комплект форсунок"],
    short: [
      "ცერამიკული ფორსუნკების ნაკრები — თვითმომსახურების ყველა პროგრამისთვის.",
      "Ceramic nozzle set covering every self-service programme.",
      "Комплект керамических форсунок для всех программ самообслуживания.",
    ],
    price: 190, stock: 30, image: "parts", createdAt: "2026-03-02",
    specs: { partType: "nozzle", pressureRating: 250 },
  },
  {
    sku: "PART-BOOM-CEIL", slug: "ceiling-boom-with-reel", brand: "br_ehrle", category: "cat_parts",
    name: ["ჭერის დამბა კოჭით", "Ceiling boom with hose reel", "Потолочная консоль с катушкой"],
    short: [
      "ჭერზე დამონტაჟებული დამბა ავტომატური კოჭით — შლანგი იატაკზე არ გდია.",
      "Ceiling-mounted boom with a retracting reel, keeping the hose off the floor.",
      "Потолочная консоль с автоматической катушкой — шланг не лежит на полу.",
    ],
    price: 1480, stock: 5, image: "parts", createdAt: "2026-04-16",
    specs: { partType: "boom", pressureRating: 250 },
  },
  {
    sku: "PART-PUMP-KIT", slug: "pump-service-kit-ww", brand: "br_interpump", category: "cat_parts",
    name: ["ტუმბოს სერვისის ნაკრები", "Pump service kit", "Ремкомплект насоса"],
    short: [
      "სახარჯი მასალის ნაკრები ტუმბოს გეგმიური სერვისისთვის — სარქველები და მანჟეტები.",
      "Consumables kit for scheduled pump servicing: valves and seals.",
      "Комплект расходников для планового обслуживания насоса: клапаны и манжеты.",
    ],
    price: 420, stock: 1, image: "parts", createdAt: "2026-05-22",
    specs: { partType: "pump", pressureRating: 500 },
  },
];

export const products: Product[] = drafts.map(build);

const byId = new Map(products.map((p) => [p.id, p]));
const bySlug = new Map(products.map((p) => [p.slug, p]));

export function getProductById(id: string): Product | undefined {
  return byId.get(id);
}

export function getProductBySlug(slug: string): Product | undefined {
  return bySlug.get(slug);
}
