import type { LucideIcon } from 'lucide-react';
import { CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';

type Guide = {
  title?: string;
  items: string[];
};

type Props = {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  guide?: Guide;
};

export default function ViewHeader({
  eyebrow = 'Oficina Virtual',
  title,
  description,
  icon: Icon,
  meta,
  actions,
  guide,
}: Props) {
  return (
    <header className="onyx-view-header shrink-0">
      <div className="onyx-view-header__main">
        {Icon && (
          <div className="onyx-view-header__icon" aria-hidden="true">
            <Icon size={18} strokeWidth={1.7} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="onyx-view-header__eyebrow">{eyebrow}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="onyx-view-header__title">{title}</h1>
            {meta}
          </div>
          <p className="onyx-view-header__description">{description}</p>
        </div>
        {(actions || guide) && (
          <div className="onyx-view-header__tools">
            {actions}
            {guide && (
              <details className="onyx-guide">
                <summary aria-label="Ver recomendaciones de uso">
                  <CircleHelp size={16} strokeWidth={1.8} />
                  <span>Uso recomendado</span>
                </summary>
                <div className="onyx-guide__content">
                  <div className="onyx-guide__title">{guide.title ?? 'Antes de continuar'}</div>
                  <ul>
                    {guide.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
