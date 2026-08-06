import { l } from "../localized";
import type { Category, CategoryNode, SpecDefinition } from "../types";

function enumSpec(
  key: string,
  label: [string, string, string],
  options: Array<[string, string, string, string]>,
  order: number,
  showInCard = false,
): SpecDefinition {
  return {
    key,
    label: l(label[0], label[1], label[2]),
    type: "enum",
    options: options.map(([value, ka, en, ru]) => ({
      value,
      label: l(ka, en, ru),
    })),
    filterable: true,
    showInCard,
    order,
  };
}

function numberSpec(
  key: string,
  label: [string, string, string],
  unit: string,
  order: number,
  showInCard = false,
): SpecDefinition {
  return {
    key,
    label: l(label[0], label[1], label[2]),
    type: "number",
    unit,
    filterable: true,
    showInCard,
    order,
  };
}

function boolSpec(
  key: string,
  label: [string, string, string],
  order: number,
  showInCard = false,
): SpecDefinition {
  return {
    key,
    label: l(label[0], label[1], label[2]),
    type: "bool",
    filterable: true,
    showInCard,
    order,
  };
}

const VOLTAGE_OPTIONS: Array<[string, string, string, string]> = [
  ["230v", "230 ვ / 1 ფაზა", "230 V single-phase", "230 В однофазное"],
  ["400v", "400 ვ / 3 ფაზა", "400 V three-phase", "400 В трёхфазное"],
];

/**
 * Professional car wash equipment, organised the way an operator shops: by the
 * kind of installation they are building or maintaining.
 *
 * Flat list with materialised ancestors, mirroring the Phase 2 Mongoose
 * document exactly so the swap is an import change.
 */
