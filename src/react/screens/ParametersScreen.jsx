import { useMemo } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { calculateTerraceRoof } from "../../calculations/terrace-model.js";
import { calculateProject } from "../calculations/estimate-engine.js";
import { SIP_JOINERY_TYPES } from "../calculations/sip-joinery.js";
import { useProject } from "../state/ProjectContext.jsx";
import {
  Field,
  NumberField,
  ScreenHeader,
  SelectField,
  Stat,
  Toggle,
} from "../components/ui.jsx";
import { formatNumber } from "../utils/format.js";
import { resizeProjectHouse } from "../planner/geometry.js";
import { ensureProjectFloorCount } from "../state/project-model.js";
import {
  releasePlanLinkedQuantityOverrides,
  scopeEstimateOverrideToCurrentCatalog,
} from "../state/estimate-edits.js";

const thicknesses = ["124", "174", "224"].map((value) => ({
  value,
  label: `${value} мм`,
}));
const panelFamilies = [
  { value: "pps", label: "PPS" },
  { value: "mineral-wool", label: "Минвата" },
  { value: "csp-pps", label: "CSP PPS" },
];
const roofCoverings = [
  { value: "profile", label: "Профлист С-21" },
  { value: "metal-tile", label: "Металлочерепица" },
  { value: "soft", label: "Мягкая кровля + OSB" },
];
const roofShapes = [
  { value: "gable", label: "Двускатная" },
  { value: "hip", label: "Вальмовая" },
  { value: "flat", label: "Плоская" },
];
const serviceGroups = [
  [
    "Конструктив",
    [
      ["foundation", "Сваи и обвязка"],
      ["sipFloor", "SIP-пол"],
      ["sipSecondFloor", "Межэтажное перекрытие / пол 2 этажа"],
      ["sipWalls", "SIP-стены"],
      ["sipCeiling", "SIP-потолок"],
      ["partitions", "Перегородки"],
      ["roof", "Кровля"],
    ],
  ],
  [
    "Комплектация",
    [
      ["terrace", "Терраса и крыльцо"],
      ["openings", "Окна и двери"],
      ["delivery", "Доставка"],
    ],
  ],
  [
    "Инженерия",
    [
      ["engineeringElectric", "Электрика"],
      ["engineeringPlumbing", "Водоснабжение"],
      ["engineeringSewerage", "Канализация"],
      ["engineeringVentilation", "Вентиляция"],
    ],
  ],
  [
    "Отделка",
    [
      ["internalFinish", "Внутренняя"],
      ["externalFinish", "Наружная"],
    ],
  ],
];

function Section({ id, number, title, description, children }) {
  return (
    <section className="parameter-section" id={`parameter-${id}`}>
      <header>
        <span>{number}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="parameter-section-body">{children}</div>
    </section>
  );
}

function Navigator({ items }) {
  const ready = items.filter((item) => item.ready).length;
  const percent = Math.round((ready / items.length) * 100);
  return (
    <aside className="parameter-navigator">
      <div className="parameter-progress">
        <div>
          <span>Полнота данных</span>
          <strong>{percent}%</strong>
        </div>
        <i>
          <b style={{ width: `${percent}%` }} />
        </i>
        <small>
          {ready} из {items.length} разделов готовы
        </small>
      </div>
      <nav>
        {items.map((item, index) => (
          <a
            key={item.id}
            href={`#parameter-${item.id}`}
            className={item.ready ? "complete" : "attention"}
          >
            <span>
              {item.ready ? <CheckCircle2 /> : <CircleAlert />}
              {index + 1}. {item.title}
            </span>
            <small>{item.note}</small>
          </a>
        ))}
      </nav>
      <p>
        Красный статус показывает, каких исходных данных не хватает. Форма дома,
        ряды свай и геометрия кровли рисуются на плане.
      </p>
    </aside>
  );
}

function AutoLink({ label, checked, onChange, hint }) {
  return (
    <div className="parameter-auto-link">
      <Toggle label={label} checked={checked} onChange={onChange} hint={hint} />
    </div>
  );
}

