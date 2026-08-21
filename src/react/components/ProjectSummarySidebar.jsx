import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  HardHat,
  Home,
  Layers3,
  PanelTop,
  Ruler,
  Trees,
} from "lucide-react";
import { planIssues } from "../planner/geometry.js";
import { formatNumber } from "../utils/format.js";

const ROOF_TYPES = {
  cold: "Холодная",
  sip: "Тёплая SIP",
  combo: "Комбинированная",
};
const ROOF_SHAPES = { flat: "Плоская", gable: "Двускатная", hip: "Вальмовая" };
const PANEL_FAMILIES = { pps: "PPS", "mineral-wool": "минвата", "csp-pps": "CSP PPS" };
const CONNECTOR_TYPES = {
  thermal: "Термобрус",
  "board-pack": "Клеёный пакет досок",
  solid: "Брус естественной влажности",
};

function SummaryValue({ label, value, tone }) {
  return (
    <div className={`summary-value ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummarySection({ title, icon: Icon, target, onNavigate, open, onToggle, children }) {
  return (
    <section className={`summary-section ${open ? "open" : ""}`}>
      <button
        className="summary-section-title"
        onClick={onToggle}
        aria-expanded={open}
      >
        <Icon />
        <strong>{title}</strong>
        <ChevronRight />
      </button>
      {open ? (
        <div className="summary-section-body">
          {children}
          <button className="summary-open-calculator" onClick={() => onNavigate(target)}>
            Открыть раздел <ChevronRight />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function openingLabel(opening) {
  if (opening.type === "window") return "Окно";
  if (opening.doorType === "garage") return "Гаражные ворота";
  if (opening.doorType === "interior") return "Межкомнатная дверь";
  return "Входная дверь";
}

function SectionMaterials({ calculation, sectionKey }) {
  const lines = calculation.sections?.find((section) => section.key === sectionKey)?.lines
    ?.filter((line) => line.kind !== "labor") || [];
  if (!lines.length) return <p className="summary-detail">Материалы раздела пока не рассчитаны.</p>;
  return (
    <div className="summary-estimate-materials">
      <h3>Материалы в смете</h3>
      {lines.map((line) => (
        <div key={line.id}>
          <span>{line.name}</span>
          <strong>{formatNumber(line.qty, Number(line.qty) % 1 ? 2 : 0)} {line.unit}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ProjectSummarySidebar({
  project,
  calculation,
  onNavigate,
}) {
  const [openSection, setOpenSection] = useState("home");
  const { plan } = project;
  const contourMissing = plan.house?.contourDefined === false;
  const { metrics, foundation, roof } = calculation;
  const issues = planIssues(plan);
  const openings = plan.openings || [];
  const windows = openings.filter((item) => item.type === "window").length;
  const doors = openings.filter(
    (item) => item.type === "door" && item.doorType !== "garage",
  ).length;
  const garage = openings.filter((item) => item.doorType === "garage").length;
  const activeEngineering = [
    project.services.engineeringElectric && "Электрика",
    project.services.engineeringPlumbing && "Водоснабжение",
    project.services.engineeringSewerage && "Канализация",
    project.services.engineeringVentilation && "Вентиляция",
  ].filter(Boolean);
  const activeScope = [
    project.services.foundation && "фундамент",
    project.services.sipFloor && "SIP-пол",
    project.services.sipWalls && "SIP-стены",
    project.services.sipCeiling && "SIP-потолок",
    project.services.partitions && "перегородки",
    project.services.roof && "кровля",
    project.services.terrace && "терраса",
    project.services.openings && "проёмы",
    project.services.delivery && "доставка",
  ].filter(Boolean);
  const sipConsumables = calculation.sip?.consumables;
  const structuralFastener = sipConsumables?.mode === "node"
    ? `${sipConsumables.totals?.structuralCount || 0} шт`
    : `${formatNumber((sipConsumables?.rows || []).reduce((sum, row) => sum + (Number(row.structuralKg) || 0), 0), 2)} кг`;

  return (
    <aside
      className="project-summary-sidebar"
      aria-label="Сводная ведомость проекта"
    >
      <header className="project-summary-header">
        <div>
          <span>Контрольная ведомость</span>
          <h2>Сводка проекта</h2>
        </div>
        <small>№ {project.meta?.projectNum || "—"}</small>
      </header>
      <div className={`summary-health ${issues.length || contourMissing ? "warning" : "ok"}`}>
        {issues.length || contourMissing ? <AlertTriangle /> : <CheckCircle2 />}
        <span>
          <strong>
            {contourMissing
              ? "Контур дома не задан"
              : issues.length
              ? `${issues.length} несостыковок`
              : "План согласован"}
          </strong>
          <small>
            {contourMissing
              ? "Нарисуйте и замкните внешний контур"
              : issues.length
              ? "Проверьте красные комнаты"
              : "Стены и площади состыкованы"}
          </small>
        </span>
      </div>
      <button
        className="summary-customer"
        onClick={() => onNavigate("parameters")}
      >
        <span>
          <strong>{project.meta?.customer || "Заказчик не указан"}</strong>
          <small>{project.meta?.address || "Адрес объекта не указан"}</small>
        </span>
        <ChevronRight />
      </button>

      <SummarySection
        title="Дом и помещения"
        icon={Home}
        target="plan"
        onNavigate={onNavigate}
        open={openSection === "home"}
        onToggle={() => setOpenSection((value) => value === "home" ? "" : "home")}
      >
        <div className="summary-grid">
          <SummaryValue
            label="Габариты"
            value={`${formatNumber(plan.house.w)} × ${formatNumber(plan.house.h)} м`}
          />
          <SummaryValue label="Этажи" value={`${project.meta?.floors || 1}`} />
          <SummaryValue
            label="Высота стен"
            value={`${formatNumber(plan.wallHeight)} м`}
          />
          <SummaryValue
            label="Пол"
            value={`${formatNumber(metrics.floorArea)} м²`}
          />
          <SummaryValue
            label="Помещения"
            value={`${formatNumber(metrics.roomArea)} м²`}
          />
          <SummaryValue
            label="Без комнат"
            value={`${formatNumber(metrics.unassignedArea)} м²`}
            tone={metrics.unassignedArea > 1 ? "attention" : ""}
          />
        </div>
      </SummarySection>

      <SummarySection
        title="Стены и SIP"
        icon={Layers3}
        target="sip"
        onNavigate={onNavigate}
        open={openSection === "sip"}
        onToggle={() => setOpenSection((value) => value === "sip" ? "" : "sip")}
      >
        <div className="summary-grid">
          <SummaryValue
            label="Наружные"
            value={`${formatNumber(metrics.exteriorWallNetArea)} м²`}
          />
          <SummaryValue
            label="Перегородки"
            value={`${formatNumber(metrics.partitionLength)} м`}
          />
          <SummaryValue
            label="Наружная панель"
            value={`${Math.round(plan.wallThickness * 1000)} мм`}
          />
          <SummaryValue
            label="Перегородка"
            value={`${Math.round(plan.partitionThickness * 1000)} мм`}
          />
        </div>
        <p className="summary-detail">
          SIP: пол {PANEL_FAMILIES[project.settings.sip.floorPanelFamily] || "PPS"} {project.settings.sip.floorThickness}, стены{" "}
          {PANEL_FAMILIES[project.settings.sip.wallPanelFamily] || "PPS"} {project.settings.sip.wallThickness}, потолок{" "}
          {PANEL_FAMILIES[project.settings.sip.ceilingPanelFamily] || "PPS"} {project.settings.sip.ceilingThickness} мм
        </p>
        <p className="summary-detail">Перегородки: {project.settings.sip.partitionType === "sip" ? `${PANEL_FAMILIES[project.settings.sip.partitionPanelFamily] || "PPS"} ${project.settings.sip.partitionThickness || "124"} мм` : "каркасные"}</p>
        <p className="summary-detail">
          Шаг раскладки: пол{" "}
          {Math.round(
            Number(project.settings.sip.floorPanelWidth || 1.25) * 1000,
          )}{" "}
          мм · потолок{" "}
          {Math.round(
            Number(project.settings.sip.ceilingPanelWidth || 1.25) * 1000,
          )}{" "}
          мм
        </p>
        <p className="summary-detail">
          {CONNECTOR_TYPES[project.settings.sip.connectorType] || "Термобрус"}
        </p>
        <div className="summary-breakdown" aria-label="Полный раскрой SIP">
          <h3>Раскрой SIP-панелей</h3>
          {(calculation.sip?.cutting || []).map((row) => (
            <div className="summary-material-card" key={row.key}>
              <header><strong>{row.label}</strong><b>{row.panels} пан.</b></header>
              <dl>
                <div><dt>Чистая площадь</dt><dd>{formatNumber(row.area)} м²</dd></div>
                <div><dt>Раскладка</dt><dd>{Math.round(row.layoutWidth * 1000)} мм</dd></div>
                <div><dt>Закупка</dt><dd>{formatNumber(row.purchasedArea)} м²</dd></div>
                <div><dt>Остаток</dt><dd>{formatNumber(row.offcutArea)} м²</dd></div>
                <div><dt>Резка</dt><dd>{formatNumber(row.cutMeters)} м</dd></div>
              </dl>
            </div>
          ))}
          <h3>Соединения и крепёж</h3>
          {(calculation.sip?.joinery?.rows || []).map((row) => (
            <div className="summary-material-line" key={row.key}>
              <span>{row.label}</span>
              <strong>{formatNumber(row.jointLength)} м стыков · {formatNumber(row.endBoardLength)} м торцов</strong>
            </div>
          ))}
          <div className="summary-material-line accent">
            <span>Пеноклей / крепёж</span>
            <strong>
              {sipConsumables?.totals?.foamUnits || 0} бал. · крепёж {structuralFastener}
            </strong>
          </div>
        </div>
      </SummarySection>

      <SummarySection
        title="Сваи и обвязка"
        icon={HardHat}
        target="piles"
        onNavigate={onNavigate}
        open={openSection === "piles"}
        onToggle={() => setOpenSection((value) => value === "piles" ? "" : "piles")}
      >
        <div className="summary-grid">
          <SummaryValue
            label="Всего свай"
            value={`${foundation.totalPiles} шт`}
          />
          <SummaryValue
            label="Обвязка"
            value={`${formatNumber(foundation.bindingLength)} м`}
          />
          <SummaryValue
            label="Доски 6 м"
            value={`${foundation.boardCount} шт`}
          />
          <SummaryValue
            label="Объём доски"
            value={`${formatNumber(foundation.boardVolume, 3)} м³`}
          />
          <SummaryValue
            label="Шаг не более"
            value={`${formatNumber(project.settings.piles.spacing)} м`}
          />
          <SummaryValue
            label="Общие с террасой"
            value={`${foundation.sharedPiles} шт`}
          />
        </div>
        <SectionMaterials calculation={calculation} sectionKey="foundation" />
      </SummarySection>

      <SummarySection
        title="Кровля"
        icon={Ruler}
        target="roof"
        onNavigate={onNavigate}
        open={openSection === "roof"}
        onToggle={() => setOpenSection((value) => value === "roof" ? "" : "roof")}
      >
        <div className="summary-grid">
          <SummaryValue
            label="Форма"
            value={ROOF_SHAPES[project.settings.roof.shape || "gable"]}
          />
          <SummaryValue
            label="Тип"
            value={ROOF_TYPES[project.settings.roof.type] || "—"}
          />
          <SummaryValue
            label="Покрытие"
            value={project.settings.roof.covering === "metal-tile" ? "Металлочерепица" : project.settings.roof.covering === "soft" ? "Мягкая + OSB" : "Профлист С-21"}
          />
          <SummaryValue
            label="Стропила"
            value={(
              roof.rafterStructure?.section ||
              project.settings.roof.rafterSection ||
              "50x150"
            ).replace("x", "×")}
          />
          <SummaryValue
            label="Чистый шаг"
            value={`${formatNumber(roof.rafterStructure?.step || 0.6)} м`}
          />
          <SummaryValue
            label="Пар"
            value={`${roof.rafterStructure?.pairCount || 0} шт`}
          />
          <SummaryValue
            label="Обрешётка"
            value={`${formatNumber(roof.lathStep || 0.35, 2)} м`}
          />
          <SummaryValue
            label="Доски 6 м"
            value={`${roof.rafterBoardCount || 0} шт`}
          />
          <SummaryValue
            label="Водосток"
            value={
              project.settings.roof.includeGutter === true
                ? `${formatNumber(roof.gutterLength)} м`
                : "нет"
            }
          />
          <SummaryValue
            label="Скаты"
            value={`${formatNumber((roof.coldSlopeArea || 0) + (roof.warmSlopeArea || 0))} м²`}
          />
          <SummaryValue
            label="Фронтоны"
            value={`${formatNumber(roof.gableArea)} м²`}
          />
          <SummaryValue
            label="Столбы террас"
            value={`${roof.terracePostCount || 0} шт`}
          />
          <SummaryValue
            label="Всего"
            value={`${formatNumber(roof.totalArea)} м²`}
          />
          <SummaryValue
            label="Коэффициенты"
            value={project.settings.roof.shape === "hip" ? "+25% мат. / +50% раб." : "базовые"}
          />
        </div>
        <p className="summary-detail">
          {project.settings.roof.shape === "flat"
            ? `Плоская кровля: длина ${formatNumber(project.settings.roof.ridgeLength)} м`
            : `Конёк: высота ${formatNumber(project.settings.roof.ridgeHeight)} м · длина ${formatNumber(project.settings.roof.ridgeLength)} м · ${roof.rafterStructure?.system === "layered" ? "наслонная система" : roof.rafterStructure?.system === "truss" ? "стропильные фермы" : "висячая система"}`}
        </p>
        <SectionMaterials calculation={calculation} sectionKey="roof" />
      </SummarySection>

      <SummarySection
        title="Террасы и крыльцо"
        icon={Trees}
        target="terrace"
        onNavigate={onNavigate}
        open={openSection === "terrace"}
        onToggle={() => setOpenSection((value) => value === "terrace" ? "" : "terrace")}
      >
        <div className="summary-grid">
          <SummaryValue
            label="Площадок"
            value={`${plan.platforms?.length || 0} шт`}
          />
          <SummaryValue
            label="Площадь"
            value={`${formatNumber(metrics.platformArea)} м²`}
          />
        </div>
        {(plan.platforms || []).map((platform) => (
          <p className="summary-detail" key={platform.id}>
            {platform.kind === "porch" ? "Крыльцо" : "Терраса"}{" "}
            {formatNumber(platform.w)} × {formatNumber(platform.h)} м ·{" "}
            {platform.roof?.mode === "none"
              ? "без кровли"
              : platform.roof?.mode === "warm"
                ? "тёплая кровля"
                : "холодная кровля"}
          </p>
        ))}
        <SectionMaterials calculation={calculation} sectionKey="terrace" />
      </SummarySection>

      <SummarySection
        title="Окна, двери, ворота"
        icon={PanelTop}
        target="openings"
        onNavigate={onNavigate}
        open={openSection === "openings"}
        onToggle={() => setOpenSection((value) => value === "openings" ? "" : "openings")}
      >
        <div className="summary-grid three">
          <SummaryValue label="Окна" value={`${windows}`} />
          <SummaryValue label="Двери" value={`${doors}`} />
          <SummaryValue label="Ворота" value={`${garage}`} />
        </div>
        <div className="summary-openings">
          {openings.length ? (
            openings.map((opening, index) => (
              <div key={opening.id}>
                <span>
                  {index + 1}. {openingLabel(opening)}
                </span>
                <strong>
                  {Math.round(opening.width * 1000)} ×{" "}
                  {Math.round(opening.height * 1000)}
                </strong>
              </div>
            ))
          ) : (
            <p>Проёмы не заданы</p>
          )}
        </div>
        <SectionMaterials calculation={calculation} sectionKey="openings" />
      </SummarySection>

      <SummarySection
        title="Комплектация"
        icon={DoorOpen}
        target="parameters"
        onNavigate={onNavigate}
        open={openSection === "parameters"}
        onToggle={() => setOpenSection((value) => value === "parameters" ? "" : "parameters")}
      >
        <p className="summary-detail">
          В расчёте:{" "}
          {activeScope.length ? activeScope.join(", ") : "разделы не выбраны"}
        </p>
        <p className="summary-detail">
          Инженерия:{" "}
          {activeEngineering.length
            ? activeEngineering.join(", ")
            : "не выбрана"}
        </p>
        <p className="summary-detail">
          Отделка:{" "}
          {project.services.internalFinish ? "внутренняя" : "без внутренней"} ·{" "}
          {project.services.externalFinish ? "наружная" : "без наружной"}
        </p>
        <p className="summary-detail">
          Доставка: {formatNumber(project.settings.delivery.distance)} км ·{" "}
          {project.settings.delivery.trips} рейс.
        </p>
      </SummarySection>
    </aside>
  );
}
