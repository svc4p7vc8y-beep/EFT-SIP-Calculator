import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { useTeam } from "../cloud/TeamContext.jsx";

export default function TeamLogin() {
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
          <p>Проверяем защищённую сессию…</p>
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
        <p>Калькулятор, проекты и заявки доступны только сотрудникам ЭФТ.</p>
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
          <input
            type="password"
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
      </form>
    </div>
  );
}