export default function ParametersScreen() {
  const { project, commit } = useProject();
  const calculation = useMemo(() => calculateProject(project), [project]);
  const { metrics, inputs } = calculation;
  const links = project.settings.links;
  const floorCount = Math.max(
    1,
    Math.min(2, Number(project.meta?.floors) || 1),
  );
  const floorPlans = useMemo(
    () => [
      project.plan,
      ...(project.upperFloors || []).slice(0, floorCount - 1),
    ],
    [project.plan, project.upperFloors, floorCount],
  );
  const totalRoomCount = floorPlans.reduce(
    (sum, floorPlan) => sum + (floorPlan.rooms || []).length,
    0,
  );
  const floorRooms = floorPlans.flatMap((floorPlan, floorIndex) =>
    (floorPlan.rooms || []).map((room) => ({
      room,
      floor: floorIndex + 1,
    })),
  );
  const floorOpenings = floorPlans.flatMap((floorPlan, floorIndex) =>
    (floorPlan.openings || []).map((opening) => ({
      opening,
      floor: floorIndex + 1,
    })),
  );
  const read = (path) =>
    path.split(".").reduce((value, key) => value?.[key], project);
  const write = (path, value, disableLink) =>
    commit((next) => {
      if (path === "meta.floors") {
        ensureProjectFloorCount(next, value);
        releasePlanLinkedQuantityOverrides(next);
        return next;
      }
      if (path === "plan.house.w" || path === "plan.house.h") {
        resizeProjectHouse(
          next,
          path === "plan.house.w" ? value : next.plan.house.w,
          path === "plan.house.h" ? value : next.plan.house.h,
        );
        releasePlanLinkedQuantityOverrides(next);
        return next;
      }
      if (path === "plan.wallHeight") {
        next.plan.wallHeight = value;
        (next.upperFloors || []).forEach((floorPlan) => {
          floorPlan.wallHeight = value;
        });
        releasePlanLinkedQuantityOverrides(next);
        return next;
      }
      if (path === "plan.wallThickness") {
        const millimeters = Number(value) || 174;
        next.plan.wallThickness = millimeters / 1000;
        (next.upperFloors || []).forEach((floorPlan) => {
          floorPlan.wallThickness = millimeters / 1000;
        });
        next.settings.sip.wallThickness = String(millimeters);
        return next;
      }
      if (path === "plan.partitionThickness") {
        const millimeters = Number(value) || 100;
        next.plan.partitionThickness = millimeters / 1000;
        (next.upperFloors || []).forEach((floorPlan) => {
          floorPlan.partitionThickness = millimeters / 1000;
        });
        if ([124, 174, 224].includes(millimeters)) {
          next.settings.sip.partitionThickness = String(millimeters);
        }
        return next;
      }
      const sipLineByPath = {
        "settings.sip.floorPanelFamily": "sip:panel-floor",
        "settings.sip.floorThickness": "sip:panel-floor",
        "settings.sip.secondFloorPanelFamily": "sip:panel-secondFloor",
        "settings.sip.secondFloorThickness": "sip:panel-secondFloor",
        "settings.sip.wallPanelFamily": "sip:panel-walls",
        "settings.sip.wallThickness": "sip:panel-walls",
        "settings.sip.ceilingPanelFamily": "sip:panel-ceiling",
        "settings.sip.ceilingThickness": "sip:panel-ceiling",
        "settings.sip.partitionPanelFamily": "sip:panel-partitions",
        "settings.sip.partitionThickness": "sip:panel-partitions",
      };
      if (sipLineByPath[path]) {
        scopeEstimateOverrideToCurrentCatalog(
          next,
          calculation.lines.find((line) => line.id === sipLineByPath[path]),
        );
      }
      const keys = path.split(".");
      let target = next;
      keys.slice(0, -1).forEach((key) => {
        target = target[key];
      });
      target[keys.at(-1)] = value;
      if (path.startsWith("settings.roof.") && !path.includes(".show"))
        releasePlanLinkedQuantityOverrides(next);
      if (disableLink) next.settings.links[disableLink] = false;
      return next;
    });
  const updateEntity = (list, id, path, value, floorIndex = 0) =>
    commit((next) => {
      const floorPlan =
        floorIndex === 0 ? next.plan : next.upperFloors?.[floorIndex - 1];
      const item = floorPlan?.[list]?.find((candidate) => candidate.id === id);
      if (!item) return next;
      const keys = path.split(".");
      let target = item;
      keys.slice(0, -1).forEach((key) => {
        target = target[key];
      });
      target[keys.at(-1)] = value;
      releasePlanLinkedQuantityOverrides(next);
      return next;
    });
  const fields = (definitions, columns = "four") => (
    <div className={`form-grid ${columns}`}>
      {definitions.filter(Boolean).map((field) => {
        const value = field.value ?? read(field.path);
        const onChange = (next) =>
          write(
            field.path,
            field.integer ? Math.round(next) : next,
            field.disableLink,
          );
        return field.type === "select" ? (
          <SelectField
            key={field.path}
            label={field.label}
            value={value}
            options={field.options}
            disabled={field.disabled}
            onChange={onChange}
          />
        ) : (
          <NumberField
            key={field.path}
            label={field.label}
            value={value}
            suffix={field.suffix}
            min={field.min ?? 0}
            max={field.max}
            step={field.step ?? 0.1}
            disabled={field.disabled}
            hint={field.hint}
            onChange={onChange}
          />
        );
      })}
    </div>
  );
  const activeEngineering = [
    "engineeringElectric",
    "engineeringPlumbing",
    "engineeringSewerage",
    "engineeringVentilation",
  ].some((key) => project.services[key]);
  const checklist = [
    {
      id: "project",
      title: "Проект и заказчик",
      ready: Boolean(
        project.meta.projectNum &&
        project.meta.date &&
        project.meta.customer &&
        project.meta.address,
      ),
      note:
        project.meta.customer && project.meta.address
          ? "карточка заполнена"
          : "нужны заказчик и адрес",
    },
    {
      id: "house",
      title: "Дом и помещения",
      ready:
        project.plan.house.w > 0 &&
        project.plan.house.h > 0 &&
        project.plan.wallHeight > 0,
      note: `${floorCount} эт. · ${formatNumber(metrics.totalFloorArea)} м² · ${totalRoomCount} пом.`,
    },
    {
      id: "scope",
      title: "Состав расчёта",
      ready: Object.values(project.services).some(Boolean),
      note: `${Object.values(project.services).filter(Boolean).length} разделов включено`,
    },
    {
      id: "foundation",
      title: "Сваи и обвязка",
      ready:
        !project.services.foundation || calculation.foundation.totalPiles > 0,
      note: project.services.foundation
        ? `${calculation.foundation.totalPiles} свай · ${calculation.foundation.boardCount} досок`
        : "отключено",
    },
    {
      id: "sip",
      title: "SIP-конструкции",
      ready: Boolean(
        project.settings.sip.floorThickness &&
        project.settings.sip.wallThickness &&
        project.settings.sip.ceilingThickness,
      ),
      note: `${project.settings.sip.floorThickness}/${project.settings.sip.wallThickness}/${project.settings.sip.ceilingThickness} мм`,
    },
    {
      id: "roof",
      title: "Кровля",
      ready:
        !project.services.roof ||
        project.settings.roof.shape === "flat" ||
        project.settings.roof.ridgeHeight > 0,
      note: project.services.roof
        ? `${formatNumber(calculation.roof.totalArea)} м²`
        : "отключено",
    },
    {
      id: "extensions",
      title: "Террасы и крыльцо",
      ready: !project.services.terrace || project.plan.platforms.length > 0,
      note: project.plan.platforms.length
        ? `${project.plan.platforms.length} площадки · ${formatNumber(metrics.platformArea)} м²`
        : "площадок нет",
    },
    {
      id: "openings",
      title: "Окна и двери",
      ready: !project.services.openings || floorOpenings.length > 0,
      note: `${floorOpenings.length} шт на ${floorCount} эт. · ${formatNumber(metrics.totalOpeningsArea)} м²`,
    },
    {
      id: "engineering",
      title: "Инженерия и отделка",
      ready:
        !activeEngineering ||
        Object.values(inputs.engineering).some((value) => value > 0),
      note:
        activeEngineering ||
        project.services.internalFinish ||
        project.services.externalFinish
          ? "параметры заданы"
          : "отключено",
    },
    {
      id: "delivery",
      title: "Доставка и печать",
      ready: !project.services.delivery || project.settings.delivery.trips > 0,
      note: project.services.delivery
        ? `${formatNumber(project.settings.delivery.distance)} км · ${project.settings.delivery.trips} рейс.`
        : "отключено",
    },
  ];

  return (
    <div className="screen parameters-master-screen">
      <ScreenHeader
        title="Параметры проекта"
        description="Главный опросный лист: пройдите его сверху вниз, и данные перейдут в план, калькуляторы, смету и печать"
      />
      <div className="stats-row">
        <Stat
          label="Габариты"
          value={`${formatNumber(project.plan.house.w)} × ${formatNumber(project.plan.house.h)} м`}
        />
        <Stat
          label="Площадь всех этажей"
          value={`${formatNumber(metrics.totalFloorArea)} м²`}
        />
        <Stat label="Периметр" value={`${formatNumber(metrics.perimeter)} м`} />
        <Stat label="Проёмы всех этажей" value={`${floorOpenings.length} шт`} />
      </div>
      <div className="parameters-master-layout">
        <main className="parameters-form-flow">
          <Section
            id="project"
            number="01"
            title="Проект и заказчик"
            description="Данные для файла, сметы и коммерческого предложения."
          >
            <div className="form-grid three">
              <Field label="Номер проекта">
                <input
                  value={project.meta.projectNum}
                  onChange={(event) =>
                    write("meta.projectNum", event.target.value)
                  }
                />
              </Field>
              <Field label="Заказчик">
                <input
                  value={project.meta.customer}
                  onChange={(event) =>
                    write("meta.customer", event.target.value)
                  }
                />
              </Field>
              <Field label="Дата">
                <input
                  type="date"
                  value={project.meta.date}
                  onChange={(event) => write("meta.date", event.target.value)}
                />
              </Field>
              <Field label="Адрес" className="span-2">
                <input
                  value={project.meta.address}
                  onChange={(event) =>
                    write("meta.address", event.target.value)
                  }
                />
              </Field>
              <Field label="Автор / менеджер">
                <input
                  value={project.meta.author}
                  onChange={(event) => write("meta.author", event.target.value)}
                />
              </Field>
              <NumberField
                label="Этажей"
                value={project.meta.floors || 1}
                suffix="шт"
                min={1}
                max={2}
                step={1}
                onChange={(value) => write("meta.floors", Math.round(value))}
              />
            </div>
          </Section>
          <Section
            id="house"
            number="02"
            title="Дом и помещения"
            description="Габариты, стены и режим потолка. Форма рисуется на плане."
          >
            {fields([
              { path: "plan.house.w", label: "Длина", suffix: "м", min: 3 },
              { path: "plan.house.h", label: "Ширина", suffix: "м", min: 3 },
              {
                path: "plan.wallHeight",
                label: "Высота стен",
                suffix: "м",
                min: 2,
              },
              {
                path: "plan.wallThickness",
                label: "Наружная стена",
                type: "select",
                value: String(Math.round(project.plan.wallThickness * 1000)),
                options: thicknesses,
              },
              {
                path: "plan.partitionThickness",
                label: "Перегородка",
                type: "select",
                value: String(
                  Math.round(project.plan.partitionThickness * 1000),
                ),
                options: [
                  { value: "100", label: "100 мм · каркасная" },
                  ...thicknesses,
                ],
              },
            ])}
            <div className="parameter-readouts">
              <div className="readout">
                <span>Пол</span>
                <strong>{formatNumber(metrics.floorArea)} м²</strong>
              </div>
              <div className="readout">
                <span>Потолок</span>
                <strong>{formatNumber(metrics.ceilingArea)} м²</strong>
              </div>
              <div className="readout">
                <span>Второй свет</span>
                <strong>{formatNumber(metrics.openCeilingArea)} м²</strong>
              </div>
            </div>
            {floorRooms.length ? (
              <div className="parameter-entity-list">
                <h3>Помещения всех этажей</h3>
                {floorRooms.map(({ room, floor }) => (
                  <article key={`${floor}-${room.id}`}>
                    <Field label={`Название · ${floor} этаж`}>
                      <input
                        value={room.name}
                        onChange={(event) =>
                          updateEntity(
                            "rooms",
                            room.id,
                            "name",
                            event.target.value,
                            floor - 1,
                          )
                        }
                      />
                    </Field>
                    <SelectField
                      label="Потолок"
                      value={room.ceilingMode || "flat"}
                      onChange={(value) =>
                        updateEntity(
                          "rooms",
                          room.id,
                          "ceilingMode",
                          value,
                          floor - 1,
                        )
                      }
                      options={[
                        { value: "flat", label: "Обычный SIP" },
                        { value: "open-rafter", label: "Второй свет" },
                      ]}
                    />
                    <Toggle
                      label="Учитывать"
                      checked={room.include !== false}
                      onChange={(value) =>
                        updateEntity(
                          "rooms",
                          room.id,
                          "include",
                          value,
                          floor - 1,
                        )
                      }
                    />
                    <Toggle
                      label="Несущие стены"
                      checked={room.bearing === true}
                      onChange={(value) =>
                        updateEntity(
                          "rooms",
                          room.id,
                          "bearing",
                          value,
                          floor - 1,
                        )
                      }
                    />
                  </article>
                ))}
              </div>
            ) : (
              <div className="parameter-info-note">
                Комнат нет. Пол и потолок считаются по полной площади.
              </div>
            )}
          </Section>
          <Section
            id="scope"
            number="03"
            title="Состав расчёта"
            description="Отключённый раздел сохраняет данные, но не входит в смету."
          >
            <div className="service-groups">
              {serviceGroups.map(([group, items]) => (
                <section key={group}>
                  <h3>{group}</h3>
                  {items.map(([key, label]) => (
                    <Toggle
                      key={key}
                      label={label}
                      checked={project.services[key]}
                      onChange={(value) => write(`services.${key}`, value)}
                    />
                  ))}
                </section>
              ))}
            </div>
          </Section>
          <Section
            id="foundation"
            number="04"
            title="Сваи и обвязка"
            description="Шаг свай и сечение обвязки; ряды и линии рисуются на плане."
          >
            {fields([
              {
                path: "settings.piles.spacing",
                label: "Предельный шаг свай",
                suffix: "м",
                min: 0.5,
              },
              {
                path: "settings.piles.bindingBoardWidthMm",
                label: "Ширина доски",
                suffix: "мм",
                min: 25,
                step: 5,
              },
              {
                path: "settings.piles.bindingBoardHeightMm",
                label: "Высота доски",
                suffix: "мм",
                min: 50,
                step: 5,
              },
              {
                path: "settings.piles.bindingLayers",
                label: "Слоёв обвязки",
                suffix: "шт",
                min: 1,
                max: 6,
                step: 1,
                integer: true,
              },
              {
                path: "settings.piles.boardStockLength",
                label: "Длина доски",
                suffix: "м",
                value: 6,
                disabled: true,
                hint: "Стандарт закупки ЭФТ",
              },
            ])}
            <div className="parameter-readouts">
              <div className="readout">
                <span>Сваи</span>
                <strong>{calculation.foundation.totalPiles} шт</strong>
              </div>
              <div className="readout">
                <span>Обвязка</span>
                <strong>
                  {formatNumber(calculation.foundation.bindingLength)} м
                </strong>
              </div>
              <div className="readout">
                <span>Закупка</span>
                <strong>
                  {calculation.foundation.boardCount} досок ·{" "}
                  {formatNumber(calculation.foundation.boardVolume, 3)} м³
                </strong>
              </div>
            </div>
          </Section>
          <Section
            id="sip"
            number="05"
            title="SIP-конструкции"
            description="Тип и толщина панелей выбираются отдельно для пола, стен, потолка и SIP-перегородок."
          >
            {fields([
              {
                path: "settings.sip.floorPanelFamily",
                label: "Тип панели пола",
                type: "select",
                options: panelFamilies,
              },
              {
                path: "settings.sip.floorThickness",
                label: "Толщина пола",
                type: "select",
                options: thicknesses,
              },
              (project.meta.floors || 1) > 1 && {
                path: "settings.sip.secondFloorPanelFamily",
                label: "Тип панели пола 2 этажа",
                type: "select",
                options: panelFamilies,
              },
              (project.meta.floors || 1) > 1 && {
                path: "settings.sip.secondFloorThickness",
                label: "Толщина пола 2 этажа",
                type: "select",
                options: thicknesses,
              },
              (project.meta.floors || 1) > 1 && {
                path: "settings.sip.secondFloorPanelWidth",
                label: "Конструктив пола 2 этажа",
                type: "select",
                options: [
                  { value: "1.25", label: "Стандарт · модуль 1250 мм" },
                  { value: "0.625", label: "Усиленный · модуль 625 мм" },
                ],
              },
              {
                path: "settings.sip.wallPanelFamily",
                label: "Тип панели стен",
                type: "select",
                options: panelFamilies,
              },
              {
                path: "settings.sip.wallThickness",
                label: "Толщина стен",
                type: "select",
                options: thicknesses,
              },
              {
                path: "settings.sip.ceilingPanelFamily",
                label: "Тип панели потолка",
                type: "select",
                options: panelFamilies,
              },
              {
                path: "settings.sip.ceilingThickness",
                label: "Толщина потолка",
                type: "select",
                options: thicknesses,
              },
              {
                path: "settings.sip.partitionType",
                label: "Тип перегородок",
                type: "select",
                options: [
                  { value: "frame", label: "Каркасные" },
                  { value: "sip", label: "SIP-панели" },
                ],
              },
              project.settings.sip.partitionType === "sip" && {
                path: "settings.sip.partitionPanelFamily",
                label: "Тип панели перегородок",
                type: "select",
                options: panelFamilies,
              },
              project.settings.sip.partitionType === "sip" && {
                path: "settings.sip.partitionThickness",
                label: "Толщина перегородок",
                type: "select",
                options: thicknesses,
              },
              {
                path: "settings.sip.connectorType",
                label: "Силовой каркас",
                type: "select",
                options: SIP_JOINERY_TYPES,
              },
              {
                path: "settings.sip.floorPanelWidth",
                label: "Раскладка пола",
                type: "select",
                options: [
                  { value: "1.25", label: "1250 мм" },
                  { value: "0.625", label: "625 мм · усиленная" },
                ],
              },
              {
                path: "settings.sip.ceilingPanelWidth",
                label: "Раскладка потолка",
                type: "select",
                options: [
                  { value: "1.25", label: "1250 мм" },
                  { value: "0.625", label: "625 мм · усиленная" },
                ],
              },
              {
                path: "settings.sip.wastePercent",
                label: "Запас панелей",
                suffix: "%",
                step: 1,
              },
              {
                path: "settings.sip.consumablesMode",
                label: "Расходники",
                type: "select",
                options: [
                  { value: "node", label: "По швам и узлам" },
                  { value: "quick", label: "Быстрый расчёт" },
                ],
              },
              project.settings.sip.consumablesMode !== "quick" && {
                path: "settings.sip.foamScope",
                label: "Пеноклей",
                type: "select",
                options: [
                  { value: "joints-and-edges", label: "Стыки и торцы" },
                  { value: "joints", label: "Только стыки" },
                ],
              },
            ])}
            <div className="parameter-readouts">
              {(project.meta.floors || 1) > 1 ? (
                <>
                <div className="readout">
                  <span>Пол 2 этажа</span>
                  <strong>{formatNumber(metrics.secondFloorArea)} м²</strong>
                </div>
                <div className="readout">
                  <span>Лестничный проём · оба этажа</span>
                  <strong>{formatNumber(metrics.secondFloorOpeningArea)} м²</strong>
                </div>
                <div className="readout">
                  <span>Панели пола 2 этажа</span>
                  <strong>
                    {calculation.sip.cutting.find((row) => row.key === "secondFloor")?.panels || 0} шт
                  </strong>
                </div>
                </>
              ) : null}
                <div className="readout">
                  <span>Цена панели потолка</span>
                  <strong>
                    {formatNumber(
                      calculation.lines.find((line) => line.id === "sip:panel-ceiling")?.price || 0,
                    )} ₽/шт
                  </strong>
                </div>
            </div>
          </Section>
          <Section
            id="roof"
            number="06"
            title="Основная кровля"
            description="Форма, покрытие, свесы, стропильная система, обрешётка, фронтоны, доборы и слои."
          >
            <AutoLink
              label="Длина конька из плана"
              checked={links.roofRidgeFromPlan !== false}
              onChange={(value) =>
                write("settings.links.roofRidgeFromPlan", value)
              }
              hint={`Сейчас ${formatNumber(inputs.roof.ridgeLength)} м`}
            />
            {fields([
              {
                path: "settings.roof.shape",
                label: "Форма",
                type: "select",
                options: roofShapes,
              },
              {
                path: "settings.roof.ridgeAxis",
                label: "Направление конька",
                type: "select",
                options: [
                  { value: "x", label: "Вдоль длины дома" },
                  { value: "y", label: "Вдоль ширины дома" },
                ],
              },
              {
                path: "settings.roof.covering",
                label: "Кровельное покрытие",
                type: "select",
                options: roofCoverings,
              },
              {
                path: "settings.roof.type",
                label: "Тип",
                type: "select",
                options: [
                  { value: "cold", label: "Холодная" },
                  { value: "sip", label: "Тёплая SIP" },
                  { value: "combo", label: "Комбинированная" },
                ],
              },
              project.settings.roof.shape === "gable" && {
                path: "settings.roof.ridgeHeight",
                label: "Высота конька",
                suffix: "м",
                min: 0.1,
              },
              {
                path: "settings.roof.ridgeLength",
                label: "Длина конька",
                suffix: "м",
                value: inputs.roof.ridgeLength,
                disabled: links.roofRidgeFromPlan !== false,
                disableLink: "roofRidgeFromPlan",
              },
              {
                path: "settings.roof.eaveOverhang",
                label: "Карнизный свес",
                suffix: "м",
                max: 2,
                step: 0.05,
              },
              {
                path: "settings.roof.gableOverhang",
                label: "Торцевой свес",
                suffix: "м",
                max: 2,
                step: 0.05,
              },
              {
                path: "settings.roof.wastePercent",
                label: "Запас",
                suffix: "%",
                step: 1,
              },
              project.settings.roof.type === "combo" && {
                path: "settings.roof.warmPercent",
                label: "Тёплая часть",
                suffix: "%",
                max: 100,
                step: 5,
              },
              {
                path: "settings.roof.structureMode",
                label: "Режим",
                type: "select",
                options: [
                  { value: "auto", label: "Автоматически" },
                  { value: "manual", label: "Ручной" },
                ],
              },
              {
                path: "settings.roof.rafterSystem",
                label: "Стропильная система",
                type: "select",
                value:
                  project.settings.roof.structureMode === "auto"
                    ? calculation.roof.rafterStructure.system
                    : project.settings.roof.rafterSystem,
                disabled: project.settings.roof.structureMode === "auto",
                options: [
                  { value: "hanging", label: "Висячая" },
                  { value: "layered", label: "Наслонная" },
                  { value: "truss", label: "Ферма" },
                ],
              },
              {
                path: "settings.roof.rafterStep",
                label: "Шаг стропил",
                value:
                  project.settings.roof.structureMode === "auto"
                    ? calculation.roof.rafterStructure.step
                    : project.settings.roof.rafterStep,
                disabled: project.settings.roof.structureMode === "auto",
                suffix: "м",
                min: 0.3,
                max: 1.2,
                step: 0.05,
              },
              {
                path: "settings.roof.rafterSection",
                label: "Доска стропил",
                type: "select",
                value:
                  project.settings.roof.structureMode === "auto"
                    ? calculation.roof.rafterStructure.section
                    : project.settings.roof.rafterSection,
                disabled: project.settings.roof.structureMode === "auto",
                options: [
                  { value: "50x150", label: "50×150 мм" },
                  { value: "50x200", label: "50×200 мм" },
                ],
              },
              {
                path: "settings.roof.lathStep",
                label: "Шаг обрешётки",
                suffix: "м",
                min: 0.1,
                max: 1.2,
                step: 0.05,
              },
              {
                path: "settings.roof.mauerlatLayout",
                label: "Схема мауэрлата",
                type: "select",
                options: [
                  { value: "perimeter", label: "Весь наружный периметр" },
                  { value: "supports", label: "Только опорные стены" },
                  { value: "none", label: "Не учитывать" },
                ],
              },
              {
                path: "settings.roof.mauerlatFastener",
                label: "Крепление мауэрлата",
                type: "select",
                options: [
                  { value: "sip-screws", label: "Саморезы · SIP" },
                  { value: "anchors", label: "Анкеры · армопояс" },
                  { value: "none", label: "Не учитывать" },
                ],
              },
              {
                path: "settings.roof.rafterSupportConnection",
                label: "Опора стропил",
                type: "select",
                options: [
                  { value: "nails", label: "Гвоздевой узел по СП" },
                  { value: "angles", label: "Усиленные уголки" },
                ],
              },
              project.settings.roof.shape === "gable" && {
                path: "settings.roof.gableType",
                label: "Фронтоны",
                type: "select",
                options: [
                  { value: "auto", label: "По типу кровли" },
                  { value: "cold", label: "Каркасные · 50×150 + ОСБ" },
                  { value: "sip", label: "Из SIP-панелей" },
                  { value: "none", label: "Нет" },
                ],
              },
              project.settings.roof.shape === "gable" && {
                path: "settings.roof.gableCount",
                label: "Фронтонов",
                suffix: "шт",
                max: 2,
                step: 1,
                integer: true,
              },
            ])}
            <div className="toggle-grid parameter-roof-toggles">
              {[
                ["includeEaveTrim", "Карнизные планки", true],
                ["includeVergeTrim", "Торцевые планки", true],
                ["includeRidgeSeal", "Уплотнитель конька", true],
                ["includeGutter", "Водосток", false],
              ].map(([key, label, defaultOn]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={
                    defaultOn
                      ? project.settings.roof[key] !== false
                      : project.settings.roof[key] === true
                  }
                  onChange={(value) => write(`settings.roof.${key}`, value)}
                />
              ))}
            </div>
            <div className="parameter-layer-box">
              <strong>Слои кровли на плане</strong>
              <div className="toggle-grid">
                {[
                  ["showRoofCover", "Покрытие", true],
                  ["showMauerlat", "Мауэрлат", true],
                  ["showRafters", "Стропила", true],
                  ["showLath", "Обрешётка", true],
                  ["showCounterLath", "Контробрешётка", false],
                ].map(([key, label, defaultOn]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={
                      defaultOn
                        ? project.settings.roof[key] !== false
                        : project.settings.roof[key] === true
                    }
                    onChange={(value) => write(`settings.roof.${key}`, value)}
                  />
                ))}
              </div>
            </div>
          </Section>
          <Section
            id="extensions"
            number="07"
            title="Террасы и крыльцо"
            description="Ступени, фундамент, обвязка, кровля, свесы, фронтоны и столбы каждой площадки."
          >
            {project.plan.platforms.length ? (
              <div className="parameter-platform-list">
                {project.plan.platforms.map((platform, index) => (
                  <PlatformEditor
                    key={platform.id}
                    platform={platform}
                    index={index}
                    project={project}
                    update={updateEntity}
                  />
                ))}
              </div>
            ) : (
              <div className="parameter-info-note">
                Добавьте террасу или крыльцо на плане — здесь появятся все их
                параметры.
              </div>
            )}
          </Section>
          <Section
            id="openings"
            number="08"
            title="Окна, двери и ворота"
            description="Размеры, включение в смету и вычеты SIP."
          >
            {floorOpenings.length ? (
              <div className="parameter-opening-list">
                {floorOpenings.map(({ opening, floor }, index) => (
                  <OpeningEditor
                    key={`${floor}-${opening.id}`}
                    opening={opening}
                    index={index}
                    floor={floor}
                    commit={commit}
                    update={updateEntity}
                  />
                ))}
              </div>
            ) : (
              <div className="parameter-info-note">
                Проёмов нет. Добавьте их на плане.
              </div>
            )}
          </Section>
          <Section
            id="engineering"
            number="09"
            title="Инженерия и отделка"
          >
            <LinkedGroup
              title="Инженерия из плана"
              group="engineering"
              link="engineeringFromPlan"
              data={inputs.engineering}
              project={project}
              write={write}
              fields={fields}
              definitions={[
                ["cableRoute", "Кабельные трассы", "м"],
                ["electricPoints", "Электроточки", "шт"],
                ["waterPipe", "Водопровод", "м"],
                ["waterPoints", "Точки воды", "шт"],
                ["sewerLength", "Канализация", "м"],
                ["sewerPoints", "Точки канализации", "шт"],
                ["ventDuct", "Воздуховоды", "м"],
                ["ventGrilles", "Решётки", "шт"],
              ]}
            />
            <LinkedGroup
              title="Внутренняя отделка из плана"
              group="internal"
              link="internalFinishFromPlan"
              data={inputs.internal}
              project={project}
              write={write}
              fields={fields}
              definitions={[
                ["wallArea", "Стены", "м²"],
                ["ceilingArea", "Потолок", "м²"],
                ["laminateArea", "Ламинат", "м²"],
                ["tileArea", "Плитка", "м²"],
                ["doors", "Двери", "шт"],
              ]}
            />
            <LinkedGroup
              title="Наружная отделка из плана"
              group="external"
              link="externalFinishFromPlan"
              data={inputs.external}
              project={project}
              write={write}
              fields={fields}
              definitions={[
                ["facadeArea", "Фасад", "м²"],
                ["windArea", "Ветрозащита", "м²"],
                ["insulationArea", "Утепление", "м²"],
                ["metalArea", "Профлист", "м²"],
                ["soffitArea", "Подшива свесов", "м²"],
              ]}
            />
            <div className="parameter-subgroup">
              <strong>Дополнительно по фасаду</strong>
              {fields([
                {
                  path: "settings.external.woodArea",
                  label: "Деревянная отделка",
                  suffix: "м²",
                },
                {
                  path: "settings.external.cornerLength",
                  label: "Наружные углы",
                  suffix: "м",
                },
              ])}
            </div>
          </Section>
          <Section
            id="delivery"
            number="10"
            title="Доставка и печать"
            description="Логистика и состав схем коммерческого предложения."
          >
            <AutoLink
              label="Объём груза из плана"
              checked={links.deliveryVolumeFromPlan !== false}
              onChange={(value) =>
                write("settings.links.deliveryVolumeFromPlan", value)
              }
              hint={`Сейчас ${formatNumber(inputs.delivery.cargoVolume)} м³`}
            />
            {fields([
              {
                path: "settings.delivery.distance",
                label: "Расстояние",
                suffix: "км",
              },
              {
                path: "settings.delivery.trips",
                label: "Рейсов",
                suffix: "шт",
                min: 1,
                step: 1,
                integer: true,
              },
              {
                path: "settings.delivery.cargoVolume",
                label: "Объём груза",
                suffix: "м³",
                value: inputs.delivery.cargoVolume,
                disabled: links.deliveryVolumeFromPlan !== false,
                disableLink: "deliveryVolumeFromPlan",
              },
              {
                path: "settings.delivery.baseTrip",
                label: "База рейса",
                suffix: "₽",
                step: 100,
              },
              {
                path: "settings.delivery.perKm",
                label: "Цена километра",
                suffix: "₽",
                step: 1,
              },
              {
                path: "settings.delivery.unloadingPerM3",
                label: "Разгрузка",
                suffix: "₽/м³",
                step: 10,
              },
            ])}
            <div className="parameter-layer-box">
              <strong>Печатные схемы</strong>
              <div className="toggle-grid">
                {[
                  ["includePlan", "План дома", true],
                  ["includeRoof", "Крыша на контуре", false],
                  ["showContour", "Контур дома", true],
                  ["showRooms", "Комнаты", true],
                  ["showOpenings", "Окна и двери", true],
                  ["showPlatforms", "Пристройки", true],
                  ["showPiles", "Сваи", true],
                  ["showBinding", "Обвязка", true],
                  ["showDimensions", "Размеры", true],
                ].map(([key, label, defaultOn]) => (
                  <Toggle
                    key={key}
                    label={label}
                    checked={
                      defaultOn
                        ? project.settings.print[key] !== false
                        : project.settings.print[key] === true
                    }
                    onChange={(value) => write(`settings.print.${key}`, value)}
                  />
                ))}
              </div>
            </div>
          </Section>
        </main>
        <Navigator items={checklist} />
      </div>
    </div>
  );
}

