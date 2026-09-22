import { Component } from "react";

export default class ScreenErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Не удалось открыть раздел калькулятора", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section className="screen-load-error" role="alert">
        <h1>Не удалось открыть раздел</h1>
        <p>
          Данные проекта не удалены. Можно вернуться к плану или обновить
          калькулятор, чтобы загрузить свежую версию файлов.
        </p>
        <div className="screen-load-error-actions">
          <button className="button primary" onClick={() => window.location.reload()}>
            Обновить калькулятор
          </button>
          <button className="button secondary" onClick={this.props.onBack}>
            Вернуться к плану
          </button>
        </div>
      </section>
    );
  }
}