export const categories: Category[] = [
  // ------------------------------------------------- automatic wash systems
  {
    id: "cat_auto",
    slug: "automatic-systems",
    name: l("ავტომატური სამრეცხაოები", "Automatic wash systems", "Автоматические мойки"),
    description: l(
      "სრული ავტომატური სისტემები — პორტალური, გვირაბური და შეხებისგარეშე მრეცხავები ავტოგასამართი სადგურებისა და კომერციული სამრეცხაოებისთვის.",
      "Complete automatic installations — rollover, tunnel and touch-free machines for fuel stations and commercial wash sites.",
      "Комплексные автоматические установки — портальные, туннельные и бесконтактные мойки для АЗС и коммерческих объектов.",
    ),
    parent: null,
    ancestors: [],
    path: "/automatic-systems",
    icon: "gantry",
    order: 1,
    isActive: true,
    specSchema: [
      numberSpec("throughput", ["გამტარიანობა", "Throughput", "Пропускная способность"], "cars/h", 1, true),
      numberSpec("vehicleHeightMax", ["მაქს. სიმაღლე", "Max vehicle height", "Макс. высота авто"], "mm", 2, true),
      numberSpec("vehicleWidthMax", ["მაქს. სიგანე", "Max vehicle width", "Макс. ширина авто"], "mm", 3),
      numberSpec("powerRequirement", ["სიმძლავრე", "Power requirement", "Требуемая мощность"], "kW", 4, true),
      numberSpec("waterPerCar", ["წყლის ხარჯი", "Water per vehicle", "Расход воды на авто"], "l", 5),
      boolSpec("dryerIncluded", ["საშრობი შედის", "Dryer included", "Сушка в комплекте"], 6),
      boolSpec("waterRecycling", ["წყლის რეციკლირება", "Water recycling ready", "Готовность к рециклингу"], 7),
    ],
  },
  {
    id: "cat_auto_rollover",
    slug: "rollover-machines",
    name: l("პორტალური მრეცხავები", "Rollover machines", "Портальные мойки"),
    description: l(
      "ავტომობილი უძრავად დგას, პორტალი მოძრაობს — ყველაზე გავრცელებული გადაწყვეტა ერთი ბოქსისთვის.",
      "The vehicle stays still while the gantry travels over it — the standard single-bay solution.",
      "Автомобиль стоит, портал двигается — стандартное решение для одного бокса.",
    ),
    parent: "cat_auto",
    ancestors: ["cat_auto"],
    path: "/automatic-systems/rollover-machines",
    order: 1,
    isActive: true,
    specSchema: [
      enumSpec(
        "washMedium",
        ["რეცხვის ტიპი", "Wash medium", "Тип мойки"],
        [
          ["brush", "ჯაგრისი", "Soft-touch brush", "Щёточная"],
          ["touchless", "შეხებისგარეშე", "Touch-free", "Бесконтактная"],
          ["hybrid", "ჰიბრიდული", "Hybrid", "Гибридная"],
        ],
        8,
        true,
      ),
      numberSpec("brushCount", ["ჯაგრისების რაოდენობა", "Brush count", "Количество щёток"], "×", 9),
    ],
  },
  {
    id: "cat_auto_tunnel",
    slug: "tunnel-systems",
    name: l("გვირაბური სისტემები", "Tunnel systems", "Туннельные системы"),
    description: l(
      "კონვეიერული ხაზი მაღალი ნაკადისთვის — საათში ასამდე ავტომობილი.",
      "Conveyor lines for high volume sites — up to a hundred vehicles an hour.",
      "Конвейерные линии для высокой загрузки — до ста автомобилей в час.",
    ),
    parent: "cat_auto",
    ancestors: ["cat_auto"],
    path: "/automatic-systems/tunnel-systems",
    order: 2,
    isActive: true,
    specSchema: [
      numberSpec("conveyorLength", ["კონვეიერის სიგრძე", "Conveyor length", "Длина конвейера"], "m", 8, true),
      numberSpec("stationCount", ["სადგურების რაოდენობა", "Wash stations", "Количество постов"], "×", 9),
    ],
  },
  {
    id: "cat_auto_bus",
    slug: "truck-and-bus-wash",
    name: l("სატვირთო და ავტობუსი", "Truck & bus wash", "Мойка грузовиков и автобусов"),
    description: l(
      "მძიმე ტექნიკის სამრეცხაო პორტალები — სატვირთოებისთვის, ავტობუსებისა და სპეცტექნიკისთვის.",
      "Heavy-vehicle gantries for trucks, buses and municipal fleets.",
      "Портальные установки для грузовиков, автобусов и спецтехники.",
    ),
    parent: "cat_auto",
    ancestors: ["cat_auto"],
    path: "/automatic-systems/truck-and-bus-wash",
    order: 3,
    isActive: true,
    specSchema: [
      numberSpec("vehicleLengthMax", ["მაქს. სიგრძე", "Max vehicle length", "Макс. длина авто"], "m", 8),
    ],
  },

  // ---------------------------------------------------------- self-service
  {
    id: "cat_ss",
    slug: "self-service",
    name: l("თვითმომსახურება", "Self-service wash", "Самообслуживание"),
    description: l(
      "თვითმომსახურების ბოქსები, გადახდის ტერმინალები და მართვის სისტემები.",
      "Self-service bays, payment terminals and site control systems.",
      "Боксы самообслуживания, платёжные терминалы и системы управления.",
    ),
    parent: null,
    ancestors: [],
    path: "/self-service",
    icon: "bay",
    order: 2,
    isActive: true,
    specSchema: [
      numberSpec("bayCount", ["ბოქსების რაოდენობა", "Bays served", "Количество боксов"], "×", 1, true),
      numberSpec("programCount", ["პროგრამები", "Wash programmes", "Количество программ"], "×", 2, true),
      boolSpec("heatedWater", ["ცხელი წყალი", "Heated water", "Горячая вода"], 3),
    ],
  },
  {
    id: "cat_ss_bays",
    slug: "wash-bays",
    name: l("სამრეცხაო ბოქსები", "Wash bays", "Моечные боксы"),
    parent: "cat_ss",
    ancestors: ["cat_ss"],
    path: "/self-service/wash-bays",
    order: 1,
    isActive: true,
    specSchema: [
      numberSpec("pressure", ["წნევა", "Working pressure", "Рабочее давление"], "bar", 4, true),
      numberSpec("flowRate", ["წყლის ხარჯი", "Flow rate", "Расход воды"], "l/h", 5),
    ],
  },
  {
    id: "cat_ss_payment",
    slug: "payment-terminals",
    name: l("გადახდის ტერმინალები", "Payment terminals", "Платёжные терминалы"),
    parent: "cat_ss",
    ancestors: ["cat_ss"],
    path: "/self-service/payment-terminals",
    order: 2,
    isActive: true,
    specSchema: [
      enumSpec(
        "paymentTypes",
        ["გადახდის მეთოდი", "Payment method", "Способ оплаты"],
        [
          ["coin", "მონეტა", "Coin", "Монеты"],
          ["card", "ბარათი", "Card", "Карта"],
          ["token", "ჟეტონი", "Token", "Жетоны"],
          ["app", "მობილური", "Mobile app", "Мобильное приложение"],
        ],
        4,
        true,
      ),
      boolSpec("cashless", ["უნაღდო", "Cashless", "Безналичная"], 5),
    ],
  },

  // ---------------------------------------------------- high-pressure units
  {
    id: "cat_hp",
    slug: "high-pressure-washers",
    name: l("მაღალი წნევის აპარატები", "High-pressure washers", "Аппараты высокого давления"),
    description: l(
      "პროფესიონალური ცივი და ცხელი წყლის აპარატები — მობილური და სტაციონარული.",
      "Professional cold- and hot-water machines, mobile and stationary.",
      "Профессиональные аппараты с холодной и горячей водой, мобильные и стационарные.",
    ),
    parent: null,
    ancestors: [],
    path: "/high-pressure-washers",
    icon: "pressure",
    order: 3,
    isActive: true,
    specSchema: [
      numberSpec("pressure", ["წნევა", "Working pressure", "Рабочее давление"], "bar", 1, true),
      numberSpec("flowRate", ["წყლის ხარჯი", "Flow rate", "Расход воды"], "l/h", 2, true),
      numberSpec("power", ["სიმძლავრე", "Power", "Мощность"], "kW", 3),
      enumSpec(
        "waterTemp",
        ["წყლის ტემპერატურა", "Water temperature", "Температура воды"],
        [
          ["cold", "ცივი", "Cold water", "Холодная вода"],
          ["hot", "ცხელი", "Hot water", "Горячая вода"],
        ],
        4,
        true,
      ),
      enumSpec("voltage", ["კვება", "Power supply", "Электропитание"], VOLTAGE_OPTIONS, 5),
      enumSpec(
        "mounting",
        ["განთავსება", "Mounting", "Размещение"],
        [
          ["mobile", "მობილური", "Mobile", "Мобильный"],
          ["stationary", "სტაციონარული", "Stationary", "Стационарный"],
          ["wall", "კედლის", "Wall-mounted", "Настенный"],
        ],
        6,
      ),
      boolSpec("inductionMotor", ["ინდუქციური ძრავი", "Induction motor", "Индукционный мотор"], 7),
    ],
  },

  // ----------------------------------------------------- vacuum & interior
  {
    id: "cat_vac",
    slug: "vacuum-and-interior",
    name: l("მტვერსასრუტები და სალონი", "Vacuum & interior", "Пылесосы и салон"),
    description: l(
      "მონეტით მომუშავე მტვერსასრუტის სადგურები და სალონის ქიმწმენდის აღჭურვილობა.",
      "Coin-operated vacuum stations and interior extraction equipment.",
      "Пылесосные станции с оплатой и оборудование для химчистки салона.",
    ),
    parent: null,
    ancestors: [],
    path: "/vacuum-and-interior",
    icon: "vacuum",
    order: 4,
    isActive: true,
    specSchema: [
      numberSpec("power", ["სიმძლავრე", "Power", "Мощность"], "W", 1, true),
      numberSpec("motorCount", ["ძრავები", "Motors", "Двигатели"], "×", 2, true),
      numberSpec("tankVolume", ["ავზი", "Tank volume", "Объём бака"], "l", 3),
      numberSpec("hoseCount", ["შლანგები", "Hoses", "Шланги"], "×", 4),
      boolSpec("coinOperated", ["მონეტით მართვა", "Coin-operated", "С оплатой монетами"], 5),
    ],
  },

  // ------------------------------------------------------- water treatment
  {
    id: "cat_water",
    slug: "water-treatment",
    name: l("წყლის დამუშავება", "Water treatment", "Водоподготовка"),
    description: l(
      "წყლის რეციკლირება, ოსმოსი და ნავთობდამჭერები — ხარჯების შემცირება და ნორმებთან შესაბამისობა.",
      "Reclamation, reverse osmosis and oil separators — lower running costs and compliance.",
      "Рециклинг, обратный осмос и нефтеуловители — снижение расходов и соответствие нормам.",
    ),
    parent: null,
    ancestors: [],
    path: "/water-treatment",
    icon: "water",
    order: 5,
    isActive: true,
    specSchema: [
      enumSpec(
        "treatmentType",
        ["ტიპი", "Treatment type", "Тип обработки"],
        [
          ["recycling", "რეციკლირება", "Water recycling", "Рециклинг воды"],
          ["osmosis", "ოსმოსი", "Reverse osmosis", "Обратный осмос"],
          ["separator", "ნავთობდამჭერი", "Oil separator", "Нефтеуловитель"],
          ["softener", "დამარბილებელი", "Water softener", "Умягчитель"],
        ],
        1,
        true,
      ),
      numberSpec("capacity", ["წარმადობა", "Capacity", "Производительность"], "l/h", 2, true),
      numberSpec("recoveryRate", ["აღდგენის ხარისხი", "Recovery rate", "Степень рекуперации"], "%", 3),
      numberSpec("footprint", ["დაკავებული ფართი", "Footprint", "Занимаемая площадь"], "m²", 4),
    ],
  },

  // ------------------------------------------------------------- chemicals
  {
    id: "cat_chem",
    slug: "chemicals",
    name: l("ქიმია", "Wash chemicals", "Автохимия"),
    description: l(
      "კონცენტრირებული შამპუნები, აქტიური ქაფი, ცვილი და დისკების საწმენდები პროფესიონალური სამრეცხაოსთვის.",
      "Concentrated shampoos, active foam, waxes and wheel cleaners for professional sites.",
      "Концентрированные шампуни, активная пена, воски и очистители дисков для профессиональных моек.",
    ),
    parent: null,
    ancestors: [],
    path: "/chemicals",
    icon: "chemical",
    order: 6,
    isActive: true,
    specSchema: [
      enumSpec(
        "chemType",
        ["დანიშნულება", "Product type", "Назначение"],
        [
          ["prewash", "წინასწარი რეცხვა", "Pre-wash", "Предварительная мойка"],
          ["foam", "აქტიური ქაფი", "Active foam", "Активная пена"],
          ["shampoo", "შამპუნი", "Shampoo", "Шампунь"],
          ["wax", "ცვილი", "Wax", "Воск"],
          ["wheel", "დისკები", "Wheel cleaner", "Очиститель дисков"],
          ["interior", "სალონი", "Interior cleaner", "Очиститель салона"],
          ["dryingaid", "შრობის დამხმარე", "Drying aid", "Средство для сушки"],
        ],
        1,
        true,
      ),
      enumSpec(
        "suitableFor",
        ["თავსებადობა", "Suitable for", "Совместимость"],
        [
          ["touchless", "შეხებისგარეშე", "Touch-free", "Бесконтактная"],
          ["brush", "ჯაგრისიანი", "Brush wash", "Щёточная"],
          ["manual", "ხელით", "Manual wash", "Ручная мойка"],
          ["any", "უნივერსალური", "Any", "Универсальное"],
        ],
        2,
        true,
      ),
      numberSpec("volume", ["მოცულობა", "Volume", "Объём"], "l", 3, true),
      numberSpec("dilution", ["განზავება 1:", "Dilution 1:", "Разведение 1:"], "", 4),
      numberSpec("phValue", ["pH", "pH", "pH"], "", 5),
      boolSpec("concentrate", ["კონცენტრატი", "Concentrate", "Концентрат"], 6),
    ],
  },

  // -------------------------------------------------------- foam & dosing
  {
    id: "cat_foam",
    slug: "foam-and-dosing",
    name: l("ქაფი და დოზირება", "Foam & dosing", "Пена и дозирование"),
    description: l(
      "ქაფის გენერატორები, თაღები, ლანსები და დოზირების ტუმბოები.",
      "Foam generators, arches, lances and dosing pumps.",
      "Генераторы пены, арки, пенокопья и дозирующие насосы.",
    ),
    parent: null,
    ancestors: [],
    path: "/foam-and-dosing",
    icon: "foam",
    order: 7,
    isActive: true,
    specSchema: [
      enumSpec(
        "foamType",
        ["ტიპი", "Type", "Тип"],
        [
          ["lance", "ლანსი", "Foam lance", "Пенокопьё"],
          ["cannon", "ქვემეხი", "Foam cannon", "Пеногенератор"],
          ["arch", "თაღი", "Foam arch", "Пенная арка"],
          ["dosing", "დოზატორი", "Dosing pump", "Дозирующий насос"],
        ],
        1,
        true,
      ),
      numberSpec("tankVolume", ["ავზი", "Tank volume", "Объём бака"], "l", 2, true),
      numberSpec("pressure", ["მაქს. წნევა", "Max pressure", "Макс. давление"], "bar", 3),
    ],
  },

  // ------------------------------------------------------------ dryers
  {
    id: "cat_dry",
    slug: "dryers-and-blowers",
    name: l("საშრობები", "Dryers & blowers", "Сушки и обдув"),
    description: l(
      "ჰაერის საშრობი თაღები და ვენტილატორები — ლაქების გარეშე დასრულებისთვის.",
      "Air dryer arches and blowers for a spot-free finish.",
      "Сушильные арки и вентиляторы для сушки без разводов.",
    ),
    parent: null,
    ancestors: [],
    path: "/dryers-and-blowers",
    icon: "dryer",
    order: 8,
    isActive: true,
    specSchema: [
      numberSpec("power", ["სიმძლავრე", "Power", "Мощность"], "kW", 1, true),
      numberSpec("airFlow", ["ჰაერის ნაკადი", "Air flow", "Воздушный поток"], "m³/h", 2, true),
      numberSpec("motorCount", ["ძრავები", "Motors", "Двигатели"], "×", 3),
      numberSpec("noiseLevel", ["ხმაური", "Noise level", "Уровень шума"], "dB", 4),
    ],
  },

  // ------------------------------------------------------- spare parts
  {
    id: "cat_parts",
    slug: "spare-parts",
    name: l("ნაწილები და აქსესუარები", "Spare parts & accessories", "Запчасти и аксессуары"),
    description: l(
      "ჯაგრისები, შლანგები, დამბები, ფორსუნკები და ტუმბოს ნაწილები.",
      "Brushes, hoses, booms, nozzles and pump parts.",
      "Щётки, шланги, консоли, форсунки и детали насосов.",
    ),
    parent: null,
    ancestors: [],
    path: "/spare-parts",
    icon: "parts",
    order: 9,
    isActive: true,
    specSchema: [
      enumSpec(
        "partType",
        ["ტიპი", "Part type", "Тип"],
        [
          ["brush", "ჯაგრისი", "Brush", "Щётка"],
          ["hose", "შლანგი", "Hose", "Шланг"],
          ["nozzle", "ფორსუნკა", "Nozzle", "Форсунка"],
          ["gun", "პისტოლეტი", "Trigger gun", "Пистолет"],
          ["boom", "დამბა", "Boom / hose reel", "Консоль / катушка"],
          ["pump", "ტუმბოს ნაწილი", "Pump part", "Деталь насоса"],
        ],
        1,
        true,
      ),
      numberSpec("pressureRating", ["წნევის კლასი", "Pressure rating", "Класс давления"], "bar", 2),
    ],
  },
];

