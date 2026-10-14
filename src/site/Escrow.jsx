import { ArrowUpRight, House, ShieldCheck } from "lucide-react";

export default function Escrow() {
  return (
    <section className="escrow-section section" id="escrow" data-reveal>
      <div className="escrow-card">
        <div className="escrow-copy">
          <span className="section-number">Безопасные расчёты</span>
          <h2>Строительство через<br />эскроу-счёт.</h2>
          <p>
            Деньги заказчика размещаются в банке и перечисляются подрядчику
            после выполнения условий договора. Возможность такой схемы для
            вашего проекта обсудим до заключения договора.
          </p>
          <details className="escrow-details">
            <summary>Как это работает <ArrowUpRight size={19} aria-hidden="true" /></summary>
            <ol>
              <li><strong>Согласуем проект и договор.</strong> Уточним, подходит ли строительство с эскроу для выбранной комплектации.</li>
              <li><strong>Откроете счёт в банке.</strong> Средства размещаются на нём на условиях банка и договора.</li>
              <li><strong>Дом построен.</strong> Банк перечисляет средства подрядчику после выполнения предусмотренных условий.</li>
            </ol>
            <a href="https://domrfbank.ru/escrow/" target="_blank" rel="noopener noreferrer">
              Условия счёта на сайте Банка ДОМ.РФ <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </details>
        </div>
        <div className="escrow-mark" aria-hidden="true">
          <ShieldCheck className="escrow-shield" strokeWidth={1.15} />
          <div className="escrow-mark-bottom">
            <House strokeWidth={1.15} />
            <span />
            <strong>БАНК</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
