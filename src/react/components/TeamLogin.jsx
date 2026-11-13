import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { useTeam } from "../cloud/TeamContext.jsx";
import { PasswordInput } from "./ui.jsx";

export default function TeamLogin({ onClose }) {
  const team = useTeam();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!team.ready)
    return (
      <div className="team-gate">
        <div className="team-login-card">
          <span className="team-login-mark">
            <LockKeyhole />
          </span>
          <h1>Рабочее пространство ЭФТ</h1>
          <p>Проверяем защищённую сессию…</p><button type="button" className="button secondary" onClick={()=>{team.enterOffline();onClose?.();}}>Продолжить локально</button>
        </div>
      </div>
    );
  if (team.user || !team.required) return null;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await team.login(form.username, form.password);
      onClose?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="team-gate">
      <form className="team-login-card" onSubmit={submit}>
        <span className="team-login-mark">
          <LockKeyhole />
        </span>
        <p className="eyebrow">Закрытая система</p>
        <h1>Вход сотрудника</h1>
        <p>Для общих проектов и серверного сохранения войдите. При сбое можно продолжить работу с локальными проектами.</p>
        {team.error ? (
          <div className="team-login-warning">
            Сервер хранения: {team.error}
          </div>
        ) : null}
        <label>
          Логин
          <input
            autoComplete="username"
            value={form.username}
            onChange={(event) =>
              setForm({ ...form, username: event.target.value })
            }
            required
          />
        </label>
        <label>
          Пароль
          <PasswordInput
            ariaLabel="Пароль сотрудника"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
            required
          />
        </label>
        {error ? (
          <div className="team-login-error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="button" disabled={busy}>
          {busy ? (
            "Входим…"
          ) : (
            <>
              <LogIn />
              Войти
            </>
          )}
        </button>
        <button type="button" className="button secondary" onClick={()=>{team.enterOffline();onClose?.();}}>Продолжить локально</button>
        <small>Изменения сохраняются на этом устройстве. Серверные файлы и синхронизация будут доступны после входа.</small>
        {onClose?<button type="button" className="button secondary" onClick={onClose}>Вернуться к проекту</button>:null}
      </form>
    </div>
  );
}
