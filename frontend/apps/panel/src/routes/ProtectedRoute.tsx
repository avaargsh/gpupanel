import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useGetCurrentUserQuery } from '@/api/authApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAppSelector } from '@/store/hooks';

/** Cached browser identity is a hint; the server session is checked before mounting privileged views. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
    const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
    const location = useLocation();
    const session = useGetCurrentUserQuery(undefined, { skip: !isAuthenticated, refetchOnMountOrArgChange: true });
    if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    if (session.isFetching) return <div className="grid min-h-[40vh] place-items-center"><Spinner className="size-5 text-muted-foreground" /></div>;
    if (session.isError || !session.currentData?.name) return <div className="p-6">
        <Alert variant="destructive">
            <AlertDescription className="flex items-center gap-3">
                <span>无法验证登录会话 / Cannot verify session</span>
                <Button size="sm" variant="outline" onClick={() => session.refetch()}>重试 / Retry</Button>
            </AlertDescription>
        </Alert>
    </div>;
    return <>{children}</>;
}
