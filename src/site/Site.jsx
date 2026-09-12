import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Menu,
  X,
} from "lucide-react";
import { asset, houses, projectCategories } from "./data.js";
import Panels from "./Panels.jsx";
import HeroPhoto from "./HeroPhoto.jsx";
import Locations from "./Locations.jsx";
import { AnimatedLogo, ScrollProgress, useSiteMotion } from "./Motion.jsx";
import { submitPublicIntake } from "../shared/team-api.js";

const ProjectDialog = lazy(() => import("./ProjectDialog.jsx"));
const nav = [
  ["projects", "Проекты"],
  ["panels", "СИП и товары"],
  ["technology", "Технология"],
  ["contact", "Контакты"],
];

function ProjectCard({ project, onOpen, index = 0 }) {
  return (
    <button
      className="house-card motion-card"
      style={{ "--reveal-index": index }}
      aria-label={`Открыть проект ${project.name}`}
      onPointerEnter={() => import("./ProjectDialog.jsx")}
      onFocus={() => import("./ProjectDialog.jsx")}
      onClick={() => onOpen(project)}
    >
      <div className="house-image">
        <img
          loading="lazy"
          src={asset(project.image)}
          alt={`Проект ${project.name} — пример фасада`}
        />
        <span className="view-label">
          Фасад и планировка
          <ArrowUpRight size={18} />
        </span>
        <span className="house-open">
          <ArrowUpRight />
        </span>
      </div>
      <div className="house-caption">
        <div>
          <h3>{project.name}</h3>
          <span>{project.mood}</span>
        </div>
        <span className="house-tag">{project.tag}</span>
      </div>
      <div className="house-meta">
        {project.meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </button>
  );
}

function ProjectCollection({ category, expanded, onOpen, onToggle }) {
  const firstProjects = category.projects.slice(0, 2);
  const moreProjects = category.projects.slice(2);
  const extraId = `${category.id}-more`;
  return (
    <section
      className={
        expanded
          ? "section projects-section project-collection is-expanded"
          : "section projects-section project-collection"
      }
      id={category.id}
      data-reveal
    >
      <div className="section-heading collection-heading">
        <div>
          <span className="section-number">
            {category.number} / {category.eyebrow}
          </span>
          <h2>
            {category.title}.<br />
            <span className="muted">{category.accent}</span>
          </h2>
        </div>
        <p>{category.description}</p>
      </div>
      <div className="catalog-toolbar">
        <span className="collection-count">
          {category.projects.length} проекта в подборке
        </span>
        <button
          className="collection-open"
          aria-expanded={expanded}
          aria-controls={extraId}
          onClick={() => onToggle(category.id)}
        >
          {expanded ? "Свернуть коллекцию" : "Вся коллекция"}
          {expanded ? (
            <ArrowDown className="turn-up" size={17} />
          ) : (
            <ArrowUpRight size={17} />
          )}
        </button>
      </div>
      <div className="houses-grid">
        {firstProjects.map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            index={index}
            onOpen={(item) => onOpen({ ...item, category: category.title })}
          />
        ))}
      </div>
      <div
        className="expanded-projects"
        id={extraId}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="houses-grid extra-houses-grid">
          {moreProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index + 2}
              onOpen={(item) => onOpen({ ...item, category: category.title })}
            />
          ))}
        </div>
      </div>
      {expanded ? (
        <button
          className="collection-close-bottom"
          onClick={() => onToggle(category.id)}
        >
          <ArrowDown className="turn-up" size={18} />
          Свернуть проекты
        </button>
      ) : null}
      <p className="catalog-note">
        Демонстрационные эскизы: размеры, состав и стоимость уточняются после
        обсуждения задачи.
      </p>
    </section>
  );
}