const byId = new Map(categories.map((c) => [c.id, c]));
const bySlug = new Map(categories.map((c) => [c.slug, c]));

export function getCategoryById(id: string): Category | undefined {
  return byId.get(id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return bySlug.get(slug);
}

export function getRootCategories(): Category[] {
  return categories
    .filter((c) => c.parent === null && c.isActive)
    .sort((a, b) => a.order - b.order);
}

export function getChildren(categoryId: string): Category[] {
  return categories
    .filter((c) => c.parent === categoryId && c.isActive)
    .sort((a, b) => a.order - b.order);
}

/** Root -> leaf chain, including the category itself. Drives breadcrumbs. */
export function getCategoryTrail(category: Category): Category[] {
  const trail = category.ancestors
    .map((id) => byId.get(id))
    .filter((c): c is Category => Boolean(c));
  return [...trail, category];
}

/** Every category id in this subtree, including the root. Mirrors an `ancestors` query. */
export function getSubtreeIds(categoryId: string): string[] {
  const ids = [categoryId];
  for (const child of getChildren(categoryId)) {
    ids.push(...getSubtreeIds(child.id));
  }
  return ids;
}

/**
 * A category's own spec schema merged with all of its ancestors'. This is why
 * "Throughput" is declared once on `automatic-systems` and still filters on
 * `/rollover-machines`.
 */
export function getEffectiveSpecSchema(category: Category): SpecDefinition[] {
  const chain = getCategoryTrail(category);
  const merged = new Map<string, SpecDefinition>();
  for (const node of chain) {
    for (const spec of node.specSchema) {
      merged.set(spec.key, spec);
    }
  }
  return [...merged.values()].sort((a, b) => a.order - b.order);
}

export function getCategoryTree(): CategoryNode[] {
  const build = (parent: string | null): CategoryNode[] =>
    categories
      .filter((c) => c.parent === parent && c.isActive)
      .sort((a, b) => a.order - b.order)
      .map((c) => ({ ...c, children: build(c.id) }));
  return build(null);
}
