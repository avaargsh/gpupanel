import type { ReactNode } from 'react';

/** Shared management-page title: preserve feature-owned tools and tabs below it. */
export default function ManagementPageHeader({ title, description, actions }: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <header className="management-page-header">
            <div className="management-page-heading">
                <h1>{title}</h1>
                {description && <p>{description}</p>}
            </div>
            {actions && <div className="management-page-actions">{actions}</div>}
        </header>
    );
}