function Contact({ cart, selection, setSelection }) {
  const [submission, setSubmission] = useState({ status: "idle", message: "" });
  async function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const request = {
      format: "eft-site-inquiry",
      version: 1,
      createdAt: new Date().toISOString(),
      name: values.get("name").trim(),
      phone: values.get("phone").trim(),
      project: selection,
      products: cart,
      comment: values.get("comment").trim(),
      website: values.get("website"),
    };
    setSubmission({ status: "sending", message: "Отправляем заявку…" });
    try {
      const result = await submitPublicIntake(request);
      setSubmission({ status: "sent", message: `Заявка ${result.number} отправлена менеджеру.` });
      event.currentTarget.reset();
      setSelection("");
    } catch (error) {
      setSubmission({ status: "error", message: `Не удалось отправить: ${error.message}` });
    }
  }
  return (
    <section id="contact" className="contact-section" data-reveal>
      <div className="contact-image">
        <img
          data-parallax
          loading="lazy"
          src={asset("family.webp")}
          alt="Светлый дом с террасой — визуализация"
        />
        <div>
          <span className="brand-on-photo">
            <img src={asset("eft-logo.webp")} alt="ЭФТ" />
          </span>
          <p>
            Большие планы.
            <br />
            Своя история.
          </p>
        </div>
      </div>
      <div className="contact-content">
        <span className="section-number">06 / Следующий шаг</span>
        <h2>
          Начнём
          <br />с вашего дома.
        </h2>
        <p>
          Расскажите, что вы задумали.
          <br />
          Сохраните пожелания и выбранные товары в одну заявку.
        </p>
        <form onSubmit={submit} onChange={() => submission.status !== "idle" && setSubmission({ status: "idle", message: "" })}>
          <input className="visually-hidden" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" />
          <label className="field">
            Интересующий проект
            <select
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="">Помогите выбрать</option>
              {selection &&
                !houses.some((house) => house.name === selection) &&
                selection !== "Только СИП-панели" && (
                  <option>{selection}</option>
                )}
              {houses.map((house) => (
                <option key={house.id}>{house.name}</option>
              ))}
              <option>Только СИП-панели</option>
            </select>
          </label>
          <div className="form-row">
            <label className="field">
              Ваше имя
              <input
                name="name"
                autoComplete="name"
                required
                maxLength="100"
                pattern=".*\S.*"
                placeholder="Как к вам обращаться"
              />
            </label>
            <label className="field">
              Телефон
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                minLength="6"
                maxLength="30"
                placeholder="+7 (___) ___-__-__"
              />
            </label>
          </div>
          <label className="field">
            Пожелания
            <textarea
              name="comment"
              rows="2"
              maxLength="3000"
              placeholder="Участок, планировка, комплектация…"
            />
          </label>
          {cart.length > 0 && (
            <p className="request-count">
              В заявке: {cart.reduce((total, item) => total + item.quantity, 0)}{" "}
              шт. · {cart.length} поз.
            </p>
          )}
          <button className="btn primary" type="submit" disabled={submission.status === "sending"}>
            {submission.status === "sending" ? "Отправляем…" : "Отправить заявку"}
            <ArrowUpRight size={18} />
          </button>
          <small className="sample-note">
            Заявка попадёт в закрытое рабочее пространство ЭФТ. Калькулятор клиенту не открывается.
          </small>
          <div role="status" className={`feedback ${submission.status}`}>
            {submission.message && <><Check size={16} />{submission.message}</>}
          </div>
        </form>
        <a className="text-link" href="./EFT_client_questionnaire.html">
          Заполнить подробную анкету
          <ArrowUpRight size={18} />
        </a>
      </div>
    </section>
  );
}

