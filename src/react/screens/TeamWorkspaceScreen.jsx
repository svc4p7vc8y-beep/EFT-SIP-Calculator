import { useState } from "react";
import {
  FileClock,
  FilePlus2,
  Inbox,
  LogOut,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { useTeam } from "../cloud/TeamContext.jsx";
import { clientBriefSummary } from "../storage/client-brief.js";

const roleNames = {
  admin: "Администратор",
  manager: "Менеджер",
  estimator: "Сметчик",
  viewer: "Просмотр",
};

export default function TeamWorkspaceScreen({
  project,
  onOpenProject,
  onImportIntake,
}) {
  const team = useTeam();
  const [tab, setTab] = useState("projects");
  const [notice, setNotice] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "manager",
  });
  const create = async () => {
    try {
      const result = await team.createProject(project);
      setNotice(`Создан общий проект «${result.name}»`);
    } catch (error) {
      setNotice(error.message);
    }
  };
  const addUser = async (event) => {
    event.preventDefault();
    try {
      await team.createUser(newUser);
      setNewUser({
        username: "",
        displayName: "",
        password: "",
        role: "manager",
      });
      setNotice("Сотрудник создан");
    } catch (error) {
      setNotice(error.message);
    }
  };
  return (
    <section className="screen team-workspace">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Общее пространство</p>
          <h1>Проекты и заявки</h1>
          <p>
            {team.user?.displayName} · {roleNames[team.user?.role]}
          </p>
        </div>
        <div className="screen-actions">
          <button className="button secondary" onClick={() => team.refresh()}>
            <RefreshCw />
            Обновить
          </button>
          <button className="button secondary" onClick={team.logout}>
            <LogOut />
            Выйти
          </button>
        </div>
      </header>
      <div className={`cloud-status ${team.syncState.status}`}>
        {team.syncState.message}
      </div>
      <div className="team-tabs">
        <button
          className={tab === "projects" ? "active" : ""}
          onClick={() => setTab("projects")}
        >
          <FileClock />
          Проекты <b>{team.projects.length}</b>
        </button>
        <button
          className={tab === "intakes" ? "active" : ""}
          onClick={() => setTab("intakes")}
        >
          <Inbox />
          Анкеты <b>{team.intakes.length}</b>
        </button>
        {team.user?.role === "admin" ? (
          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            <Users />
            Сотрудники <b>{team.users.length}</b>
          </button>
        ) : null}
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      {tab === "projects" ? (
        <div className="team-panel">
          <div className="team-panel-head">
            <div>
              <h2>Общие проекты</h2>
              <p>
                Доступны всем сотрудникам. Изменения сохраняются с историей
                версий.
              </p>
            </div>
            <button className="button" onClick={create}>
              <FilePlus2 />
              Сохранить текущий как общий
            </button>
          </div>
          <div className="team-list">
            {team.projects.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.updated_by} ·{" "}
                    {new Date(item.updated_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <em>рев. {item.revision}</em>
                <button
                  className="button secondary"
                  onClick={() => onOpenProject(item.id)}
                >
                  Открыть
                </button>
              </article>
            ))}
            {!team.projects.length ? (
              <p className="empty-state">Общих проектов пока нет.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {tab === "intakes" ? (
        <div className="team-panel">
          <div className="team-panel-head">
            <div>
              <h2>Входящие анкеты</h2>
              <p>
                Клиент видит только номер заявки. Импорт выполняет сотрудник
                после проверки.
              </p>
            </div>
          </div>
          <div className="team-list">
            {team.intakes.map((item) => {
              const summary =
                item.payload?.format === "eft-client-brief"
                  ? clientBriefSummary(item.payload)
                  : null;
              return (
                <article key={item.id}>
                  <div>
                    <strong>
                      {item.public_number} · {item.customer_name}
                    </strong>
                    <span>
                      {summary
                        ? `${summary.buildingType} · ${summary.dimensions}`
                        : item.payload?.project || "Короткая заявка"}{" "}
                      · {item.phone || item.email}
                    </span>
                  </div>
                  <em>{item.status}</em>
                  <button
                    className="button secondary"
                    onClick={() => onImportIntake(item)}
                  >
                    Создать черновик
                  </button>
                </article>
              );
            })}
            {!team.intakes.length ? (
              <p className="empty-state">Новых анкет пока нет.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {tab === "users" ? (
        <div className="team-panel">
          <div className="team-panel-head">
            <div>
              <h2>Сотрудники</h2>
              <p>У каждого свой логин, роль и запись действий.</p>
            </div>
          </div>
          <div className="team-list">
            {team.users.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.display_name}</strong>
                  <span>
                    {item.username} · {roleNames[item.role]}
                  </span>
                </div>
                <em>{item.active ? "активен" : "отключён"}</em>
              </article>
            ))}
          </div>
          <form className="team-user-form" onSubmit={addUser}>
            <h3>
              <UserPlus />
              Добавить сотрудника
            </h3>
            <input
              placeholder="Логин латиницей"
              value={newUser.username}
              onChange={(event) =>
                setNewUser({ ...newUser, username: event.target.value })
              }
              required
            />
            <input
              placeholder="Имя сотрудника"
              value={newUser.displayName}
              onChange={(event) =>
                setNewUser({ ...newUser, displayName: event.target.value })
              }
              required
            />
            <input
              type="password"
              minLength="12"
              placeholder="Временный пароль, от 12 символов"
              value={newUser.password}
              onChange={(event) =>
                setNewUser({ ...newUser, password: event.target.value })
              }
              required
            />
            <select
              value={newUser.role}
              onChange={(event) =>
                setNewUser({ ...newUser, role: event.target.value })
              }
            >
              <option value="manager">Менеджер</option>
              <option value="estimator">Сметчик</option>
              <option value="viewer">Просмотр</option>
              <option value="admin">Администратор</option>
            </select>
            <button className="button">Создать</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