function PlatformEditor({ platform, index, project, update }) {
  const set = (path, value) => update("platforms", platform.id, path, value);
  const roof = calculateTerraceRoof(platform, project.plan.house, {
    wallPanelThickness: Number(project.settings.sip.wallThickness),
  });
  return (
    <article>
      <header>
        <div>
          <span>Площадка {index + 1}</span>
          <strong>
            {platform.kind === "porch" ? "Крыльцо" : "Терраса"} ·{" "}
            {formatNumber(platform.w * platform.h)} м²
          </strong>
        </div>
        <Toggle
          label="Учитывать"
          checked={platform.include !== false}
          onChange={(value) => set("include", value)}
        />
      </header>
      <div className="form-grid four">
        <SelectField
          label="Тип"
          value={platform.kind}
          onChange={(value) => set("kind", value)}
          options={[
            { value: "terrace", label: "Терраса" },
            { value: "porch", label: "Крыльцо" },
          ]}
        />
        {[
          ["w", "Ширина", "м"],
          ["h", "Глубина", "м"],
          ["steps", "Ступени", "шт"],
          ["stairWidth", "Ширина лестницы", "м"],
          ["riser", "Высота ступени", "м"],
          ["tread", "Глубина ступени", "м"],
        ].map(([key, label, suffix]) => (
          <NumberField
            key={key}
            label={label}
            value={platform[key] || 0}
            suffix={suffix}
            min={0}
            step={key === "steps" ? 1 : 0.01}
            onChange={(value) =>
              set(key, key === "steps" ? Math.round(value) : value)
            }
          />
        ))}
        <SelectField
          label="Сторона лестницы"
          value={platform.stairSide || "bottom"}
          onChange={(value) => set("stairSide", value)}
          options={[
            { value: "top", label: "Сверху" },
            { value: "right", label: "Справа" },
            { value: "bottom", label: "Снизу" },
            { value: "left", label: "Слева" },
          ]}
        />
        <SelectField
          label="Сваи"
          value={platform.foundation.mode}
          onChange={(value) => set("foundation.mode", value)}
          options={[
            { value: "shared", label: "Общие с домом" },
            { value: "separate", label: "Отдельные" },
            { value: "none", label: "Нет" },
          ]}
        />
        <SelectField
          label="Обвязка"
          value={platform.binding.mode}
          onChange={(value) => set("binding.mode", value)}
          options={[
            { value: "shared", label: "Общая с домом" },
            { value: "separate", label: "Отдельная" },
            { value: "none", label: "Нет" },
          ]}
        />
        <SelectField
          label="Кровля"
          value={platform.roof.mode}
          onChange={(value) => set("roof.mode", value)}
          options={[
            { value: "none", label: "Нет" },
            { value: "cold", label: "Холодная" },
            { value: "warm", label: "Тёплая SIP" },
          ]}
        />
        {platform.roof.mode !== "none" ? (
          <>
            <SelectField
              label="Форма кровли"
              value={platform.roof.shape}
              onChange={(value) => set("roof.shape", value)}
              options={[
                { value: "shed", label: "Односкатная" },
                { value: "continuation", label: "Продолжение ската" },
                { value: "gable", label: "Двускатная" },
              ]}
            />
            <SelectField
              label="Площадь"
              value={platform.roof.areaMode}
              onChange={(value) => set("roof.areaMode", value)}
              options={[
                { value: "auto", label: "По геометрии" },
                { value: "manual", label: "Вручную" },
              ]}
            />
            {platform.roof.areaMode === "manual" ? (
              <NumberField
                label="Ручная площадь"
                value={platform.roof.manualArea}
                suffix="м²"
                onChange={(value) => set("roof.manualArea", value)}
              />
            ) : null}
            {[
              ["frontOverhang", "Фронтальный свес"],
              ["sideOverhang", "Боковой свес"],
              ["highHeight", "Высокая сторона"],
              ["lowHeight", "Низкая сторона"],
            ].map(([key, label]) => (
              <NumberField
                key={key}
                label={label}
                value={platform.roof[key]}
                suffix="м"
                step={0.05}
                onChange={(value) => set(`roof.${key}`, value)}
              />
            ))}
            {platform.roof.shape === "gable" ? (
              <>
                <NumberField
                  label="Высота конька"
                  value={platform.roof.ridgeHeight}
                  suffix="м"
                  onChange={(value) => set("roof.ridgeHeight", value)}
                />
                <SelectField
                  label="Фронтоны"
                  value={platform.roof.gableType}
                  onChange={(value) => set("roof.gableType", value)}
                  options={[
                    { value: "auto", label: "По типу" },
                    { value: "cold", label: "Каркасные · 50×150 + ОСБ" },
                    { value: "sip", label: "Из SIP-панелей" },
                    { value: "none", label: "Нет" },
                  ]}
                />
                <NumberField
                  label="Фронтонов"
                  value={platform.roof.gableCount}
                  suffix="шт"
                  max={2}
                  step={1}
                  onChange={(value) =>
                    set("roof.gableCount", Math.round(value))
                  }
                />
              </>
            ) : null}
            <SelectField
              label="Сечение столбов"
              value={platform.roof.postSection}
              onChange={(value) => set("roof.postSection", value)}
              options={[
                { value: "auto", label: "Авто" },
                { value: "100x100", label: "100×100 мм" },
                { value: "150x100", label: "150×100 мм" },
              ]}
            />
            <NumberField
              label="Запас"
              value={platform.roof.wastePercent}
              suffix="%"
              step={1}
              onChange={(value) => set("roof.wastePercent", value)}
            />
            <div className="readout">
              <span>Кровля</span>
              <strong>{formatNumber(roof.netArea)} м²</strong>
            </div>
            <div className="readout">
              <span>Опоры</span>
              <strong>
                {roof.postCount} шт · {roof.postSection.replace("x", "×")}
              </strong>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}

function OpeningEditor({ opening, index, floor, commit, update }) {
  const kind =
    opening.type === "window" ? "window" : opening.doorType || "entrance";
  const changeKind = (value) =>
    commit((next) => {
      const floorPlan =
        floor === 1 ? next.plan : next.upperFloors?.[floor - 2];
      const item = floorPlan?.openings?.find(
        (candidate) => candidate.id === opening.id,
      );
      if (!item) return next;
      item.type = value === "window" ? "window" : "door";
      if (value !== "window") item.doorType = value;
      item.outer = value !== "interior";
      return next;
    });
  return (
    <article>
      <header>
        <strong>
          {index + 1}.{" "}
          {kind === "window"
            ? "Окно"
            : kind === "garage"
              ? "Гаражные ворота"
              : kind === "interior"
                ? "Межкомнатная дверь"
                : "Входная дверь"}
          {` · ${floor} этаж`}
        </strong>
        <span>{formatNumber(opening.width * opening.height, 2)} м²</span>
      </header>
      <div className="form-grid four">
        <SelectField
          label="Изделие"
          value={kind}
          onChange={changeKind}
          options={[
            { value: "window", label: "Окно" },
            { value: "entrance", label: "Входная дверь" },
            { value: "interior", label: "Межкомнатная дверь" },
            { value: "garage", label: "Гаражные ворота" },
          ]}
        />
        <NumberField
          label="Ширина"
          value={opening.width}
          suffix="м"
          min={0.2}
          step={0.05}
          onChange={(value) =>
            update("openings", opening.id, "width", value, floor - 1)
          }
        />
        <NumberField
          label="Высота"
          value={opening.height}
          suffix="м"
          min={0.2}
          step={0.05}
          onChange={(value) =>
            update("openings", opening.id, "height", value, floor - 1)
          }
        />
        <Toggle
          label="Изделие в смете"
          checked={opening.includeInEstimate !== false}
          onChange={(value) =>
            update(
              "openings",
              opening.id,
              "includeInEstimate",
              value,
              floor - 1,
            )
          }
        />
        <Toggle
          label="Вычетать из SIP"
          checked={opening.subtractFromSip !== false}
          onChange={(value) =>
            update(
              "openings",
              opening.id,
              "subtractFromSip",
              value,
              floor - 1,
            )
          }
        />
      </div>
    </article>
  );
}

function LinkedGroup({
  title,
  group,
  link,
  data,
  project,
  write,
  fields,
  definitions,
}) {
  const automatic = project.settings.links[link] !== false;
  const editor = fields(
    definitions.map(([key, label, suffix]) => ({
      path: `settings.${group}.${key}`,
      label,
      suffix,
      value: data[key],
      disabled: automatic,
      disableLink: link,
      step: suffix === "шт" ? 1 : 0.1,
    })),
  );
  return (
    <div className="parameter-subgroup">
      <AutoLink
        label={title}
        checked={automatic}
        onChange={(value) => write(`settings.links.${link}`, value)}
      />
      {editor}
    </div>
  );
}