export default function Site() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("projects");
  const [activeProject, setActiveProject] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [selection, setSelection] = useState("");
  function discuss(project) {
    setSelection(project);
    setActiveProject(null);
    requestAnimationFrame(() =>
      document
        .getElementById("contact")
        .scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        }),
    );
  }
  function toggleCategory(categoryId) {
    const closing = expandedCategory === categoryId;
    setExpandedCategory(closing ? null : categoryId);
    if (closing)
      setTimeout(
        () =>
          document
            .getElementById(categoryId)
            ?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "instant"
                : "smooth",
              block: "start",
            }),
        80,
      );
  }
  function collapseExpanded() {
    if (expandedCategory) toggleCategory(expandedCategory);
  }
  useSiteMotion();
  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = window.innerHeight * 0.4;
      let current = "projects";
      nav.forEach(([id]) => {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= marker)
          current = id;
      });
      setActiveNav((previous) => (previous === current ? previous : current));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#main">
        К содержанию
      </a>
      <header className="site-header">
        <a
          className="wordmark header-wordmark"
          href="#"
          aria-label="ЭФТ — на главную"
        >
          <AnimatedLogo />
          <span className="brand-caption">
            Энергоэффективные
            <br />
            технологии
          </span>
        </a>
        <nav
          className={menuOpen ? "site-nav open" : "site-nav"}
          id="main-navigation"
          aria-label="Основная навигация"
        >
          {nav.map(([id, label]) => (
            <a
              className={activeNav === id ? "active" : undefined}
              aria-current={activeNav === id ? "location" : undefined}
              key={id}
              href={`#${id}`}
              onClick={() => {
                setActiveNav(id);
                setMenuOpen(false);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <a
          className="btn outline header-cta"
          href="#contact"
          onClick={() => setActiveNav("contact")}
        >
          Обсудить проект
          <ArrowUpRight size={16} />
        </a>
        <button
          className="icon-btn menu-toggle"
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <div className="header-build-line" aria-hidden="true" />
      </header>
      <ScrollProgress
        expandedCategory={expandedCategory}
        onCollapse={collapseExpanded}
      />
      <main id="main">
        <section className="hero" data-reveal>
          <div className="hero-copy">
            <h1>
              Дом, в котором
              <br />
              всё на своём
              <br />
              <em>месте.</em>
            </h1>
            <p>
              Продуманные пространства для жизни.
              <br />
              Проекты и СИП-панели от ЭФТ.
            </p>
            <div className="hero-actions">
              <a className="btn primary" href="#projects">
                Выбрать проект
                <ArrowUpRight size={18} />
              </a>
              <a className="btn outline" href="#panels">
                Купить СИП-панели
              </a>
            </div>
            <a className="hero-scroll" href="#projects">
              <span className="round-arrow">
                <ArrowDown size={18} />
              </span>
              Найдите место для своей истории
            </a>
          </div>
          <HeroPhoto />
        </section>
        {projectCategories.map((category) => (
          <ProjectCollection
            key={category.id}
            category={category}
            expanded={expandedCategory === category.id}
            onOpen={setActiveProject}
            onToggle={toggleCategory}
          />
        ))}
        <section className="approach-strip" id="about">
          <span className="section-number">Подход ЭФТ</span>
          <p>
            Хороший проект начинается
            <br />с понимания <em>вашей задачи.</em>
          </p>
          <div>
            Сначала — привычки, пожелания и участок.
            <br />
            Затем — планировка и комплектация.
            <a className="text-link" href="./EFT_client_questionnaire.html">
              Расскажите о вашем проекте
              <ArrowUpRight size={18} />
            </a>
          </div>
        </section>
        <Panels cart={cart} setCart={setCart} />
        <section className="section technology-section" id="technology">
          <div className="section-heading">
            <div>
              <span className="section-number">05 / Технология</span>
              <h2>Понятно с первого слоя.</h2>
            </div>
            <p>
              Познакомьтесь с устройством панели
              <br />и соберите вопросы для вашего проекта.
            </p>
          </div>
          <div className="technology-content">
            <div className="layer-title">
              Три слоя.
              <br />
              <span>Одна панель.</span>
              <a href="#panels" className="text-link">
                Выбрать панели
                <ArrowRight size={18} />
              </a>
            </div>
            <div className="technology-details">
              {[
                ["01", "Наружная обшивка", "Плита OSB — наружный слой панели."],
                [
                  "02",
                  "Сердцевина",
                  "Теплоизоляционный слой между обшивками. Материал уточняется при заказе.",
                ],
                [
                  "03",
                  "Внутренняя обшивка",
                  "Вторая плита OSB завершает конструкцию панели.",
                ],
              ].map(([number, title, text]) => (
                <details key={number} open={number === "01"}>
                  <summary>
                    <span>{number}</span>
                    {title}
                    <span aria-hidden="true" className="details-plus">
                      +
                    </span>
                  </summary>
                  <p>{text}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <Contact
          cart={cart}
          selection={selection}
          setSelection={setSelection}
        />
        <Locations />
      </main>
      <footer className="site-footer">
        <div>
          <a className="wordmark" href="#" aria-label="ЭФТ — наверх">
            <img src={asset("eft-logo.webp")} alt="ЭФТ" />
          </a>
          <p>
            Ваш проект начинается
            <br />с хорошего плана.
          </p>
        </div>
        <nav aria-label="Навигация в подвале">
          <a href="#projects">Проекты</a>
          <a href="#panels">СИП и товары</a>
          <a href="./EFT_client_questionnaire.html">Анкета</a>
          <a href="https://calc.eftsip.ru" rel="nofollow">Вход для сотрудников</a>
        </nav>
        <div className="footer-note">
          ЭнергоЭффективные Технологии
          <small>
            Офис: Наро-Фоминск
            <br />
            Производство: Ермолино
          </small>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ЭФТ</span>
          <span>С заботой о пространстве для жизни.</span>
          <a href="#">
            Наверх
            <ArrowUpRight size={15} />
          </a>
        </div>
      </footer>
      {activeProject && (
        <Suspense
          fallback={
            <div className="dialog-loading" role="status">
              Открываем проект…
            </div>
          }
        >
          <ProjectDialog
            house={activeProject}
            onClose={() => setActiveProject(null)}
            onDiscuss={discuss}
          />
        </Suspense>
      )}
    </>
  );
}
