import { useEffect, useState } from "react";
import {
  FileClock,
  FilePlus2,
  Inbox,
  LogOut,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useTeam } from "../cloud/TeamContext.jsx";
import { clientBriefSummary } from "../storage/client-brief.js";
import { resolveEftApiUrl } from "../../shared/team-api.js";
import { PasswordInput } from "../components/ui.jsx";

const roleNames = {
  admin: "Администратор",
  manager: "Менеджер",
  estimator: "Сметчик",
  viewer: "Просмотр",
};

export default function TeamWorkspaceScreen({
  project,
  onOpenProject,
  onEditProject,
  onImportIntake,
  focusTab,
}) {
  const team = useTeam();
  const [tab, setTab] = useState("projects");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  useEffect(() => { if (focusTab) setTab(focusTab); }, [focusTab]);
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
  const removeItem = async (event) => {
    event.preventDefault();
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'intake') {
        await team.deleteIntake(deleteTarget.item.id, deletePassword);
        setNotice(`Анкета ${deleteTarget.item.public_number} перемещена в архив`);
      } else {
        await team.deleteProject(deleteTarget.item.id, deletePassword);
        setNotice(`Проект «${deleteTarget.item.name}» перемещён в архив`);
      }
      setDeleteTarget(null);
      setDeletePassword("");
    } catch (error) {
      setNotice(error.message);
    } finally { setDeleting(false); }
  };
  const editEmployee = async (event) => {
    event.preventDefault();
    setSavingUser(true);
    try {
      const result = await team.updateUser(editingUser);
      setEditingUser(null);
      setNotice(result.loggedOut ? 'Ваши данные изменены. Войдите повторно.' : 'Данные сотрудника сохранены. При смене пароля прежние сеансы завершатся.');
    } catch (error) { setNotice(error.message); }
    finally { setSavingUser(false); }
  };
  const attachmentUrl = (id) => `${resolveEftApiUrl()}?action=attachment&id=${encodeURIComponent(id)}`;
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
                  <div className="team-card-meta">
                    {item.summary?.number ? <span>№ {item.summary.number}</span> : null}
                    {item.summary?.buildingType ? <span>{item.summary.buildingType}</span> : null}
                    {item.summary?.floors ? <span>{item.summary.floors} эт.</span> : null}
                    {item.summary?.area ? <span>{item.summary.area} м²</span> : null}
                    {item.summary?.address ? <span>{item.summary.address}</span> : null}
                  </div>
                  <span>
                    Создан {new Date(item.created_at).toLocaleString("ru-RU")} · изменил {item.updated_by} {new Date(item.updated_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <em>рев. {item.revision}</em>
                <div className="team-row-actions">
                  <button className="button secondary" onClick={() => onOpenProject(item.id)}>Открыть</button>
                  {team.user?.role === 'admin' ? <button className="button secondary" onClick={() => onEditProject(item.id)}><Pencil /> Редактировать данные</button> : null}
                  {team.user?.role === "admin" ? <button className="button secondary danger" onClick={() => setDeleteTarget({ kind: 'project', item })} aria-label={`Удалить проект ${item.name}`}><Trash2 /></button> : null}
                </div>
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
                <article key={item.id} className={item.is_read ? "" : "unread"}>
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
                    <div className="team-card-meta">
                      <span>{new Date(item.created_at).toLocaleString("ru-RU")}</span>
                      {summary?.address ? <span>{summary.address}</span> : null}
                      {summary?.area ? <span>{summary.area}</span> : null}
                      {summary?.scope ? <span>{summary.scope}</span> : null}
                      {!summary && item.payload?.comment ? <span>{item.payload.comment}</span> : null}
                    </div>
                    {item.attachments?.length ? <div className="intake-attachments">
                      {item.attachments.map((file) => <a key={file.id} href={attachmentUrl(file.id)} target="_blank" rel="noreferrer">
                        {file.mime_type.startsWith("image/") ? <img src={attachmentUrl(file.id)} alt={file.original_name} /> : <span>PDF</span>}
                        <span>{file.original_name}</span>
                      </a>)}
                    </div> : null}
                  </div>
                  <em>{item.is_read ? item.status : "новая"}</em>
                  <div className="team-row-actions">
                    {!item.is_read ? <button className="button secondary" onClick={() => team.markIntakeRead(item.id)}>Просмотрено</button> : null}
                    {summary ? <button className="button secondary" onClick={() => { team.markIntakeRead(item.id).catch(() => {}); onImportIntake(item); }}>Создать черновик</button> : null}
                    {team.user?.role === "admin" ? <button className="button secondary danger" onClick={() => setDeleteTarget({ kind: 'intake', item })} aria-label={`Удалить анкету ${item.public_number}`}><Trash2 /></button> : null}
                  </div>
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
                <button type="button" className="button secondary" onClick={() => { setEditingUser({ id: item.id, username: item.username, displayName: item.display_name, role: item.role, active: Boolean(Number(item.active)), newPassword: '', adminPassword: '' }); setNotice(''); }} aria-label={`Изменить сотрудника ${item.display_name}`}><Pencil /> Изменить</button>
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
            <PasswordInput
              ariaLabel="Временный пароль сотрудника"
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
      {editingUser ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingUser(null)}>
        <form className="modal team-user-edit-dialog" role="dialog" aria-modal="true" aria-label="Редактирование сотрудника" onSubmit={editEmployee} onMouseDown={(event) => event.stopPropagation()}>
          <header><h2>Редактирование сотрудника</h2><p>Пароль нельзя посмотреть: можно только задать новый. После смены пароля прежние сеансы сотрудника завершатся.</p></header>
          <label><span>Логин латиницей</span><input value={editingUser.username} required minLength={3} maxLength={80} autoCapitalize="none" onChange={(event) => setEditingUser({ ...editingUser, username: event.target.value })} /></label>
          <label><span>Имя сотрудника</span><input value={editingUser.displayName} required maxLength={160} onChange={(event) => setEditingUser({ ...editingUser, displayName: event.target.value })} /></label>
          <label><span>Роль</span><select value={editingUser.role} onChange={(event) => setEditingUser({ ...editingUser, role: event.target.value })}><option value="manager">Менеджер</option><option value="estimator">Сметчик</option><option value="viewer">Просмотр</option><option value="admin">Администратор</option></select></label>
          <label className="team-user-active"><input type="checkbox" checked={editingUser.active} onChange={(event) => setEditingUser({ ...editingUser, active: event.target.checked })} /> Учётная запись активна</label>
          <label><span>Новый пароль (если нужно изменить)</span><PasswordInput ariaLabel="Новый пароль сотрудника" value={editingUser.newPassword} minLength={12} autoComplete="new-password" placeholder="Не менее 12 символов" onChange={(event) => setEditingUser({ ...editingUser, newPassword: event.target.value })} /></label>
          <label><span>Текущий пароль администратора для подтверждения</span><PasswordInput ariaLabel="Пароль администратора для подтверждения" value={editingUser.adminPassword} autoComplete="current-password" required onChange={(event) => setEditingUser({ ...editingUser, adminPassword: event.target.value })} /></label>
          <footer><button type="button" className="button secondary" onClick={() => setEditingUser(null)}>Отмена</button><button className="button" disabled={savingUser}>{savingUser ? 'Сохраняем…' : 'Сохранить изменения'}</button></footer>
        </form>
      </div> : null}
      {deleteTarget ? <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
        <form className="modal delete-project-dialog" role="dialog" aria-modal="true" onSubmit={removeItem} onMouseDown={(event) => event.stopPropagation()}>
          <header><div><h2>{deleteTarget.kind === 'intake' ? 'Удалить анкету?' : 'Удалить проект?'}</h2><p>{deleteTarget.kind === 'intake' ? `Анкета ${deleteTarget.item.public_number} исчезнет из входящих, но останется в архиве и журнале действий.` : `«${deleteTarget.item.name}» исчезнет из общего списка, но останется в архиве и журнале действий.`}</p></div></header>
          <label><span>Пароль администратора</span><PasswordInput autoFocus autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} ariaLabel="Пароль администратора" required /></label>
          <footer><button type="button" className="button secondary" onClick={() => setDeleteTarget(null)}>Отмена</button><button className="button danger" disabled={deleting}>{deleting ? "Удаляем…" : deleteTarget.kind === 'intake' ? "Удалить анкету" : "Удалить проект"}</button></footer>
        </form>
      </div> : null}
    </section>
  );
}
